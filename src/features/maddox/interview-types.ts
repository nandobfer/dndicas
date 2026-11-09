import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxAbilityMethod, MaddoxInterviewRunStatus, MaddoxScriptKind } from "./constants"

/** DTOs das entrevistas do Maddox (Maddox 2). */

export type MaddoxAbilityScoresValues = Record<AttributeType, number>

/** Card de atributos (Maddox 5) numa fala do Maddox; `final` = base + bônus (derivado). */
export interface MaddoxAbilityScoresDto {
    status: "pending" | "submitted" | "superseded"
    method: MaddoxAbilityMethod | null
    base: MaddoxAbilityScoresValues | null
    prefill: { method: MaddoxAbilityMethod; base: MaddoxAbilityScoresValues } | null
    bonus: { background: string; parts: Partial<Record<AttributeType, number>> } | null
    final: MaddoxAbilityScoresValues | null
    reason: string | null
    submittedAt: string | null
}

/** Rolagens do método de rolagem (cinco 4d6, a sexta = 72 − soma). */
export interface MaddoxAbilityRollsDto {
    rolls: { dice: number[]; score: number }[]
    sixth: number | null
    invalid: boolean
}

/** Linha do card de PV: ganho pela média e pelo dado rolado (com CON). */
export interface MaddoxHitPointLevelDto {
    level: number
    average: number
    die: number | null
    rolled: number | null
}

/** Card de pontos de vida por nível (Maddox 5), como o assistente de subir de nível da ficha. */
export interface MaddoxHitPointsDto {
    status: "pending" | "submitted" | "superseded"
    level: number
    hitDie: string
    /** Modificador de Constituição final (card de atributos + talentos). */
    constitutionModifier: number
    /** PV do nível 1 (máximo do dado + CON). */
    levelOne: number
    rows: MaddoxHitPointLevelDto[]
    choices: Record<string, "average" | "roll"> | null
    /** PV máximo com as escolhas enviadas (`null` = card ainda não enviado). */
    total: number | null
    reason: string | null
    submittedAt: string | null
}

export interface MaddoxInterviewMessageDto {
    id: string
    role: "maddox" | "user"
    content: string
    proposal: boolean
    error: string | null
    abilityScores?: MaddoxAbilityScoresDto | null
    hitPoints?: MaddoxHitPointsDto | null
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
    abilityRolls?: MaddoxAbilityRollsDto | null
    /** Resposta do Personagem Opex aguardando o dono (modo ao vivo, DND-26). */
    opexDraft?: MaddoxOpexDraftDto | null
    completedAt: string | null
}

/** Resposta do Personagem Opex aguardando aprovação (DND-26). `payload`: `{ method, scores }` (atributos) ou `{ escolhas }` (PV). */
export interface MaddoxOpexDraftDto {
    id: string
    status: "generating" | "ready" | "failed"
    kind: "message" | "ability-scores" | "hit-points"
    content: string
    payload: Record<string, unknown> | null
    guidance: string | null
    error: string | null
    createdAt: string
}

/** Entrevista de um Personagem Opex vista pelo dono da campanha (DND-26). */
export interface MaddoxOpexInterviewStateDto extends MaddoxInterviewStateDto {
    memberId: string
    characterName: string
    interviewMode: import("./constants").MaddoxOpexInterviewMode
    status: import("./campaign-types").MaddoxOpexStatus
    error: string | null
    prompt: string
}

/** Resposta da rolagem do dado de vida de um nível. */
export interface MaddoxHitPointRollResultDto {
    roll: DiceRollResponse
    interview: MaddoxInterviewDto
}

/** Resposta de uma rolagem de 4d6 dos atributos. */
export interface MaddoxAbilityRollResultDto {
    roll: DiceRollResponse
    interview: MaddoxInterviewDto
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
