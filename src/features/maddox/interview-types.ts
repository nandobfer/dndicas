import type { MaddoxInterviewRunStatus, MaddoxScriptKind } from "./constants"

/** DTOs das entrevistas do Maddox (Maddox 2). */

export interface MaddoxInterviewMessageDto {
    id: string
    role: "maddox" | "user"
    content: string
    proposal: boolean
    error: string | null
    createdAt: string
}

export interface MaddoxInterviewDto {
    id: string
    campaignId: string
    kind: MaddoxScriptKind
    status: MaddoxInterviewRunStatus
    scriptVersion: number
    messages: MaddoxInterviewMessageDto[]
    /** Há uma resposta do Maddox sendo gerada agora. */
    generating: boolean
    completedAt: string | null
}

/** Estado da tela antes de começar: a entrevista ainda não existe. */
export interface MaddoxInterviewStateDto {
    interview: MaddoxInterviewDto | null
    /** Avatar configurado na aba do Agente Maddox (`null` = sem avatar). */
    maddoxAvatarUrl: string | null
}

/** Linhas do NDJSON das rotas de entrevista. */
export type MaddoxInterviewStreamLine =
    | { type: "user"; message: MaddoxInterviewMessageDto }
    | { type: "delta"; text: string }
    | { type: "done"; message: MaddoxInterviewMessageDto; interview: MaddoxInterviewDto }
    | { type: "error"; message: string; interview?: MaddoxInterviewDto }
    | { type: "ping" }
