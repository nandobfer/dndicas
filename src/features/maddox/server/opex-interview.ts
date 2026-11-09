import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import {
    MADDOX_INTERVIEW_LOCK_MS,
    MADDOX_INTERVIEW_MESSAGES_MAX,
    MADDOX_INVITE_CLOSED_STATUSES,
    MADDOX_OPEX_FIX_ATTEMPTS,
    MADDOX_OPEX_INTERVIEW_CONSUMPTION_ORIGIN,
    MADDOX_ABILITY_ROLLS,
    type MaddoxOpexRunStatus,
} from "../constants"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxInterviewModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCharacter, type IMaddoxInterview, type IMaddoxInterviewMessage, type IMaddoxOpexDraft } from "../models"
import { ABILITY_BY_LABEL, ABILITY_KEYS, rolledScores, type AbilityScores } from "../interview-scores"
import type { MaddoxOpexInterviewStateDto } from "../interview-types"
import type { MaddoxCampaignDetailDto } from "../campaign-types"
import { changed } from "./campaigns"
import { notifyInterviewChanged } from "./campaign-realtime"
import { transcriptText } from "./interview-prompt"
import { interviewDto, runTurn, type PreparedTurn } from "./interviews"
import { isOpexMember, loadOpexAsOwner } from "./opex-members"
import { decideOpex, loadOpexModel, opexPromptContext } from "./opex-player"
import { buildOpexInstructions, opexAbilityScoresSchema, opexAbilityScoresTask, opexHitPointsSchema, opexHitPointsTask, opexInterviewReplySchema, opexInterviewReplyTask } from "./opex-prompt"
import { isOpexRunning, runOpexOnce } from "./opex-runtime"

/**
 * Entrevista do Personagem Opex (DND-26) — SOMENTE servidor.
 *
 * Usa as MESMAS funções da entrevista de personagem de um jogador (`startInterview`, `sendInterviewMessage`,
 * `submitAbilityScores`, `submitHitPoints`, `completeInterview`) com a identidade sintética do Opex: mesmo roteiro, mesmo
 * limite de mensagens, mesma síntese, nome obrigatório, ficha a partir do Equilibrado e o retrato ao concluir.
 *
 * - Autônoma: roda em segundo plano (não depende de tela aberta); o próprio Opex responde a cada fala, preenche os cards
 *   (as rolagens são do servidor) e a síntese é confirmada automaticamente. Conclusão recusada por algo corrigível vira um
 *   pedido de ajuste ao entrevistador (até `MADDOX_OPEX_FIX_ATTEMPTS`); o resto é falha com "Tentar de novo".
 * - Ao vivo: cada resposta do Opex vira um rascunho (`interview.opexDraft`) e só segue ao entrevistador quando o dono
 *   aprova (como está ou editada) ou pede outra resposta. Na síntese, o dono confirma. Tela fechada = pausa ("Aguardando
 *   sua aprovação"). O modo nunca muda sozinho.
 */

const log = loggerFor({ module: "maddox", feature: "opex-interview" })
const KIND = "character" as const
const MAX_STEPS = 80
const FIXABLE_CODES = new Set(["CHARACTER_NAME_REQUIRED", "CHARACTER_BUILD_INCOMPLETE", "HIT_POINTS_PENDING", "ABILITY_SCORES_PENDING", "BACKGROUND_NOT_IN_CATALOG", "CHARACTER_NOT_IN_WORLD", "NO_PROPOSAL", "CONSOLIDATION_FAILED"])

type MemberDoc = IMaddoxCampaignMember
type InterviewDoc = IMaddoxInterview

const runKey = (memberId: string) => `interview:${memberId}`
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const noop = () => undefined

