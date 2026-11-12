import { Types } from "mongoose"
import { MaddoxCampaignMessageModel, MaddoxInterviewModel, type IMaddoxCampaignMessage, type IMaddoxInterview } from "../models"
import { closeCatalogRun, createCatalogReadLog, openCatalogRun, type CatalogReadLog } from "./catalog-reads"

/**
 * Execução de uma resposta do "Pergunte ao mestre" (DND-51) — SOMENTE servidor. Enquanto o job da resposta roda, o Maddox
 * pode ler e corrigir a ficha de quem perguntou (o dono da campanha corrige qualquer personagem). As consultas ao catálogo
 * entram no registro do job (fonte das correções de regra) e as mensagens do jogador são a base da escolha dele
 * (`choice.quote`). O registro vive em memória do processo (o app roda numa instância só).
 */

export interface QuestionRun {
    campaignId: string
    jobId: string
    turnNumber: number
    questionId: string
    /** Quem perguntou (auditoria) e o personagem dele (`null` sem personagem). */
    askerUserId: string | null
    askerCharacterId: string | null
    askerIsOwner: boolean
    /** Mensagens do próprio jogador: as perguntas desta conversa e as falas dele na entrevista do personagem. */
    playerTexts: string[]
    reads: CatalogReadLog
    /** DND-58 (trocas depois do descanso): só estes tipos da lista fechada passam; os demais são recusados. */
    allowedChangeTypes?: readonly string[]
    /** DND-58: título da linha pública das mudanças ("Trocas de X depois do descanso longo:"). */
    sheetChangeTitle?: string
    /** DND-58: avisado com as linhas aplicadas (o resumo do descanso guarda as trocas). */
    onSheetChanged?: (lines: string[]) => Promise<void>
}

const runs = ((globalThis as unknown as { __maddoxQuestionRuns?: Map<string, QuestionRun> }).__maddoxQuestionRuns ??= new Map<string, QuestionRun>())

/** Chave do registro de catálogo do job (o MCP registra por ela com o token de turno). */
export const jobCatalogRunId = (jobId: string) => `job:${jobId}`

export const questionRun = (jobId: string | null | undefined): QuestionRun | null => (jobId ? (runs.get(jobId) ?? null) : null)

export function openQuestionRun(run: Omit<QuestionRun, "reads">): QuestionRun {
    const full = { ...run, reads: createCatalogReadLog() }
    runs.set(run.jobId, full)
    openCatalogRun(jobCatalogRunId(run.jobId), full.reads)
    return full
}

export function closeQuestionRun(jobId: string): void {
    runs.delete(jobId)
    closeCatalogRun(jobCatalogRunId(jobId))
}

export interface QuestionThreadEntry {
    id: string
    role: "player" | "maddox"
    characterName: string | null
    content: string
}

/** Máximo de mensagens da conversa (pergunta → resposta → réplica…) que entram na tarefa. */
export const QUESTION_THREAD_MAX = 12

/**
 * Conversa da pergunta, da mais antiga à atual, seguindo `replyToId` (a réplica responde à resposta do Maddox, que
 * responde à pergunta anterior).
 */
export async function questionThread(campaignId: Types.ObjectId, questionId: Types.ObjectId): Promise<QuestionThreadEntry[]> {
    const thread: QuestionThreadEntry[] = []
    let cursor: Types.ObjectId | null = questionId
    const seen = new Set<string>()
    while (cursor && thread.length < QUESTION_THREAD_MAX && !seen.has(String(cursor))) {
        seen.add(String(cursor))
        const message: Pick<IMaddoxCampaignMessage, "_id" | "kind" | "content" | "characterName" | "replyToId"> | null = await MaddoxCampaignMessageModel.findOne({ _id: cursor, campaignId }).select("kind content characterName replyToId").lean()
        if (!message || (message.kind !== "question" && message.kind !== "answer")) break
        thread.unshift({ id: String(message._id), role: message.kind === "question" ? "player" : "maddox", characterName: message.characterName ?? null, content: message.content })
        cursor = message.replyToId ?? null
    }
    return thread
}

/** Falas do jogador na entrevista do personagem (a escolha dele pode ter sido dita lá). */
export async function interviewPlayerTexts(campaignId: Types.ObjectId, characterId: Types.ObjectId | null): Promise<string[]> {
    if (!characterId) return []
    const interview = await MaddoxInterviewModel.findOne({ campaignId, kind: "character", characterId }).select("messages").lean<Pick<IMaddoxInterview, "messages">>()
    return (interview?.messages ?? []).filter((message) => message.role === "user" && message.content?.trim()).map((message) => message.content)
}
