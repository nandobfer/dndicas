import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import type { ModelMessage } from "ai"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import {
    MADDOX_CAMPAIGN_AUDIT_ENTITY,
    MADDOX_INTERVIEW_CONSUMPTION_ORIGIN,
    MADDOX_INTERVIEW_LOCK_MS,
    MADDOX_INTERVIEW_MESSAGES_MAX,
    MADDOX_INVITE_CLOSED_STATUSES,
    MADDOX_JEV_MODEL,
    isMaddoxScriptKind,
    type MaddoxScriptKind,
    type MaddoxSessionPurpose,
} from "../constants"
import { MaddoxCampaignModel, MaddoxCharacterModel, MaddoxInterviewModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCharacter, type IMaddoxInterview, type IMaddoxInterviewMessage } from "../models"
import type { MaddoxSettings } from "../schemas"
import type { MaddoxInterviewDto, MaddoxInterviewMessageDto, MaddoxInterviewStateDto, MaddoxInterviewStreamLine } from "../interview-types"
import type { MaddoxInterviewMessageInput } from "../interview-schemas"
import { changed, loadMembership } from "./campaigns"
import { notifyInterviewChanged } from "./campaign-realtime"
import { JEV_PROPOSAL_HINT, buildInterviewInstructions, createMarkerFilter, extractProposal, openingPrompt, transcriptText, type InterviewPromptContext } from "./interview-prompt"

/**
 * Entrevistas do Maddox (Maddox 2) — SOMENTE servidor. A entrevista de cenário é do dono da campanha; a
 * de personagem, de cada membro, depois do cenário pronto. Cada mensagem é gravada em
 * `maddox_interviews`; uma geração por vez (trava `generating`). A camada de IA entra sob demanda.
 */

const log = loggerFor({ module: "maddox", feature: "interviews" })

type CampaignDoc = Omit<IMaddoxCampaign, "invite">
type InterviewDoc = IMaddoxInterview

export interface InterviewSubject {
    campaign: CampaignDoc
    member: IMaddoxCampaignMember
    character: IMaddoxCharacter | null
}

/** `scenario` | `character` da rota; outro valor = 404. */
export function interviewKind(value: string): MaddoxScriptKind {
    if (!isMaddoxScriptKind(value)) throw new DomainError(404, "Entrevista não encontrada", "NOT_FOUND")
    return value
}

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)

function messageDto(message: IMaddoxInterviewMessage): MaddoxInterviewMessageDto {
    return { id: message.id, role: message.role, content: message.content, proposal: Boolean(message.proposal), error: message.error ?? null, createdAt: new Date(message.createdAt).toISOString() }
}

export function interviewDto(doc: InterviewDoc): MaddoxInterviewDto {
    const lockedAt = doc.generating?.startedAt ? new Date(doc.generating.startedAt).getTime() : 0
    return {
        id: String(doc._id),
        campaignId: String(doc.campaignId),
        kind: doc.kind,
        status: doc.status,
        scriptVersion: doc.scriptVersion,
        messages: (doc.messages ?? []).map(messageDto),
        generating: Boolean(doc.generating?.token) && Date.now() - lockedAt < MADDOX_INTERVIEW_LOCK_MS,
        completedAt: iso(doc.completedAt),
    }
}

const sessionPurpose = (kind: MaddoxScriptKind): Exclude<MaddoxSessionPurpose, "narrator"> => (kind === "scenario" ? "scenario-interview" : "character-interview")

const interviewFilter = (subject: InterviewSubject, kind: MaddoxScriptKind) => ({ campaignId: subject.campaign._id, kind, memberId: kind === "character" ? subject.member._id : null })