/** Grava a situação do trabalho do Opex e avisa o lobby. Nunca lança. */
export async function setOpexRun(campaignId: Types.ObjectId, memberId: Types.ObjectId | string, status: MaddoxOpexRunStatus, stage: "interview" | "table", error: string | null = null): Promise<void> {
    try {
        await MaddoxCampaignMemberModel.updateOne({ _id: memberId, kind: "opex" }, { $set: { "opex.run": { status, stage, error, updatedAt: new Date() } } })
        await changed(campaignId)
    } catch (failure) {
        log.warn({ memberId: String(memberId), err: errorText(failure) }, "[maddox] situação do Personagem Opex não gravada")
    }
}

interface Loaded {
    campaign: IMaddoxCampaign
    member: MemberDoc
    character: IMaddoxCharacter | null
    doc: InterviewDoc | null
}

async function loadState(memberId: string): Promise<Loaded | null> {
    const member = await MaddoxCampaignMemberModel.findById(memberId).lean<MemberDoc>()
    if (!member || !isOpexMember(member) || member.status !== "joined") return null
    const campaign = await MaddoxCampaignModel.findById(member.campaignId).lean<IMaddoxCampaign>()
    if (!campaign) return null
    const character = member.characterId ? await MaddoxCharacterModel.findById(member.characterId).lean<IMaddoxCharacter>() : null
    const doc = await MaddoxInterviewModel.findOne({ campaignId: campaign._id, kind: KIND, memberId: member._id }).lean<InterviewDoc>()
    return { campaign, member, character, doc }
}

const visible = (doc: InterviewDoc | null) => (doc?.messages ?? []).filter((message) => !message.internal)
const lastOf = (doc: InterviewDoc | null): IMaddoxInterviewMessage | undefined => {
    const messages = doc?.messages ?? []
    return messages[messages.length - 1]
}
const pendingAbilityCard = (doc: InterviewDoc | null) => [...(doc?.messages ?? [])].reverse().find((message) => message.abilityScores?.status === "pending")?.abilityScores ?? null
const pendingHitPointsCard = (doc: InterviewDoc | null) => [...(doc?.messages ?? [])].reverse().find((message) => message.hitPoints?.status === "pending")?.hitPoints ?? null
const lockedNow = (doc: InterviewDoc | null) => Boolean(doc?.generating?.token) && Date.now() - new Date(doc!.generating!.startedAt).getTime() < MADDOX_INTERVIEW_LOCK_MS
const transcriptOf = (doc: InterviewDoc | null) => transcriptText((doc?.messages ?? []).filter((message) => !message.error).map((message) => ({ role: message.role, content: message.content, internal: message.internal })))

/** O que o Opex responde agora: o card de atributos, o de PV, a síntese (confirmar) ou a última fala do Maddox. */
type Pending = "ability-scores" | "hit-points" | "proposal" | "message" | "none"
function pendingOf(doc: InterviewDoc | null): Pending {
    if (!doc || doc.status === "done") return "none"
    if (pendingAbilityCard(doc)) return "ability-scores"
    if (pendingHitPointsCard(doc)) return "hit-points"
    const last = lastOf(doc)
    if (!last || last.role !== "maddox" || last.error) return "none"
    return last.proposal ? "proposal" : "message"
}

async function streamTurn(turn: PreparedTurn): Promise<void> {
    await runTurn(turn, noop)
}

// ── Decisões ────────────────────────────────────────────────────────────────

interface Decided {
    kind: IMaddoxOpexDraft["kind"]
    content: string
    payload: Record<string, unknown> | null
}

