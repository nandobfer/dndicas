import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import type { OpenCodeModelOption } from "../../types/feedback.types"

const execFileAsync = promisify(execFile)

const OPENCODE_ATTACH_URL = process.env.OPENCODE_ATTACH_URL ?? "https://opencode.nandoburgos.dev"

export interface OpenCodeRunResult {
    stdout: string
    stderr: string
    sessionId?: string
    text: string
}

export interface OpenCodeSessionExportResult {
    stdout: string
    text: string
}

export interface OpenCodeRunCallbacks {
    onStdoutLine?: (line: string) => void | Promise<void>
    onStderrLine?: (line: string) => void | Promise<void>
    onSessionId?: (sessionId: string) => void | Promise<void>
}

export const OPENCODE_RUN_TIMEOUT_MS = Number(process.env.FEEDBACK_OPENCODE_TIMEOUT_MS ?? 20 * 60 * 1000)
const MAX_CAPTURED_STREAM_LENGTH = Number(process.env.FEEDBACK_OPENCODE_CAPTURE_MAX_LENGTH ?? 2 * 1024 * 1024)
const OPENCODE_EXPORT_TIMEOUT_MS = Number(process.env.FEEDBACK_OPENCODE_EXPORT_TIMEOUT_MS ?? 60 * 1000)

export interface ParsedOpenCodeStreamLine {
    sessionId?: string
    text?: string
    summary?: string
    kind: "text" | "tool" | "step" | "error" | "raw"
}

function appendCapped(current: string, next: string) {
    const combined = current + next
    if (combined.length <= MAX_CAPTURED_STREAM_LENGTH) return combined
    return combined.slice(combined.length - MAX_CAPTURED_STREAM_LENGTH)
}

function valueAsRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined
}

function extractSessionId(value: Record<string, unknown>) {
    const session = valueAsRecord(value.session)
    const part = valueAsRecord(value.part)
    const candidates = [value.sessionId, value.sessionID, session?.id, part?.sessionId, part?.sessionID]
    return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0)
}

export function parseOpenCodeStreamLine(line: string): ParsedOpenCodeStreamLine {
    const trimmed = line.trim()
    if (!trimmed) return { kind: "raw" }

    try {
        const event = JSON.parse(trimmed) as Record<string, unknown>
        const part = valueAsRecord(event.part)
        const sessionId = extractSessionId(event)
        const type = typeof event.type === "string" ? event.type : typeof part?.type === "string" ? part.type : undefined

        if (type === "text" && typeof part?.text === "string") {
            return { kind: "text", sessionId, text: part.text, summary: part.text }
        }

        if (typeof event.text === "string") return { kind: "text", sessionId, text: event.text, summary: event.text }
        if (typeof event.content === "string") return { kind: "text", sessionId, text: event.content, summary: event.content }
        if (typeof event.message === "string") return { kind: "text", sessionId, text: event.message, summary: event.message }

        if (type === "tool_use" || part?.type === "tool") {
            const toolName = typeof part?.tool === "string" ? part.tool : "ferramenta"
            const state = valueAsRecord(part?.state)
            const input = valueAsRecord(state?.input)
            const inputSummary = input
                ? Object.entries(input)
                    .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
                    .slice(0, 3)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(", ")
                : ""
            return {
                kind: "tool",
                sessionId,
                summary: inputSummary ? `Executou ${toolName} (${inputSummary}).` : `Executou ${toolName}.`,
            }
        }

        if (type === "step_start" || part?.type === "step-start") {
            return { kind: "step", sessionId, summary: "Nova etapa iniciada." }
        }

        return { kind: "raw", sessionId }
    } catch {
        if (trimmed.includes("cf-error-details") || trimmed.includes("Cloudflare")) {
            return { kind: "error", summary: "OpenCode retornou uma página de erro do Cloudflare/proxy." }
        }

        return { kind: "raw", summary: trimmed }
    }
}

function runWithZsh(command: string, options?: { cwd?: string }) {
    return execFileAsync("zsh", ["-ic", command], {
        cwd: options?.cwd,
        maxBuffer: 1024 * 1024 * 20,
        env: process.env,
    })
}

function shellQuote(value: string) {
    return `'${value.replaceAll("'", "'\\''")}'`
}

function truncateTitle(value: string) {
    const normalized = value.replace(/\s+/g, " ").trim()
    return normalized.length <= 90 ? normalized : `${normalized.slice(0, 87)}...`
}