/** Campanha, meu registro de membro e (na de personagem) meu personagem, com as regras de acesso. */
export async function loadSubject(campaignId: string, kind: MaddoxScriptKind, userId: string, mode: "read" | "write"): Promise<InterviewSubject> {
    const { campaign, member } = await loadMembership(campaignId, userId)
    if (!member) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    if (kind === "scenario" && campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha faz a entrevista de cenário com o Maddox.", "FORBIDDEN")
    const character = member.characterId ? await MaddoxCharacterModel.findOne({ _id: member.characterId, userId }).lean<IMaddoxCharacter>() : null
    if (mode === "read") return { campaign, member, character }
    if (MADDOX_INVITE_CLOSED_STATUSES.includes(campaign.status)) throw new DomainError(409, "A campanha foi encerrada: as entrevistas não podem mais ser alteradas.", "CAMPAIGN_CLOSED")
    if (kind === "character") {
        if (campaign.scenarioInterview?.status !== "done") throw new DomainError(409, "A entrevista de personagem começa depois que o dono definir o cenário com o Maddox.", "SCENARIO_PENDING")
        if (!character) throw new DomainError(409, "Crie o personagem (nome e retrato) antes de começar a entrevista.", "CHARACTER_DRAFT_REQUIRED")
    }
    return { campaign, member, character }
}

/** Minha entrevista (`null` = ainda não começou) e o avatar do Maddox para a conversa. */
export async function getInterview(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<MaddoxInterviewStateDto> {
    await dbConnect()
    const subject = await loadSubject(campaignId, kind, userId, "read")
    const doc = await MaddoxInterviewModel.findOne(interviewFilter(subject, kind)).lean<InterviewDoc>()
    const { loadMaddoxSettings } = await import("./settings")
    const { settings } = await loadMaddoxSettings()
    return { interview: doc ? interviewDto(doc) : null, maddoxAvatarUrl: settings.avatar.url ?? null }
}

// ── Modelo do entrevistador ────────────────────────────────────────────────────

export interface InterviewerModel {
    provider: NonNullable<MaddoxSettings["main"]["provider"]>
    model: string
    agent: string | null
    variant: string | null
    temperature: number | null
    maxOutputTokens: number | null
}

/** O entrevistador com provedor próprio, ou "Mesmo do Maddox" (o modelo principal). */
export function resolveInterviewerModel(settings: MaddoxSettings): InterviewerModel | null {
    const own = settings.interviewer.provider && settings.interviewer.model
    const source = own ? settings.interviewer : settings.main
    if (!source.provider || !source.model) return null
    return {
        provider: source.provider,
        model: source.model,
        agent: source.agent ?? null,
        variant: source.variant ?? null,
        temperature: own ? null : settings.main.temperature,
        maxOutputTokens: own ? null : settings.main.maxOutputTokens,
    }
}

export async function loadInterviewer(): Promise<{ settings: MaddoxSettings; model: InterviewerModel }> {
    const [{ loadMaddoxSettings }, { availability }] = await Promise.all([import("./settings"), import("@/features/ai/server/settings")])
    const { settings } = await loadMaddoxSettings()
    const model = resolveInterviewerModel(settings)
    const status = await availability({ enabled: settings.enabled, provider: model?.provider ?? null, model: model?.model ?? null }, '"Agente Maddox"')
    if (!status.available || !model) throw new DomainError(409, status.reason ?? 'O "Agente Maddox" não está disponível. Fale com um administrador.', "MADDOX_UNAVAILABLE")
    return { settings, model }
}

// ── Contexto do roteiro ────────────────────────────────────────────────────────

export async function promptContext(subject: InterviewSubject, kind: MaddoxScriptKind, scriptVersion: number, settings: MaddoxSettings): Promise<InterviewPromptContext> {
    const { getMaddoxScriptVersion, currentMaddoxScript } = await import("./scripts")
    const script = (await getMaddoxScriptVersion(kind, scriptVersion)) ?? (await currentMaddoxScript(kind))
    let otherCharacters: string[] = []
    if (kind === "character") {
        const others = await MaddoxCharacterModel.find({ campaignId: subject.campaign._id, _id: { $ne: subject.character?._id } }).select("name").lean<{ name: string }[]>()
        otherCharacters = others.map((item) => item.name)
    }
    return {
        kind,
        interviewerInstructions: settings.interviewerInstructions,
        script: { version: script.version, guide: script.guide, topics: script.topics },
        campaign: { name: subject.campaign.name, rigor: subject.campaign.rigor, setting: subject.campaign.setting ?? "", openingSituation: subject.campaign.openingSituation ?? "" },
        character: subject.character ? { name: subject.character.name } : null,
        otherCharacters,
    }
}

// ── Trava ──────────────────────────────────────────────────────────────────────

const BUSY = "O Maddox ainda está respondendo. Aguarde a resposta terminar."

async function acquireLock(interviewId: Types.ObjectId): Promise<{ doc: InterviewDoc; token: string }> {
    const token = randomUUID()
    const stale = new Date(Date.now() - MADDOX_INTERVIEW_LOCK_MS)
    const doc = await MaddoxInterviewModel.findOneAndUpdate(
        { _id: interviewId, $or: [{ generating: null }, { "generating.startedAt": { $lt: stale } }] },
        { $set: { generating: { token, startedAt: new Date() } } },
        { new: true },
    ).lean<InterviewDoc>()
    if (!doc) throw new DomainError(409, BUSY, "INTERVIEW_BUSY")
    return { doc, token }
}

async function releaseLock(interviewId: Types.ObjectId, token: string, set: Record<string, unknown> = {}) {
    await MaddoxInterviewModel.updateOne({ _id: interviewId, "generating.token": token }, { $set: { ...set, generating: null } })
}

// ── Turno ──────────────────────────────────────────────────────────────────────

export interface PreparedTurn {
    subject: InterviewSubject
    kind: MaddoxScriptKind
    userId: string
    interview: InterviewDoc
    token: string
    userMessage: IMaddoxInterviewMessage | null
    settings: MaddoxSettings
    model: InterviewerModel
    opencodeSessionId: string | null
    context: InterviewPromptContext
}

/** Resolve modelo, roteiro e sessão do OpenCode; qualquer falha libera a trava e propaga (erro JSON). */
async function prepareTurn(subject: InterviewSubject, kind: MaddoxScriptKind, userId: string, interview: InterviewDoc, token: string, userMessage: IMaddoxInterviewMessage | null): Promise<PreparedTurn> {
    try {
        const { settings, model } = await loadInterviewer()
        const context = await promptContext(subject, kind, interview.scriptVersion, settings)
        let opencodeSessionId: string | null = null
        if (model.provider === "opencode") {
            const { ensureMaddoxSession } = await import("./opencode-sessions")
            opencodeSessionId = await ensureMaddoxSession({
                campaignId: String(subject.campaign._id),
                purpose: sessionPurpose(kind),
                memberId: String(subject.member._id),
                agent: model.agent,
                title: kind === "scenario" ? `Maddox · cenário · ${subject.campaign.name}` : `Maddox · personagem ${subject.character?.name ?? ""} · ${subject.campaign.name}`,
            })
        }
        return { subject, kind, userId, interview, token, userMessage, settings, model, opencodeSessionId, context }
    } catch (error) {
        await releaseLock(interview._id, token)
        throw error
    }
}

/** Conversa enviada ao modelo: a abertura como primeira fala do usuário e o histórico sem as falhas. */
export function conversationMessages(kind: MaddoxScriptKind, messages: readonly IMaddoxInterviewMessage[]): ModelMessage[] {
    const history = messages.filter((message) => !message.error && message.content.trim())
    return [{ role: "user", content: openingPrompt(kind) }, ...history.map((message): ModelMessage => (message.role === "user" ? { role: "user", content: message.content } : { role: "assistant", content: message.content }))]
}

/** JEV "Fim da entrevista": já há base suficiente para propor a síntese? Falha = não opina. */
async function jevSaysReady(turn: PreparedTurn): Promise<boolean> {
    if (!turn.settings.jev["interview-complete"] || !turn.userMessage) return false
    try {
        const { askJevSystemOne } = await import("@/lib/ai/jev")
        const response = await askJevSystemOne({
            model: MADDOX_JEV_MODEL,
            tracking: { feature: "maddox", subject: String(turn.subject.campaign._id) },
            state: {
                entrevista: turn.kind === "scenario" ? "cenário" : "personagem",
                roteiro: turn.context.script.guide,
                topicos: turn.context.script.topics.filter((topic) => topic.active).map((topic) => topic.text),
                conversa: transcriptText([...turn.interview.messages.filter((message) => !message.error)]),
            },
            questions: {
                ready: {
                    type: "noul",
                    instructions: "A conversa já tem base suficiente, pelos critérios de conclusão do roteiro, para o entrevistador apresentar a síntese e pedir a confirmação?",
                    criteria: { true: "Os tópicos essenciais foram respondidos e não há pendência essencial.", false: "Ainda faltam tópicos essenciais ou há pendência em aberto." },
                },
            },
        })
        const answer = response.answers?.ready
        return answer?.type === "noul" && answer.noul >= 0.5
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] JEV indisponível na decisão de fim da entrevista")
        return false
    }
}

/**
 * Gera a resposta do Maddox, transmitindo os deltas (sem o marcador) e gravando a mensagem ao fim.
 * Nunca lança: falha do provedor vira uma mensagem com `error` ("Tentar de novo").
 */
export async function runTurn(turn: PreparedTurn, emit: (line: MaddoxInterviewStreamLine) => void): Promise<void> {
    const { interview, token, kind } = turn
    if (turn.userMessage) emit({ type: "user", message: messageDto(turn.userMessage) })
    let text = ""
    let failure: string | null = null
    try {
        const hint = await jevSaysReady(turn)
        const { streamAi } = await import("@/lib/ai/stream")
        const filter = createMarkerFilter()
        const instructions = buildInterviewInstructions(turn.context) + (hint ? `\n\n## Orientação deste turno\n${JEV_PROPOSAL_HINT}` : "")
        for await (const event of streamAi({
            provider: turn.model.provider,
            model: turn.model.model,
            agent: turn.model.agent,
            variant: turn.model.variant,
            temperature: turn.model.temperature,
            maxOutputTokens: turn.model.maxOutputTokens,
            instructions,
            prompt: openingPrompt(kind),
            messages: conversationMessages(kind, interview.messages),
            opencodeSessionId: turn.opencodeSessionId,
            title: `Maddox · entrevista · ${turn.subject.campaign.name}`,
            consumption: { origin: MADDOX_INTERVIEW_CONSUMPTION_ORIGIN, subject: String(turn.subject.campaign._id) },
        })) {
            if (event.type === "delta") {
                text += event.text
                const visible = filter.push(event.text)
                if (visible) emit({ type: "delta", text: visible })
            } else if (event.type === "error") {
                failure = event.message
            }
        }
        const rest = filter.flush()
        if (rest && !failure) emit({ type: "delta", text: rest })
    } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
    }

    const { content, proposal } = extractProposal(text)
    if (!failure && !content) failure = "O Maddox não respondeu. Tente de novo."
    const message: IMaddoxInterviewMessage = { id: randomUUID(), role: "maddox", content: failure ? "" : content, proposal: !failure && proposal, error: failure, createdAt: new Date() }
    const status = message.proposal ? "proposed" : "in-progress"
    try {
        await MaddoxInterviewModel.updateOne({ _id: interview._id, "generating.token": token }, { $push: { messages: message }, $set: { status, generating: null } })
        if (!failure && kind === "scenario") {
            // Só avisa a mesa quando a situação do cenário muda (proposta feita ou desfeita).
            const moved = await MaddoxCampaignModel.updateOne({ _id: turn.subject.campaign._id, "scenarioInterview.status": { $nin: ["done", status] } }, { $set: { "scenarioInterview.status": status } })
            if (moved.modifiedCount > 0) await changed(turn.subject.campaign._id)
        }
        const saved = await MaddoxInterviewModel.findById(interview._id).lean<InterviewDoc>()
        await notifyInterviewChanged(String(turn.subject.campaign._id), kind, turn.userId)
        if (failure) {
            log.warn({ campaignId: String(turn.subject.campaign._id), kind, err: failure }, "[maddox] falha ao gerar a resposta da entrevista")
            emit({ type: "error", message: failure, ...(saved ? { interview: interviewDto(saved) } : {}) })
        } else if (saved) {
            emit({ type: "done", message: messageDto(message), interview: interviewDto(saved) })
        }
    } catch (error) {
        await releaseLock(interview._id, token).catch(() => undefined)
        log.error({ err: error instanceof Error ? error.message : String(error) }, "[maddox] falha ao gravar a resposta da entrevista")
        emit({ type: "error", message: "Não foi possível gravar a resposta do Maddox. Tente de novo." })
    }
}