async function decide(state: Loaded, pending: Exclude<Pending, "proposal" | "none">, options: { guidance?: string | null; fix?: string | null } = {}): Promise<Decided> {
    const { campaign, member, character } = state
    const { settings, model } = await loadOpexModel(campaign.rigor)
    const instructions = buildOpexInstructions(await opexPromptContext(campaign, member, character, settings))
    const transcript = transcriptOf(state.doc)
    const base = { model, instructions, title: `Personagem Opex · entrevista · ${campaign.name}`, origin: MADDOX_OPEX_INTERVIEW_CONSUMPTION_ORIGIN, subject: String(campaign._id) }
    const userId = member.userId
    if (pending === "ability-scores") {
        const card = pendingAbilityCard(state.doc)
        let rolled = state.doc?.abilityRolls ? rolledScores({ scores: state.doc.abilityRolls.rolls.map((roll) => roll.score), sixth: state.doc.abilityRolls.sixth, invalid: state.doc.abilityRolls.invalid }) : []
        let answer = rolled.length === MADDOX_ABILITY_ROLLS + 1 ? null : await decideOpex({ ...base, prompt: opexAbilityScoresTask({ transcript, guidance: options.guidance, reason: card?.reason ?? null, rolled: null }), schema: opexAbilityScoresSchema })
        if (!answer || answer.metodo === "roll") {
            rolled = await rollAllAbilityScores(String(campaign._id), userId)
            answer = await decideOpex({ ...base, prompt: opexAbilityScoresTask({ transcript, guidance: options.guidance, reason: card?.reason ?? null, rolled }), schema: opexAbilityScoresSchema })
            answer = { ...answer, metodo: "roll" }
        }
        const scores = scoresOf(answer.valores)
        return { kind: "ability-scores", content: "", payload: { method: answer.metodo, scores } }
    }
    if (pending === "hit-points") {
        const card = pendingHitPointsCard(state.doc)!
        const levels = Array.from({ length: Math.max(0, card.level - 1) }, (_, index) => index + 2)
        const answer = await decideOpex({ ...base, prompt: opexHitPointsTask({ transcript, guidance: options.guidance, levels, hitDie: card.hitDie, reason: card.reason ?? null }), schema: opexHitPointsSchema })
        const escolhas = Object.fromEntries(levels.map((level) => [String(level), answer.escolhas[String(level)] ?? "media"]))
        return { kind: "hit-points", content: "", payload: { escolhas } }
    }
    const answer = await decideOpex({ ...base, prompt: opexInterviewReplyTask({ transcript, guidance: options.guidance, fix: options.fix }), schema: opexInterviewReplySchema })
    return { kind: "message", content: answer.resposta.slice(0, 4_000), payload: null }
}

/** Valores do JSON do Opex (rótulos pt-BR ou chaves) → atributos. Faltando algum = erro. */
function scoresOf(values: Record<string, number>): AbilityScores {
    const out: Partial<AbilityScores> = {}
    for (const [label, value] of Object.entries(values)) {
        const key = (ABILITY_BY_LABEL[label] ?? (ABILITY_KEYS as readonly string[]).find((item) => item === label)) as AttributeType | undefined
        if (key) out[key] = value
    }
    if (ABILITY_KEYS.some((key) => typeof out[key] !== "number")) throw new Error("o Personagem Opex não definiu os seis atributos")
    return out as AbilityScores
}

/** As 5 rolagens de 4d6 no servidor (reinicia quando a sexta sai de 3–18, até 3 vezes). */
async function rollAllAbilityScores(campaignId: string, userId: string): Promise<number[]> {
    const { rollAbilityScore, resetAbilityRolls } = await import("./interview-scores-service")
    for (let attempt = 0; attempt < 3; attempt++) {
        const doc = await MaddoxInterviewModel.findOne({ campaignId, kind: KIND, userId }).lean<InterviewDoc>()
        let rolls = doc?.abilityRolls ?? null
        if (rolls?.invalid) {
            await resetAbilityRolls(campaignId, KIND, userId)
            rolls = null
        }
        let count = rolls?.rolls.length ?? 0
        let last = rolls
        while (count < MADDOX_ABILITY_ROLLS) {
            const result = await rollAbilityScore(campaignId, KIND, userId)
            last = result.interview.abilityRolls ? { rolls: result.interview.abilityRolls.rolls.map((roll) => ({ ...roll, rollId: "" })), sixth: result.interview.abilityRolls.sixth, invalid: result.interview.abilityRolls.invalid } : null
            count = last?.rolls.length ?? count + 1
        }
        if (last && !last.invalid && last.sixth !== null) return rolledScores({ scores: last.rolls.map((roll) => roll.score), sixth: last.sixth, invalid: false })
    }
    throw new Error("as rolagens de atributos ficaram fora do intervalo três vezes")
}

