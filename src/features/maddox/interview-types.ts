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

export interface MaddoxInterviewMessageDto {
    id: string
    role: "maddox" | "user"
    content: string
    proposal: boolean
    error: string | null
    abilityScores?: MaddoxAbilityScoresDto | null
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
    completedAt: string | null
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
