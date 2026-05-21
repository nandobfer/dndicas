export const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const

export type DiceType = (typeof DICE_TYPES)[number]

export type DiceRollMode = "disadvantage" | "normal" | "advantage"

export type DiceCriticalState = "critical-success" | "critical-failure"

export type DiceRollSource = "manual" | "sheet" | "owlbear"

export interface DiceTerm {
    dice: DiceType
    quantity: number
}

export interface DiceRollRequest {
    terms: DiceTerm[]
    modifier?: number
    mode: DiceRollMode
    label?: string
    source?: DiceRollSource
    diceSessionId?: string
}

export interface DiceRollOverrideInput {
    dice: DiceType
    min?: number
    max?: number
    exact?: number
}

export interface DiceRollOverrideRecord extends DiceRollOverrideInput {
    id: string
    scope: "local" | "owlbear"
    targetId: string
    remainingUses: number
    createdAt?: string
    updatedAt?: string
}

export interface DiceRollTermResult {
    dice: DiceType
    quantity: number
    results: number[]
}

export interface DiceRollResponse {
    rollId: string
    label?: string
    terms: DiceRollTermResult[]
    mode: DiceRollMode
    selectedD20?: {
        kept: number
        discarded?: number
        reason: DiceRollMode
    }
    diceTotal: number
    modifier: number
    total: number
    createdAt: string
}

export interface DiceRollPreset {
    label: string
    terms: DiceTerm[]
    modifier?: number
    mode?: DiceRollMode
    source: DiceRollSource
    sourceRef?: {
        sheetId?: string
        fieldId?: string
        owlbearPlayerId?: string
        roomId?: string
    }
}

export interface DiceResultConsoleApi {
    min: (dice: DiceType, value: number) => Promise<DiceRollOverrideRecord | null>
    max: (dice: DiceType, value: number) => Promise<DiceRollOverrideRecord | null>
    range: (dice: DiceType, min: number, max: number) => Promise<DiceRollOverrideRecord | null>
    exact: (dice: DiceType, value: number) => Promise<DiceRollOverrideRecord | null>
    clear: (dice?: DiceType) => Promise<{ deletedCount: number } | null>
    list: () => Promise<DiceRollOverrideRecord[] | null>
}