/** Envia a resposta decidida (ou aprovada) pelo caminho de um jogador e espera a fala do Maddox. */
async function submit(campaignId: string, userId: string, decided: Decided): Promise<PreparedTurn> {
    if (decided.kind === "ability-scores") {
        const { submitAbilityScores } = await import("./interview-scores-service")
        const payload = decided.payload as { method: "standard" | "point-buy" | "roll"; scores: AbilityScores }
        return submitAbilityScores(campaignId, KIND, { method: payload.method, scores: payload.scores }, userId)
    }
    if (decided.kind === "hit-points") {
        const { submitHitPoints } = await import("./interview-hit-points")
        return submitHitPoints(campaignId, KIND, { escolhas: (decided.payload as { escolhas: Record<string, "media" | "rolagem"> }).escolhas }, userId)
    }
    const { sendInterviewMessage } = await import("./interviews")
    return sendInterviewMessage(campaignId, KIND, { content: decided.content }, userId)
}

/** Rola os dados de vida dos níveis com "rolagem" antes do envio do card de PV. */
async function rollHitDice(campaignId: string, userId: string, decided: Decided, doc: InterviewDoc | null): Promise<void> {
    if (decided.kind !== "hit-points") return
    const { rollHitPoint } = await import("./interview-hit-points")
    const rolled = new Set((doc?.hitPointRolls ?? []).map((roll) => roll.level))
    for (const [level, choice] of Object.entries((decided.payload as { escolhas: Record<string, string> }).escolhas)) {
        if (choice === "rolagem" && !rolled.has(Number(level))) await rollHitPoint(campaignId, KIND, Number(level), userId)
    }
}

// ── Execução ────────────────────────────────────────────────────────────────

/** Agenda a entrevista do Opex em segundo plano (single-flight por membro). Nunca rejeita. */
export function scheduleOpexInterview(memberId: string): Promise<void> {
    return runOpexOnce(runKey(memberId), () => runOpexInterview(memberId))
}

async function fail(state: Loaded, reason: string): Promise<void> {
    log.warn({ campaignId: String(state.campaign._id), memberId: String(state.member._id), err: reason }, "[maddox] entrevista do Personagem Opex parou")
    await setOpexRun(state.campaign._id, state.member._id, "failed", "interview", reason)
}