export function isRecoverableOpenCodeTransportError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return /Cloudflare|cf-error-details|proxy|transport|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket|network|terminated/i.test(message)
}

export function buildOpenCodeRunCommand(input: { prompt: string; model: string; sessionId?: string; dir?: string; title?: string }) {
    const args = [
        "opencode run",
        "--attach",
        shellQuote(OPENCODE_ATTACH_URL),
        "--model",
        shellQuote(input.model),
        "--format",
        "json",
    ]

    if (input.sessionId) args.push("--session", shellQuote(input.sessionId))
    else if (input.title) args.push("--title", shellQuote(truncateTitle(input.title)))
    if (input.dir) args.push("--dir", shellQuote(input.dir))

    args.push(shellQuote(input.prompt))

    return args.join(" ")
}

export function parseOpenCodeModels(output: string): OpenCodeModelOption[] {
    const seen = new Set<string>()
    const models: OpenCodeModelOption[] = []

    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith("Provider") || line.startsWith("─") || line.startsWith("{")) continue

        const matches = line.match(/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.:-]+/g) ?? []
        for (const id of matches) {
            if (seen.has(id)) continue
            seen.add(id)
            models.push({
                id,
                label: id,
                provider: id.split("/")[0],
            })
        }
    }

    return models
}

export async function listOpenCodeModels(): Promise<OpenCodeModelOption[]> {
    const { stdout } = await runWithZsh("opencode models")
    return parseOpenCodeModels(stdout)
}

export function parseOpenCodeRunOutput(stdout: string): { sessionId?: string; text: string } {
    const textParts: string[] = []
    let sessionId: string | undefined

    for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
            const event = JSON.parse(trimmed) as Record<string, unknown>
            const maybeSessionId = extractSessionId(event)
            if (maybeSessionId) sessionId = maybeSessionId

            const parsed = parseOpenCodeStreamLine(trimmed)
            if (parsed.text) textParts.push(parsed.text)
        } catch {
            textParts.push(trimmed)
        }
    }

    return {
        sessionId,
        text: textParts.join("\n").trim(),
    }
}

function collectTextCandidates(value: unknown, candidates: string[]) {
    if (typeof value === "string") {
        const trimmed = value.trim()
        if (trimmed.length >= 40 && !trimmed.startsWith("{")) candidates.push(trimmed)
        return
    }

    if (Array.isArray(value)) {
        for (const item of value) collectTextCandidates(item, candidates)
        return
    }

    const record = valueAsRecord(value)
    if (!record) return

    for (const key of ["text", "content", "message"]) {
        const field = record[key]
        if (typeof field === "string") {
            const trimmed = field.trim()
            if (trimmed.length >= 40) candidates.push(trimmed)
        }
    }

    for (const key of ["parts", "part", "messages", "children", "data"]) {
        if (key in record) collectTextCandidates(record[key], candidates)
    }
}

export function parseOpenCodeSessionExport(output: string): { text: string } {
    try {
        const parsed = JSON.parse(output) as unknown
        const candidates: string[] = []
        collectTextCandidates(parsed, candidates)
        const planCandidate = [...candidates].reverse().find((candidate) => /##\s*Plano De Implementação/i.test(candidate))
        return { text: (planCandidate ?? candidates.at(-1) ?? "").trim() }
    } catch {
        return { text: "" }
    }
}

export async function runOpenCode(input: { prompt: string; model: string; sessionId?: string; dir?: string; timeoutMs?: number; title?: string }, callbacks?: OpenCodeRunCallbacks): Promise<OpenCodeRunResult> {
    return runOpenCodeStreaming(input, callbacks)
}

async function flushBufferedLines(buffer: { value: string }, chunk: Buffer, callback?: (line: string) => void | Promise<void>) {
    buffer.value += chunk.toString("utf8")
    const lines = buffer.value.split(/\r?\n/)
    buffer.value = lines.pop() ?? ""

    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) await callback?.(trimmed)
    }
}

async function notifySessionFromLine(line: string, callback?: (sessionId: string) => void | Promise<void>) {
    if (!callback) return
    const parsed = parseOpenCodeStreamLine(line)
    if (parsed.sessionId) await callback(parsed.sessionId)
}

async function flushRemainder(buffer: { value: string }, callback?: (line: string) => void | Promise<void>) {
    const trimmed = buffer.value.trim()
    buffer.value = ""
    if (trimmed) await callback?.(trimmed)
}