// ── Operações ──────────────────────────────────────────────────────────────────

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000

/**
 * Começa (ou retoma) a entrevista. Na primeira vez grava a versão do roteiro, muda a campanha para
 * "Em entrevista" (cenário, travando o rigor) ou a entrevista do personagem para "em andamento" e
 * prepara a abertura do Maddox. `turn: null` = já começou e nada precisa ser gerado agora.
 */
export async function startInterview(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<{ interview: MaddoxInterviewDto; turn: PreparedTurn | null }> {
    await dbConnect()
    const subject = await loadSubject(campaignId, kind, userId, "write")
    let doc = await MaddoxInterviewModel.findOne(interviewFilter(subject, kind)).lean<InterviewDoc>()
    if (!doc) {
        if (kind === "scenario" && !["lobby", "interview"].includes(subject.campaign.status)) throw new DomainError(409, "A entrevista de cenário só acontece antes do início da campanha.", "SCENARIO_LOCKED")
        // Valida a disponibilidade antes de gravar qualquer coisa.
        await loadInterviewer()
        const { currentMaddoxScript } = await import("./scripts")
        const pinned = kind === "scenario" ? subject.campaign.scriptVersions?.scenario : subject.campaign.scriptVersions?.character
        const scriptVersion = pinned ?? (await currentMaddoxScript(kind)).version
        try {
            doc = (await MaddoxInterviewModel.create({ ...interviewFilter(subject, kind), userId, characterId: subject.character?._id ?? null, scriptVersion, status: "in-progress" })).toObject() as InterviewDoc
        } catch (error) {
            if (!isDuplicateKey(error)) throw error
            doc = await MaddoxInterviewModel.findOne(interviewFilter(subject, kind)).lean<InterviewDoc>()
            if (!doc) throw error
            return { interview: interviewDto(doc), turn: null }
        }
        if (kind === "scenario") {
            await MaddoxCampaignModel.updateOne(
                { _id: subject.campaign._id },
                { $set: { status: "interview", "scenarioInterview.status": "in-progress", "scriptVersions.scenario": scriptVersion } },
            )
        } else {
            await MaddoxCharacterModel.updateOne({ _id: subject.character!._id }, { $set: { "interview.status": "in-progress", "interview.scriptVersion": scriptVersion } })
            await MaddoxCampaignModel.updateOne({ _id: subject.campaign._id, "scriptVersions.character": null }, { $set: { "scriptVersions.character": scriptVersion } }, { timestamps: false })
        }
        await recordAudit({
            userId,
            entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
            entidadeId: String(subject.campaign._id),
            acao: AcaoAuditoria.ATUALIZAR,
            depois: { interview: kind === "scenario" ? "cenário iniciado" : `personagem iniciado: ${subject.character?.name}`, scriptVersion, rigor: subject.campaign.rigor },
        })
        await changed(subject.campaign._id)
    }
    if (doc.status === "done" || doc.messages.some((message) => message.role === "maddox" && !message.error)) return { interview: interviewDto(doc), turn: null }
    const { doc: locked, token } = await acquireLock(doc._id)
    const cleaned = { ...locked, messages: locked.messages.filter((message) => !message.error) }
    await MaddoxInterviewModel.updateOne({ _id: locked._id }, { $set: { messages: cleaned.messages } })
    return { interview: interviewDto(cleaned), turn: await prepareTurn(subject, kind, userId, cleaned, token, null) }
}

async function existingInterview(subject: InterviewSubject, kind: MaddoxScriptKind): Promise<InterviewDoc> {
    const doc = await MaddoxInterviewModel.findOne(interviewFilter(subject, kind)).lean<InterviewDoc>()
    if (!doc) throw new DomainError(404, "A entrevista ainda não começou.", "INTERVIEW_NOT_STARTED")
    if (doc.status === "done") throw new DomainError(409, "Esta entrevista já foi concluída.", "INTERVIEW_DONE")
    return doc
}

/** Grava a resposta do usuário e prepara a resposta do Maddox. Uma nova mensagem desfaz a proposta pendente. */
export async function sendInterviewMessage(campaignId: string, kind: MaddoxScriptKind, input: MaddoxInterviewMessageInput, userId: string): Promise<PreparedTurn> {
    await dbConnect()
    const subject = await loadSubject(campaignId, kind, userId, "write")
    const doc = await existingInterview(subject, kind)
    if (doc.messages.length >= MADDOX_INTERVIEW_MESSAGES_MAX) throw new DomainError(409, "A entrevista chegou ao limite de mensagens. Peça ao Maddox a síntese e conclua.", "INTERVIEW_TOO_LONG")
    const { doc: locked, token } = await acquireLock(doc._id)
    const userMessage: IMaddoxInterviewMessage = { id: randomUUID(), role: "user", content: input.content, proposal: false, error: null, createdAt: new Date() }
    // Proposta anterior deixa de valer: a pessoa pediu ajustes.
    const messages = [...locked.messages.filter((message) => !message.error).map((message) => ({ ...message, proposal: false })), userMessage]
    await MaddoxInterviewModel.updateOne({ _id: locked._id, "generating.token": token }, { $set: { messages, status: "in-progress" } })
    if (kind === "scenario" && locked.status === "proposed") {
        await MaddoxCampaignModel.updateOne({ _id: subject.campaign._id }, { $set: { "scenarioInterview.status": "in-progress" } })
        await changed(subject.campaign._id)
    }
    return prepareTurn(subject, kind, userId, { ...locked, messages, status: "in-progress" }, token, userMessage)
}

/** Gera de novo a última resposta do Maddox que falhou. */
export async function retryInterviewTurn(campaignId: string, kind: MaddoxScriptKind, userId: string): Promise<PreparedTurn> {
    await dbConnect()
    const subject = await loadSubject(campaignId, kind, userId, "write")
    const doc = await existingInterview(subject, kind)
    const { doc: locked, token } = await acquireLock(doc._id)
    const last = locked.messages[locked.messages.length - 1]
    if (!last || last.role !== "maddox" || !last.error) {
        await releaseLock(locked._id, token)
        throw new DomainError(409, "Não há resposta com falha para tentar de novo.", "NOTHING_TO_RETRY")
    }
    const messages = locked.messages.filter((message) => !message.error)
    await MaddoxInterviewModel.updateOne({ _id: locked._id, "generating.token": token }, { $set: { messages } })
    return prepareTurn(subject, kind, userId, { ...locked, messages }, token, null)
}

export { acquireLock as acquireInterviewLock, releaseLock as releaseInterviewLock }
