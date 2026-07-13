import "dotenv/config"
import mongoose from "mongoose"
import dbConnect from "../src/core/database/db"
import { FeedbackAgentRunModel } from "../src/features/feedback/api/feedback-agent-run.model"
import { FeedbackModel } from "../src/features/feedback/api/feedback.model"
import { commitAllChanges, ensureFeedbackWorktree, getWorktreeStatusSnapshot, hasWorktreeChanges, pushBranch, removeWorktree } from "../src/features/feedback/services/feedback-git-service"
import { createPullRequest, mergePullRequest } from "../src/features/feedback/services/feedback-github-service"
import { createFeedbackTimelineEvent } from "../src/features/feedback/services/feedback-timeline-service"
import { exportOpenCodeSession, isRecoverableOpenCodeTransportError, parseOpenCodeStreamLine, runOpenCode } from "../src/features/feedback/services/opencode/opencode-cli-service"
import { bumpAppPatchVersion } from "../src/features/feedback/services/feedback-version-service"

const POLL_ONCE = process.argv.includes("--once")
const RECOVER_ONLY = process.argv.includes("--recover-only")
const POLL_INTERVAL_MS = 5000
const STALE_RUNNING_MS = Number(process.env.FEEDBACK_AGENT_STALE_RUNNING_MS ?? 2 * 60 * 1000)
const PROJECT_DIR = process.env.FEEDBACK_AGENT_PROJECT_DIR ?? process.cwd()
const MAX_WORKER_ERROR_LENGTH = Number(process.env.FEEDBACK_AGENT_ERROR_MAX_LENGTH ?? 12000)
const EXPORT_RECOVERY_ATTEMPTS = Number(process.env.FEEDBACK_OPENCODE_EXPORT_RECOVERY_ATTEMPTS ?? 6)
const EXPORT_RECOVERY_DELAY_MS = Number(process.env.FEEDBACK_OPENCODE_EXPORT_RECOVERY_DELAY_MS ?? 10000)
const EXPORT_RECOVERY_MAX_DELAY_MS = Number(process.env.FEEDBACK_OPENCODE_EXPORT_RECOVERY_MAX_DELAY_MS ?? 60000)
const EXPORT_RECOVERY_MIN_TEXT_LENGTH = Number(process.env.FEEDBACK_OPENCODE_EXPORT_RECOVERY_MIN_TEXT_LENGTH ?? 200)
const CODE_RECOVERY_ATTEMPTS = Number(process.env.FEEDBACK_OPENCODE_CODE_RECOVERY_ATTEMPTS ?? 60)
const CODE_RECOVERY_DELAY_MS = Number(process.env.FEEDBACK_OPENCODE_CODE_RECOVERY_DELAY_MS ?? 10000)
const CODE_RECOVERY_STABLE_CHECKS = Number(process.env.FEEDBACK_OPENCODE_CODE_RECOVERY_STABLE_CHECKS ?? 3)

function log(message: string, metadata?: Record<string, unknown>) {
    const suffix = metadata ? ` ${JSON.stringify(metadata)}` : ""
    console.log(`[feedback-worker] ${new Date().toISOString()} ${message}${suffix}`)
}

function sanitizeProgressLine(line: string) {
    const parsed = parseOpenCodeStreamLine(line)
    const message = parsed.summary?.trim()
    if (!message || message === "Nova etapa iniciada.") return undefined
    return message.length > 1200 ? `${message.slice(0, 1200)}...` : message
}