async function runOpexInterview(memberId: string): Promise<void> {
    await dbConnect()
    let fixes = 0
    let fixRequest: string | null = null
    for (let step = 0; step < MAX_STEPS; step++) {
        const state = await loadState(memberId)
        if (!state) return
        const { campaign, member, character, doc } = state
        const campaignId = String(campaign._id)
        if (MADDOX_INVITE_CLOSED_STATUSES.includes(campaign.status)) return
        if (character?.interview?.status === "done" || doc?.status === "done") {
            if (member.opex?.run?.stage === "interview") await setOpexRun(campaign._id, member._id, "idle", "interview")
            return
        }
        if (member.opex?.run?.status === "failed" && member.opex.run.stage === "interview") return
        if (step === 0 && member.opex?.run?.status !== "running") await setOpexRun(campaign._id, member._id, "running", "interview")
        try {
            // Primeira fala do Maddox (ou a abertura que falhou e foi limpa).
            if (!doc || !visible(doc).some((message) => message.role === "maddox" && !message.error)) {
                if (lockedNow(doc)) return
                const { startInterview } = await import("./interviews")
                const started = await startInterview(campaignId, KIND, member.userId)
                if (started.turn) await streamTurn(started.turn)
                const fresh = await MaddoxInterviewModel.findOne({ campaignId: campaign._id, kind: KIND, memberId: member._id }).lean<InterviewDoc>()
                if (lastOf(fresh)?.error) return fail(state, lastOf(fresh)!.error!)
                continue
            }
            if (lockedNow(doc)) return
            const last = lastOf(doc)
            if (last?.role === "maddox" && last.error) return fail(state, last.error)
            if (doc.messages.length >= MADDOX_INTERVIEW_MESSAGES_MAX) return fail(state, "A entrevista chegou ao limite de mensagens sem concluir.")
            const pending = pendingOf(doc)
            if (pending === "none") return

            if (member.opex?.interviewMode === "live") {
                // Ao vivo: a síntese espera o "Confirmar e concluir"; o resto vira rascunho para o dono aprovar.
                if (pending === "proposal") {
                    await setOpexRun(campaign._id, member._id, "awaiting-approval", "interview")
                    return
                }
                if (doc.opexDraft && doc.opexDraft.status !== "failed") {
                    if (doc.opexDraft.status === "ready") await setOpexRun(campaign._id, member._id, "awaiting-approval", "interview")
                    return
                }
                await generateDraft(state, pending, doc.opexDraft?.guidance ?? null)
                return
            }

            if (pending === "proposal") {
                const { completeInterview } = await import("./interview-consolidation")
                try {
                    await completeInterview(campaignId, KIND, member.userId)
                    await setOpexRun(campaign._id, member._id, "idle", "interview")
                    return
                } catch (error) {
                    const code = error instanceof DomainError ? error.code : null
                    if (!code || !FIXABLE_CODES.has(code) || fixes >= MADDOX_OPEX_FIX_ATTEMPTS) throw error
                    fixes++
                    fixRequest = errorText(error)
                    const decided = await decide(state, "message", { fix: fixRequest })
                    await streamTurn(await submit(campaignId, member.userId, decided))
                    fixRequest = null
                    continue
                }
            }
            const decided = await decide(state, pending, { fix: fixRequest })
            await rollHitDice(campaignId, member.userId, decided, doc)
            await streamTurn(await submit(campaignId, member.userId, decided))
            fixRequest = null
        } catch (error) {
            return fail(state, errorText(error))
        }
    }
    const state = await loadState(memberId)
    if (state) await fail(state, "A entrevista do Personagem Opex não terminou a tempo.")
}

async function generateDraft(state: Loaded, pending: Exclude<Pending, "proposal" | "none">, guidance: string | null): Promise<void> {
    const { campaign, member, doc } = state
    const id = randomUUID()
    await MaddoxInterviewModel.updateOne({ _id: doc!._id }, { $set: { opexDraft: { id, status: "generating", kind: pending, content: "", payload: null, guidance, error: null, createdAt: new Date() } } })
    await notifyInterviewChanged(String(campaign._id), KIND, member.userId)
    try {
        const decided = await decide(state, pending, { guidance })
        await MaddoxInterviewModel.updateOne({ _id: doc!._id, "opexDraft.id": id }, { $set: { "opexDraft.status": "ready", "opexDraft.kind": decided.kind, "opexDraft.content": decided.content, "opexDraft.payload": decided.payload } })
        await setOpexRun(campaign._id, member._id, "awaiting-approval", "interview")
    } catch (error) {
        await MaddoxInterviewModel.updateOne({ _id: doc!._id, "opexDraft.id": id }, { $set: { "opexDraft.status": "failed", "opexDraft.error": errorText(error) } })
        await setOpexRun(campaign._id, member._id, "failed", "interview", errorText(error))
    }
    await notifyInterviewChanged(String(campaign._id), KIND, member.userId)
}

// ── Ações do dono ───────────────────────────────────────────────────────────