export async function runOpenCodeStreaming(
    input: { prompt: string; model: string; sessionId?: string; dir?: string; timeoutMs?: number; title?: string },
    callbacks?: OpenCodeRunCallbacks,
): Promise<OpenCodeRunResult> {
    const command = buildOpenCodeRunCommand(input)
    const timeoutMs = input.timeoutMs ?? OPENCODE_RUN_TIMEOUT_MS

    return new Promise<OpenCodeRunResult>((resolve, reject) => {
        const child = spawn("zsh", ["-ic", command], {
            cwd: input.dir,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        })

        let stdout = ""
        let stderr = ""
        let timedOut = false
        let closed = false
        let settled = false
        const stdoutBuffer = { value: "" }
        const stderrBuffer = { value: "" }

        const settleReject = (error: Error) => {
            if (settled) return
            settled = true
            reject(error)
        }

        const settleResolve = (result: OpenCodeRunResult) => {
            if (settled) return
            settled = true
            resolve(result)
        }

        const timeout = setTimeout(() => {
            timedOut = true
            child.kill("SIGTERM")
            setTimeout(() => {
                if (!closed) child.kill("SIGKILL")
            }, 5000).unref()
        }, timeoutMs)

        child.stdout.on("data", (chunk: Buffer) => {
            stdout = appendCapped(stdout, chunk.toString("utf8"))
            void flushBufferedLines(stdoutBuffer, chunk, async (line) => {
                await notifySessionFromLine(line, callbacks?.onSessionId)
                await callbacks?.onStdoutLine?.(line)
            }).catch((error) => {
                console.error("Erro ao processar stdout do OpenCode:", error)
            })
        })

        child.stderr.on("data", (chunk: Buffer) => {
            stderr = appendCapped(stderr, chunk.toString("utf8"))
            void flushBufferedLines(stderrBuffer, chunk, async (line) => {
                await notifySessionFromLine(line, callbacks?.onSessionId)
                await callbacks?.onStderrLine?.(line)
            }).catch((error) => {
                console.error("Erro ao processar stderr do OpenCode:", error)
            })
        })

        child.on("error", (error) => {
            clearTimeout(timeout)
            settleReject(error)
        })

        child.on("close", (code, signal) => {
            closed = true
            clearTimeout(timeout)
            void Promise.all([
                flushRemainder(stdoutBuffer, async (line) => {
                    await notifySessionFromLine(line, callbacks?.onSessionId)
                    await callbacks?.onStdoutLine?.(line)
                }),
                flushRemainder(stderrBuffer, async (line) => {
                    await notifySessionFromLine(line, callbacks?.onSessionId)
                    await callbacks?.onStderrLine?.(line)
                }),
            ]).finally(() => {
                if (timedOut) {
                    settleReject(new Error(`OpenCode excedeu o timeout de ${Math.round(timeoutMs / 1000)}s`))
                    return
                }

                if (code !== 0) {
                    const output = stderr.trim() || stdout.trim()
                    const suffix = output.includes("cf-error-details") || output.includes("Cloudflare")
                        ? " OpenCode retornou uma página de erro do Cloudflare/proxy."
                        : output
                            ? ` Última saída capturada: ${output.slice(0, 2000)}`
                            : " Sem saída capturada."
                    settleReject(new Error(`OpenCode terminou com código ${code ?? "desconhecido"}${signal ? ` e sinal ${signal}` : ""}.${suffix}`))
                    return
                }

                const parsed = parseOpenCodeRunOutput(stdout)

                settleResolve({
                    stdout,
                    stderr,
                    sessionId: parsed.sessionId,
                    text: parsed.text || stdout.trim(),
                })
            })
        })
    })
}

export async function exportOpenCodeSession(sessionId: string, options?: { timeoutMs?: number; sanitize?: boolean }): Promise<OpenCodeSessionExportResult> {
    const command = `opencode export ${shellQuote(sessionId)}${options?.sanitize ? " --sanitize" : ""}`
    const { stdout } = await execFileAsync("zsh", ["-ic", command], {
        maxBuffer: 1024 * 1024 * 20,
        timeout: options?.timeoutMs ?? OPENCODE_EXPORT_TIMEOUT_MS,
        env: process.env,
    })
    const parsed = parseOpenCodeSessionExport(stdout)
    return { stdout, text: parsed.text }
}