function truncateWorkerText(value: string, maxLength = MAX_WORKER_ERROR_LENGTH) {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength)}\n\n[conteúdo truncado: ${value.length} caracteres no total]`
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function createOpenCodeSessionTitle(feedback: { _id: unknown; title: string }) {
    const shortId = String(feedback._id).slice(-8)
    const title = feedback.title.replace(/\s+/g, " ").trim()
    const value = `Feedback ${shortId}: ${title}`
    return value.length <= 90 ? value : `${value.slice(0, 87)}...`
}

async function safeCreateFeedbackTimelineEvent(input: Parameters<typeof createFeedbackTimelineEvent>[0]) {
    try {
        return await createFeedbackTimelineEvent(input)
    } catch (error) {
        log("failed to create timeline event", {
            feedbackId: String(input.feedbackId),
            type: input.type,
            error: error instanceof Error ? error.message : String(error),
        })
        return null
    }
}

async function persistOpenCodeSession(input: { feedbackId: string; runId: string; sessionId: string }) {
    const feedback = await FeedbackModel.findById(input.feedbackId)
    const run = await FeedbackAgentRunModel.findById(input.runId)
    const alreadyKnown = feedback?.opencodeSessionId === input.sessionId && run?.opencodeSessionId === input.sessionId

    if (feedback && feedback.opencodeSessionId !== input.sessionId) {
        feedback.opencodeSessionId = input.sessionId
        feedback.lastAgentRunId = input.runId
        await feedback.save()
    }

    if (run && run.opencodeSessionId !== input.sessionId) {
        run.opencodeSessionId = input.sessionId
        await run.save()
    }

    if (!alreadyKnown) {
        await safeCreateFeedbackTimelineEvent({
            feedbackId: input.feedbackId,
            type: "status_changed",
            actorType: "agent",
            actorName: "OpenCode",
            message: `Sessão OpenCode conectada: ${input.sessionId}.`,
            metadata: {
                runId: input.runId,
                opencodeSessionId: input.sessionId,
            },
            visibility: "admin",
        })
    }
}

function createProgressReporter(input: { feedbackId: string; runId: string }) {
    let lastPersistedAt = 0
    const throttleMs = Number(process.env.FEEDBACK_AGENT_PROGRESS_THROTTLE_MS ?? 5000)

    return async (source: "stdout" | "stderr", line: string) => {
        const sanitized = sanitizeProgressLine(line)
        const parsed = parseOpenCodeStreamLine(line)
        if (parsed.sessionId) await persistOpenCodeSession({ feedbackId: input.feedbackId, runId: input.runId, sessionId: parsed.sessionId })
        if (!sanitized) return

        log(`opencode ${source}`, { runId: input.runId, line: sanitized })

        const now = Date.now()
        if (now - lastPersistedAt < throttleMs) return
        lastPersistedAt = now

        await safeCreateFeedbackTimelineEvent({
            feedbackId: input.feedbackId,
            type: "agent_progress",
            actorType: "agent",
            actorName: "OpenCode",
            message: sanitized,
            metadata: {
                runId: input.runId,
                source,
                progressKind: parsed.kind,
            },
            visibility: "admin",
        })
    }
}

async function recoverStaleRunningRuns() {
    const staleStartedBefore = new Date(Date.now() - STALE_RUNNING_MS)
    const staleRuns = await FeedbackAgentRunModel.find({
        status: "running",
        startedAt: { $lt: staleStartedBefore },
    }).limit(20)

    for (const run of staleRuns) {
        const feedback = await FeedbackModel.findById(run.feedbackId)
        if (feedback && (run.kind === "implement" || run.kind === "iterate")) {
            const sessionId = run.opencodeSessionId || feedback.opencodeSessionId
            const worktreePath = run.worktreePath || feedback.worktreePath
            const branchName = run.branchName || feedback.branchName
            if (sessionId && worktreePath && branchName) {
                log("attempting stale code run recovery", { runId: String(run._id), feedbackId: String(feedback._id), sessionId, worktreePath })
                const recovered = await recoverCodeRunFromExport({
                    feedbackId: String(feedback._id),
                    runId: String(run._id),
                    kind: run.kind,
                    modelName: run.modelName,
                    sessionId,
                    worktreePath,
                    branchName,
                })
                if (recovered) continue
            }
        }

        run.status = "failed"
        run.finishedAt = new Date()
        run.exitCode = 1
        run.errorMessage = "Execução anterior foi interrompida ou ficou sem heartbeat do worker"
        await run.save()

        if (!feedback) continue

        feedback.developmentStatus = "falhou"
        feedback.lastAgentRunId = String(run._id)
        await feedback.save()

        await safeCreateFeedbackTimelineEvent({
            feedbackId: feedback._id,
            type: "agent_failed",
            actorType: "system",
            actorName: "Worker",
            message: "Execução anterior marcada como falha porque o worker foi interrompido ou ficou sem resposta.",
            metadata: { runId: String(run._id), staleRunningMs: STALE_RUNNING_MS },
        })

        log("recovered stale running run", { runId: String(run._id), feedbackId: String(feedback._id) })
    }
}

async function completePlanRun(input: { runId: string; feedbackId: string; modelName: string; text: string; sessionId?: string; stderr?: string; recovered?: boolean }) {
    const run = await FeedbackAgentRunModel.findById(input.runId)
    const feedback = await FeedbackModel.findById(input.feedbackId)
    if (!run || !feedback) return

    run.status = "succeeded"
    run.finishedAt = new Date()
    run.exitCode = 0
    run.opencodeSessionId = input.sessionId
    await run.save()

    feedback.developmentStatus = "plano_pronto"
    feedback.selectedModel = input.modelName
    if (input.sessionId) feedback.opencodeSessionId = input.sessionId
    feedback.lastAgentRunId = input.runId
    await feedback.save()

    await safeCreateFeedbackTimelineEvent({
        feedbackId: feedback._id,
        type: "plan_created",
        actorType: "agent",
        actorName: "OpenCode",
        message: input.text || "Plano gerado pelo OpenCode, mas a saída textual estava vazia.",
        metadata: {
            runId: input.runId,
            model: input.modelName,
            opencodeSessionId: input.sessionId,
            recoveredFromExport: input.recovered || undefined,
        },
    })

    await safeCreateFeedbackTimelineEvent({
        feedbackId: feedback._id,
        type: "agent_completed",
        actorType: "agent",
        actorName: "OpenCode",
        message: input.recovered ? "Geração de plano concluída após recuperar o resultado da sessão OpenCode." : "Geração de plano concluída.",
        metadata: {
            runId: input.runId,
            stderr: input.stderr?.slice(0, 4000),
            recoveredFromExport: input.recovered || undefined,
        },
        visibility: "admin",
    })
}

async function recoverPlanFromExport(input: { feedbackId: string; runId: string; modelName: string; sessionId: string }) {
    for (let attempt = 1; attempt <= EXPORT_RECOVERY_ATTEMPTS; attempt += 1) {
        const delay = Math.min(EXPORT_RECOVERY_DELAY_MS * attempt, EXPORT_RECOVERY_MAX_DELAY_MS)
        await safeCreateFeedbackTimelineEvent({
            feedbackId: input.feedbackId,
            type: "agent_progress",
            actorType: "agent",
            actorName: "OpenCode",
            message: `Conexão com OpenCode caiu. Tentando recuperar o plano da sessão (${attempt}/${EXPORT_RECOVERY_ATTEMPTS})...`,
            metadata: { runId: input.runId, opencodeSessionId: input.sessionId, recoveryAttempt: attempt },
            visibility: "admin",
        })
        await sleep(delay)

        try {
            const exported = await exportOpenCodeSession(input.sessionId)
            if (exported.text.trim().length >= EXPORT_RECOVERY_MIN_TEXT_LENGTH) {
                await completePlanRun({
                    runId: input.runId,
                    feedbackId: input.feedbackId,
                    modelName: input.modelName,
                    sessionId: input.sessionId,
                    text: exported.text,
                    recovered: true,
                })
                log("recovered opencode plan from export", { runId: input.runId, feedbackId: input.feedbackId, sessionId: input.sessionId, attempt })
                return true
            }

            log("opencode export did not contain final plan yet", { runId: input.runId, sessionId: input.sessionId, attempt, textLength: exported.text.length })
        } catch (error) {
            log("opencode export recovery failed", { runId: input.runId, sessionId: input.sessionId, attempt, error: error instanceof Error ? error.message : String(error) })
        }
    }

    return false
}

async function completeCodeRun(input: {
    runId: string
    feedbackId: string
    kind: "implement" | "iterate"
    worktreePath: string
    branchName: string
    sessionId?: string
    resultText?: string
    recovered?: boolean
}) {
    const run = await FeedbackAgentRunModel.findById(input.runId)
    const feedback = await FeedbackModel.findById(input.feedbackId)
    if (!run || !feedback) return false

    if (input.sessionId) feedback.opencodeSessionId = input.sessionId

    if (!(await hasWorktreeChanges(input.worktreePath))) {
        throw new Error("OpenCode terminou sem alterações no worktree")
    }

    const commitSha = await commitAllChanges({
        worktreePath: input.worktreePath,
        message: `${input.kind === "implement" ? "feat" : "fix"}: atualiza feedback ${feedback._id}`,
    })
    await pushBranch({ worktreePath: input.worktreePath, branchName: input.branchName })

    let pullRequestUrl = feedback.pullRequestUrl
    let pullRequestNumber = feedback.pullRequestNumber
    if (!pullRequestUrl) {
        const pr = await createPullRequest({
            cwd: input.worktreePath,
            branchName: input.branchName,
            title: feedback.title,
            body: `Implementação agêntica do feedback ${feedback._id}.\n\nSessão OpenCode: ${input.sessionId || "não identificada"}`,
        })
        pullRequestUrl = pr.url
        pullRequestNumber = pr.number

        await safeCreateFeedbackTimelineEvent({
            feedbackId: feedback._id,
            type: "pull_request_created",
            actorType: "system",
            actorName: "GitHub CLI",
            message: `Pull request criado: ${pullRequestUrl}`,
            metadata: { pullRequestUrl, pullRequestNumber, recoveredFromExport: input.recovered || undefined },
        })
    } else {
        await safeCreateFeedbackTimelineEvent({
            feedbackId: feedback._id,
            type: "pull_request_updated",
            actorType: "system",
            actorName: "GitHub CLI",
            message: `Pull request atualizado: ${pullRequestUrl}`,
            metadata: { pullRequestUrl, commitSha, recoveredFromExport: input.recovered || undefined },
        })
    }

    run.status = "succeeded"
    run.finishedAt = new Date()
    run.exitCode = 0
    run.errorMessage = undefined
    run.opencodeSessionId = input.sessionId
    run.worktreePath = input.worktreePath
    run.branchName = input.branchName
    run.commitSha = commitSha
    run.pullRequestUrl = pullRequestUrl
    await run.save()

    feedback.developmentStatus = "aguardando_teste"
    feedback.pullRequestUrl = pullRequestUrl
    if (pullRequestNumber) feedback.pullRequestNumber = pullRequestNumber
    feedback.lastAgentRunId = input.runId
    feedback.worktreePath = input.worktreePath
    feedback.branchName = input.branchName
    await feedback.save()

    await safeCreateFeedbackTimelineEvent({
        feedbackId: feedback._id,
        type: "agent_completed",
        actorType: "agent",
        actorName: "OpenCode",
        message: input.resultText || (input.recovered ? "Implementação recuperada da sessão OpenCode após queda de conexão." : "Implementação concluída pelo OpenCode."),
        metadata: {
            runId: input.runId,
            commitSha,
            opencodeSessionId: input.sessionId,
            recoveredFromExport: input.recovered || undefined,
        },
    })

    log("completed code run", { runId: input.runId, feedbackId: input.feedbackId, commitSha, pullRequestUrl, recovered: input.recovered || false })
    return true
}

async function recoverCodeRunFromExport(input: {
    feedbackId: string
    runId: string
    kind: "implement" | "iterate"
    modelName: string
    sessionId: string
    worktreePath: string
    branchName: string
}) {
    let lastSnapshot = ""
    let stableChecks = 0
    let latestText = ""

    for (let attempt = 1; attempt <= CODE_RECOVERY_ATTEMPTS; attempt += 1) {
        if (attempt === 1 || attempt % 3 === 0) {
            await safeCreateFeedbackTimelineEvent({
                feedbackId: input.feedbackId,
                type: "agent_progress",
                actorType: "agent",
                actorName: "OpenCode",
                message: `Conexão com OpenCode caiu. Aguardando alterações estáveis no worktree (${attempt}/${CODE_RECOVERY_ATTEMPTS})...`,
                metadata: {
                    runId: input.runId,
                    opencodeSessionId: input.sessionId,
                    recoveryAttempt: attempt,
                    recoveryKind: "code_export_worktree",
                },
                visibility: "admin",
            })
        }

        try {
            const exported = await exportOpenCodeSession(input.sessionId)
            if (exported.text.trim()) latestText = exported.text.trim()
        } catch (error) {
            log("opencode code export recovery failed", { runId: input.runId, sessionId: input.sessionId, attempt, error: error instanceof Error ? error.message : String(error) })
        }

        const snapshot = await getWorktreeStatusSnapshot(input.worktreePath)
        if (!snapshot) {
            stableChecks = 0
            lastSnapshot = ""
            log("code recovery waiting for worktree changes", { runId: input.runId, sessionId: input.sessionId, attempt })
            await sleep(CODE_RECOVERY_DELAY_MS)
            continue
        }

        if (snapshot === lastSnapshot) stableChecks += 1
        else {
            lastSnapshot = snapshot
            stableChecks = 1
        }

        log("code recovery observed worktree changes", {
            runId: input.runId,
            sessionId: input.sessionId,
            attempt,
            stableChecks,
            requiredStableChecks: CODE_RECOVERY_STABLE_CHECKS,
        })

        if (stableChecks >= CODE_RECOVERY_STABLE_CHECKS) {
            await safeCreateFeedbackTimelineEvent({
                feedbackId: input.feedbackId,
                type: "agent_progress",
                actorType: "agent",
                actorName: "OpenCode",
                message: "Alterações estáveis detectadas. Criando commit e pull request da implementação recuperada...",
                metadata: { runId: input.runId, opencodeSessionId: input.sessionId, recoveryKind: "code_export_worktree" },
                visibility: "admin",
            })

            return completeCodeRun({
                runId: input.runId,
                feedbackId: input.feedbackId,
                kind: input.kind,
                worktreePath: input.worktreePath,
                branchName: input.branchName,
                sessionId: input.sessionId,
                resultText: latestText ? `Implementação recuperada da sessão OpenCode após queda de conexão.\n\n${latestText}` : undefined,
                recovered: true,
            })
        }

        await sleep(CODE_RECOVERY_DELAY_MS)
    }

    log("code recovery exhausted", { runId: input.runId, feedbackId: input.feedbackId, sessionId: input.sessionId })
    return false
}

async function processPlanRun(runId: string) {
    const run = await FeedbackAgentRunModel.findById(runId)
    if (!run || run.status !== "queued" || run.kind !== "plan") return
    log("picked run", { runId, kind: run.kind, feedbackId: String(run.feedbackId) })

    const feedback = await FeedbackModel.findById(run.feedbackId)
    if (!feedback) {
        run.status = "failed"
        run.errorMessage = "Feedback não encontrado"
        run.finishedAt = new Date()
        await run.save()
        return
    }

    run.status = "running"
    run.startedAt = new Date()
    run.opencodeSessionId = feedback.opencodeSessionId
    await run.save()

    await safeCreateFeedbackTimelineEvent({
        feedbackId: feedback._id,
        type: "agent_started",
        actorType: "agent",
        actorName: "OpenCode",
        message: `OpenCode iniciou a geração do plano com o modelo ${run.modelName}.`,
        metadata: {
            runId: String(run._id),
            model: run.modelName,
        },
    })

    try {
        const reportProgress = createProgressReporter({ feedbackId: String(feedback._id), runId: String(run._id) })
        log("starting opencode plan", { runId: String(run._id), feedbackId: String(feedback._id), model: run.modelName, sessionId: feedback.opencodeSessionId ?? null })
        const result = await runOpenCode({
            prompt: run.prompt,
            model: run.modelName,
            sessionId: feedback.opencodeSessionId,
            dir: PROJECT_DIR,
            title: feedback.opencodeSessionId ? undefined : createOpenCodeSessionTitle(feedback),
        }, {
            onStdoutLine: (line) => reportProgress("stdout", line),
            onStderrLine: (line) => reportProgress("stderr", line),
            onSessionId: (sessionId) => persistOpenCodeSession({ feedbackId: String(feedback._id), runId: String(run._id), sessionId }),
        })

        const currentFeedback = await FeedbackModel.findById(feedback._id)
        const sessionId = result.sessionId || currentFeedback?.opencodeSessionId || feedback.opencodeSessionId

        await completePlanRun({
            runId: String(run._id),
            feedbackId: String(feedback._id),
            modelName: run.modelName,
            sessionId,
            text: result.text,
            stderr: result.stderr,
        })
        log("completed opencode plan", { runId: String(run._id), feedbackId: String(feedback._id), sessionId: sessionId ?? null })
    } catch (error) {
        const errorMessage = truncateWorkerText(error instanceof Error ? error.message : "Erro desconhecido ao executar OpenCode")
        const refreshedRun = await FeedbackAgentRunModel.findById(run._id)
        const refreshedFeedback = await FeedbackModel.findById(feedback._id)
        const sessionId = refreshedRun?.opencodeSessionId || refreshedFeedback?.opencodeSessionId || feedback.opencodeSessionId

        if (sessionId && isRecoverableOpenCodeTransportError(error)) {
            log("attempting opencode export recovery", { runId: String(run._id), feedbackId: String(feedback._id), sessionId, error: errorMessage })
            const recovered = await recoverPlanFromExport({
                feedbackId: String(feedback._id),
                runId: String(run._id),
                modelName: run.modelName,
                sessionId,
            })
            if (recovered) return
        }

        run.status = "failed"
        run.finishedAt = new Date()
        run.exitCode = 1
        run.errorMessage = errorMessage
        await run.save()

        feedback.developmentStatus = "falhou"
        feedback.lastAgentRunId = String(run._id)
        await feedback.save()

        await safeCreateFeedbackTimelineEvent({
            feedbackId: feedback._id,
            type: "agent_failed",
            actorType: "agent",
            actorName: "OpenCode",
            message: `Falha ao gerar plano: ${errorMessage}`,
            metadata: {
                runId: String(run._id),
                model: run.modelName,
            },
        })
        log("failed opencode plan", { runId: String(run._id), feedbackId: String(feedback._id), error: errorMessage })
    }
}

async function processCodeRun(runId: string) {
    const run = await FeedbackAgentRunModel.findById(runId)
    if (!run || run.status !== "queued" || (run.kind !== "implement" && run.kind !== "iterate")) return
    log("picked run", { runId, kind: run.kind, feedbackId: String(run.feedbackId) })

    const feedback = await FeedbackModel.findById(run.feedbackId)
    if (!feedback) throw new Error("Feedback não encontrado")

    run.status = "running"
    run.startedAt = new Date()
    run.opencodeSessionId = feedback.opencodeSessionId

    const worktree = feedback.worktreePath && feedback.branchName
        ? { worktreePath: feedback.worktreePath, branchName: feedback.branchName }
        : await ensureFeedbackWorktree({ feedbackId: String(feedback._id), title: feedback.title })

    run.worktreePath = worktree.worktreePath
    run.branchName = worktree.branchName
    await run.save()

    feedback.worktreePath = worktree.worktreePath
    feedback.branchName = worktree.branchName
    await feedback.save()

    await safeCreateFeedbackTimelineEvent({
        feedbackId: feedback._id,
        type: "agent_started",
        actorType: "agent",
        actorName: "OpenCode",
        message: `OpenCode iniciou ${run.kind === "implement" ? "a implementação" : "uma nova iteração"} com o modelo ${run.modelName}.`,
        metadata: { runId: String(run._id), model: run.modelName, branchName: worktree.branchName },
    })

    try {
        const reportProgress = createProgressReporter({ feedbackId: String(feedback._id), runId: String(run._id) })
        log("starting opencode code run", { runId: String(run._id), feedbackId: String(feedback._id), model: run.modelName, sessionId: feedback.opencodeSessionId ?? null, worktreePath: worktree.worktreePath })
        const result = await runOpenCode({
            prompt: run.prompt,
            model: run.modelName,
            sessionId: feedback.opencodeSessionId,
            dir: worktree.worktreePath,
            title: feedback.opencodeSessionId ? undefined : createOpenCodeSessionTitle(feedback),
        }, {
            onStdoutLine: (line) => reportProgress("stdout", line),
            onStderrLine: (line) => reportProgress("stderr", line),
            onSessionId: (sessionId) => persistOpenCodeSession({ feedbackId: String(feedback._id), runId: String(run._id), sessionId }),
        })

        const currentFeedback = await FeedbackModel.findById(feedback._id)
        const sessionId = result.sessionId || currentFeedback?.opencodeSessionId || feedback.opencodeSessionId
        await completeCodeRun({
            runId: String(run._id),
            feedbackId: String(feedback._id),
            kind: run.kind,
            worktreePath: worktree.worktreePath,
            branchName: worktree.branchName,
            sessionId,
            resultText: result.text || "Implementação concluída pelo OpenCode.",
        })
    } catch (error) {
        const refreshedRun = await FeedbackAgentRunModel.findById(run._id)
        const refreshedFeedback = await FeedbackModel.findById(feedback._id)
        const sessionId = refreshedRun?.opencodeSessionId || refreshedFeedback?.opencodeSessionId || feedback.opencodeSessionId
        const worktreePath = refreshedRun?.worktreePath || refreshedFeedback?.worktreePath || worktree.worktreePath
        const branchName = refreshedRun?.branchName || refreshedFeedback?.branchName || worktree.branchName

        if (sessionId && worktreePath && branchName && isRecoverableOpenCodeTransportError(error)) {
            log("attempting opencode code recovery", { runId: String(run._id), feedbackId: String(feedback._id), sessionId, worktreePath, error: error instanceof Error ? error.message : String(error) })
            const recovered = await recoverCodeRunFromExport({
                feedbackId: String(feedback._id),
                runId: String(run._id),
                kind: run.kind,
                modelName: run.modelName,
                sessionId,
                worktreePath,
                branchName,
            })
            if (recovered) return
        }

        await failRun(runId, String(feedback._id), error)
    }
}

async function processMergeRun(runId: string) {
    const run = await FeedbackAgentRunModel.findById(runId)
    if (!run || run.status !== "queued" || run.kind !== "merge") return
    log("picked run", { runId, kind: run.kind, feedbackId: String(run.feedbackId) })

    const feedback = await FeedbackModel.findById(run.feedbackId)
    if (!feedback) throw new Error("Feedback não encontrado")
    if (!feedback.worktreePath || !feedback.pullRequestNumber) throw new Error("Feedback sem worktree ou pull request para merge")

    run.status = "running"
    run.startedAt = new Date()
    await run.save()

    try {
        const nextVersion = await bumpAppPatchVersion(feedback.worktreePath)
        const commitSha = await commitAllChanges({
            worktreePath: feedback.worktreePath,
            message: `chore: bump version ${nextVersion}`,
        })
        await pushBranch({ worktreePath: feedback.worktreePath, branchName: feedback.branchName || "HEAD" })
        await mergePullRequest({ cwd: feedback.worktreePath, pullRequestNumber: feedback.pullRequestNumber })
        await removeWorktree(feedback.worktreePath)

        run.status = "succeeded"
        run.finishedAt = new Date()
        run.exitCode = 0
        run.commitSha = commitSha
        await run.save()

        feedback.developmentStatus = "concluido"
        feedback.completedAt = new Date()
        feedback.worktreePath = undefined
        await feedback.save()

        await safeCreateFeedbackTimelineEvent({
            feedbackId: feedback._id,
            type: "merged",
            actorType: "system",
            actorName: "GitHub CLI",
            message: `Pull request mergeado e versão atualizada para ${nextVersion}.`,
            metadata: { commitSha, nextVersion, pullRequestNumber: feedback.pullRequestNumber },
        })

        await safeCreateFeedbackTimelineEvent({
            feedbackId: feedback._id,
            type: "cleanup_completed",
            actorType: "system",
            actorName: "Worker",
            message: "Worktree removido e feedback concluído.",
        })
    } catch (error) {
        await failRun(runId, String(feedback._id), error)
    }
}

async function failRun(runId: string, feedbackId: string, error: unknown) {
    const run = await FeedbackAgentRunModel.findById(runId)
    const feedback = await FeedbackModel.findById(feedbackId)
    const errorMessage = truncateWorkerText(error instanceof Error ? error.message : String(error))

    if (run) {
        run.status = "failed"
        run.finishedAt = new Date()
        run.exitCode = 1
        run.errorMessage = errorMessage
        await run.save()
    }

    if (feedback) {
        feedback.developmentStatus = "falhou"
        feedback.lastAgentRunId = runId
        await feedback.save()

        await safeCreateFeedbackTimelineEvent({
            feedbackId: feedback._id,
            type: "agent_failed",
            actorType: "agent",
            actorName: "Worker",
            message: `Falha na execução: ${errorMessage}`,
            metadata: { runId },
        })
    }
}

async function recoverFailedCodeRuns() {
    const runs = await FeedbackAgentRunModel.find({
        status: "failed",
        kind: { $in: ["implement", "iterate"] },
    }).sort({ updatedAt: -1 }).limit(10)

    let recoveredCount = 0

    for (const run of runs) {
        if (!run.errorMessage || !isRecoverableOpenCodeTransportError(new Error(run.errorMessage))) continue

        const feedback = await FeedbackModel.findById(run.feedbackId)
        if (!feedback) continue

        const sessionId = run.opencodeSessionId || feedback.opencodeSessionId
        const worktreePath = run.worktreePath || feedback.worktreePath
        const branchName = run.branchName || feedback.branchName
        if (!sessionId || !worktreePath || !branchName) continue
        const codeKind = run.kind === "implement" ? "implement" : run.kind === "iterate" ? "iterate" : undefined
        if (!codeKind) continue

        log("attempting failed code run recovery", { runId: String(run._id), feedbackId: String(feedback._id), sessionId, worktreePath })

        run.status = "running"
        run.finishedAt = undefined
        await run.save()

        feedback.developmentStatus = codeKind === "implement" ? "implementando" : "ajustes_solicitados"
        feedback.lastAgentRunId = String(run._id)
        await feedback.save()

        await safeCreateFeedbackTimelineEvent({
            feedbackId: feedback._id,
            type: "agent_progress",
            actorType: "agent",
            actorName: "Worker",
            message: "Recuperando implementação já marcada como falha após queda de conexão com OpenCode...",
            metadata: { runId: String(run._id), opencodeSessionId: sessionId, recoveryKind: "failed_code_run" },
            visibility: "admin",
        })

        const recovered = await recoverCodeRunFromExport({
            feedbackId: String(feedback._id),
            runId: String(run._id),
            kind: codeKind,
            modelName: run.modelName,
            sessionId,
            worktreePath,
            branchName,
        })

        if (recovered) {
            recoveredCount += 1
            continue
        }

        run.status = "failed"
        run.finishedAt = new Date()
        await run.save()
        feedback.developmentStatus = "falhou"
        await feedback.save()
    }

    log("finished failed code run recovery", { recoveredCount, inspected: runs.length })
}

async function processNextQueuedRun() {
    await dbConnect()

    const run = await FeedbackAgentRunModel.findOne({ status: "queued" }).sort({ createdAt: 1 })
    if (!run) return false

    if (run.kind === "plan") await processPlanRun(String(run._id))
    if (run.kind === "implement" || run.kind === "iterate") await processCodeRun(String(run._id))
    if (run.kind === "merge") await processMergeRun(String(run._id))
    return true
}

async function main() {
    log("started", { pollOnce: POLL_ONCE, recoverOnly: RECOVER_ONLY, staleRunningMs: STALE_RUNNING_MS })
    await dbConnect()
    await recoverStaleRunningRuns()

    if (RECOVER_ONLY) {
        await recoverFailedCodeRuns()
        await mongoose.disconnect()
        return
    }

    do {
        const processed = await processNextQueuedRun()
        if (POLL_ONCE) break
        if (!processed) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    } while (true)

    if (POLL_ONCE) await mongoose.disconnect()
}

main().catch((error) => {
    console.error("Feedback agent worker falhou:", error)
    process.exit(1)
})