const openFor = (campaign: IMaddoxCampaign) => {
    if (MADDOX_INVITE_CLOSED_STATUSES.includes(campaign.status)) throw new DomainError(409, "A campanha foi encerrada: as entrevistas não podem mais ser alteradas.", "CAMPAIGN_CLOSED")
}

/** Entrevista do Personagem Opex para o dono (conversa, rascunho e situação). */
export async function getOpexInterview(campaignId: string, memberId: string, userId: string): Promise<MaddoxOpexInterviewStateDto> {
    const { campaign, member, character } = await loadOpexAsOwner(campaignId, memberId, userId)
    const doc = await MaddoxInterviewModel.findOne({ campaignId: campaign._id, kind: KIND, memberId: member._id }).lean<InterviewDoc>()
    const { getCampaignDetail } = await import("./campaigns")
    const detail = await getCampaignDetail(campaignId, userId)
    const dto = detail.members.find((item) => item.id === String(member._id))
    const { loadMaddoxSettings } = await import("./settings")
    const { settings } = await loadMaddoxSettings()
    return {
        interview: doc ? interviewDto(doc) : null,
        maddoxAvatarUrl: settings.avatar.url ?? null,
        memberId: String(member._id),
        characterName: character?.name ?? "",
        interviewMode: member.opex?.interviewMode ?? "autonomous",
        status: dto?.opex?.status ?? "interviewing",
        error: dto?.opex?.error ?? null,
        prompt: member.opex?.prompt ?? "",
    }
}

export type OpexApproval = { content?: string } | { method: "standard" | "point-buy" | "roll"; scores: AbilityScores } | { escolhas: Record<string, "media" | "rolagem"> }

/**
 * Dono aprova o rascunho (como está ou editado): a resposta segue ao entrevistador pelo caminho de um jogador. Devolve o
 * turno preparado (a rota transmite a fala do Maddox) e, depois dela, o próximo rascunho é gerado.
 */
export async function approveOpexDraft(campaignId: string, memberId: string, input: OpexApproval, userId: string): Promise<{ turn: PreparedTurn; after: () => void }> {
    const { campaign, member } = await loadOpexAsOwner(campaignId, memberId, userId)
    openFor(campaign)
    if (member.opex?.interviewMode !== "live") throw new DomainError(409, "Esta entrevista é autônoma: as respostas não passam por aprovação.", "OPEX_NOT_LIVE")
    const doc = await MaddoxInterviewModel.findOne({ campaignId: campaign._id, kind: KIND, memberId: member._id }).lean<InterviewDoc>()
    const draft = doc?.opexDraft
    if (!doc || !draft || draft.status !== "ready") throw new DomainError(409, "Não há resposta do Personagem Opex aguardando aprovação.", "NO_OPEX_DRAFT")
    let decided: Decided
    if (draft.kind === "message") {
        const content = "content" in input && typeof input.content === "string" ? input.content.trim() : draft.content
        if (!content) throw new DomainError(400, "Escreva a resposta antes de aprovar.", "EMPTY_DRAFT")
        decided = { kind: "message", content: content.slice(0, 4_000), payload: null }
    } else if (draft.kind === "ability-scores") {
        decided = { kind: "ability-scores", content: "", payload: "method" in input && "scores" in input ? { method: input.method, scores: input.scores } : draft.payload }
    } else {
        decided = { kind: "hit-points", content: "", payload: "escolhas" in input ? { escolhas: input.escolhas } : draft.payload }
    }
    await rollHitDice(campaignId, member.userId, decided, doc)
    const turn = await submit(campaignId, member.userId, decided)
    await MaddoxInterviewModel.updateOne({ _id: doc._id, "opexDraft.id": draft.id }, { $set: { opexDraft: null } })
    await setOpexRun(campaign._id, member._id, "running", "interview")
    return { turn, after: () => void scheduleOpexInterview(String(member._id)) }
}

/** "Gerar outra resposta" (ou pedir um ajuste na síntese), com orientação opcional ao Opex. */
export async function regenerateOpexDraft(campaignId: string, memberId: string, guidance: string | null, userId: string): Promise<MaddoxOpexInterviewStateDto> {
    const { campaign, member } = await loadOpexAsOwner(campaignId, memberId, userId)
    openFor(campaign)
    if (member.opex?.interviewMode !== "live") throw new DomainError(409, "Esta entrevista é autônoma: as respostas não passam por aprovação.", "OPEX_NOT_LIVE")
    if (isOpexRunning(runKey(memberId))) throw new DomainError(409, "O Personagem Opex ainda está respondendo. Aguarde.", "OPEX_BUSY")
    const doc = await MaddoxInterviewModel.findOne({ campaignId: campaign._id, kind: KIND, memberId: member._id }).lean<InterviewDoc>()
    if (!doc || doc.status === "done") throw new DomainError(409, "A entrevista não está aguardando uma resposta.", "NO_OPEX_DRAFT")
    const pending = pendingOf(doc)
    if (pending === "none") throw new DomainError(409, "A entrevista não está aguardando uma resposta.", "NO_OPEX_DRAFT")
    const state: Loaded = { campaign, member, character: null, doc }
    state.character = member.characterId ? await MaddoxCharacterModel.findById(member.characterId).lean<IMaddoxCharacter>() : null
    void runOpexOnce(runKey(memberId), () => generateDraft(state, pending === "proposal" ? "message" : pending, guidance?.trim() || null))
    return getOpexInterview(campaignId, memberId, userId)
}

/** Dono confirma a síntese do Personagem Opex ("Confirmar e concluir", modo ao vivo). */
export async function completeOpexInterview(campaignId: string, memberId: string, userId: string): Promise<MaddoxCampaignDetailDto> {
    const { campaign, member } = await loadOpexAsOwner(campaignId, memberId, userId)
    openFor(campaign)
    const { completeInterview } = await import("./interview-consolidation")
    await completeInterview(campaignId, KIND, member.userId)
    await setOpexRun(campaign._id, member._id, "idle", "interview")
    const { getCampaignDetail } = await import("./campaigns")
    return getCampaignDetail(campaignId, userId)
}

/** "Tentar de novo" da entrevista: continua de onde parou (refaz a fala do Maddox que falhou, se houver). */
export async function retryOpexInterview(campaignId: string, memberId: string, userId: string): Promise<MaddoxCampaignDetailDto> {
    const { campaign, member } = await loadOpexAsOwner(campaignId, memberId, userId)
    openFor(campaign)
    if (isOpexRunning(runKey(memberId))) throw new DomainError(409, "O Personagem Opex ainda está respondendo. Aguarde.", "OPEX_BUSY")
    await MaddoxCampaignMemberModel.updateOne({ _id: member._id }, { $set: { "opex.run": { status: "running", stage: "interview", error: null, updatedAt: new Date() } } })
    const doc = await MaddoxInterviewModel.findOne({ campaignId: campaign._id, kind: KIND, memberId: member._id }).lean<InterviewDoc>()
    if (doc?.opexDraft?.status === "failed") await MaddoxInterviewModel.updateOne({ _id: doc._id }, { $set: { opexDraft: null } })
    const last = lastOf(doc)
    void runOpexOnce(runKey(memberId), async () => {
        if (last?.role === "maddox" && last.error && visible(doc).some((message) => message.role === "maddox" && !message.error)) {
            try {
                const { retryInterviewTurn } = await import("./interviews")
                await streamTurn(await retryInterviewTurn(campaignId, KIND, member.userId))
            } catch (error) {
                const state = await loadState(memberId)
                if (state) await fail(state, errorText(error))
                return
            }
        }
        await runOpexInterview(memberId)
    })
    await changed(campaign._id)
    const { getCampaignDetail } = await import("./campaigns")
    return getCampaignDetail(campaignId, userId)
}

