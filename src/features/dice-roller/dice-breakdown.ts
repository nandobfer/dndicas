import { getDiceCriticalState } from "./critical-state"
import type { DiceCriticalState, DiceModifierPart, DiceModifierPartColor, DiceRollMode, DiceRollResponse, DiceType } from "./types"

/**
 * Conta de uma rolagem (DND-47): dados, par de d20 da vantagem/desvantagem, parcelas do modificador e a soma até o
 * total. Puro (sem React), usado pelo `DiceResultTooltip` e pelo servidor (`alignModifierParts`).
 */

export const MODIFIER_FALLBACK_LABEL = "Modificador"
export const MODIFIER_REMAINDER_LABEL = "Outros"
export const DICE_MODIFIER_PART_COLORS: readonly DiceModifierPartColor[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma", "prof", "bonus", "base", "manual"]

export const DICE_MODE_LABELS: Record<DiceRollMode, string> = { normal: "Normal", advantage: "Vantagem", disadvantage: "Desvantagem" }

export const signedNumber = (value: number) => (value >= 0 ? `+${value}` : `−${Math.abs(value)}`)

/**
 * Parcelas que somam exatamente `modifier`: tira as de valor 0 (e as inválidas) e, se a soma não bater, acrescenta a
 * diferença com o nome do contexto (`remainderLabel`). Sem parcelas válidas e com modificador ≠ 0, devolve uma única
 * parcela com o `remainderLabel`. Sem nada a mostrar, devolve `[]`.
 */
export function alignModifierParts(parts: readonly DiceModifierPart[] | null | undefined, modifier: number, remainderLabel: string = MODIFIER_REMAINDER_LABEL): DiceModifierPart[] {
    const valid = (parts ?? []).filter((part) => part && typeof part.label === "string" && part.label.trim() && Number.isFinite(part.value) && part.value !== 0).map((part) => ({ ...part, label: part.label.trim(), value: Math.trunc(part.value) }))
    const sum = valid.reduce((acc, part) => acc + part.value, 0)
    const rest = modifier - sum
    if (rest !== 0) valid.push({ label: valid.length ? remainderLabel : remainderLabel === MODIFIER_REMAINDER_LABEL ? MODIFIER_FALLBACK_LABEL : remainderLabel, value: rest, color: "manual" })
    return valid
}

/** Partes do `CalcPart` da ficha ("+3", 2, "−1") como parcelas numéricas. */
export function partsFromCalc(parts: readonly { label: string; value: string | number; color?: string }[] | null | undefined): DiceModifierPart[] {
    return (parts ?? []).flatMap((part) => {
        const value = typeof part.value === "number" ? part.value : Number.parseInt(String(part.value).replace(/[−–]/g, "-").replace(/\s+/g, ""), 10)
        if (!Number.isFinite(value)) return []
        const color = DICE_MODIFIER_PART_COLORS.includes(part.color as DiceModifierPartColor) ? (part.color as DiceModifierPartColor) : undefined
        return [{ label: part.label, value, ...(color ? { color } : {}) }]
    })
}

export type BreakdownDieRole = "rolled" | "kept" | "discarded" | "dropped"

export interface BreakdownTerm {
    dice: DiceType
    label: string
    values: { value: number; role: BreakdownDieRole }[]
    subtotal: number
}

export interface DiceBreakdown {
    label: string | null
    mode: DiceRollMode
    modeLabel: string
    formula: string
    time: string | null
    terms: BreakdownTerm[]
    /** Vantagem/desvantagem: os dois d20, o mantido e o descartado. */
    d20Pair: { kept: number; discarded: number; mode: Exclude<DiceRollMode, "normal"> } | null
    diceLabel: string
    diceTotal: number
    lines: DiceModifierPart[]
    equation: string
    total: number
    critical: DiceCriticalState | null
    /** `dropLowest`: soma sem o menor dado (atributos 4d6). */
    keptScore: number | null
}

const formatTime = (iso: string): string | null => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function diceFormula(roll: Pick<DiceRollResponse, "terms" | "modifier">): string {
    const dice = roll.terms.map((term) => `${term.quantity}${term.dice}`).join(" + ")
    if (!roll.modifier) return dice
    return `${dice} ${roll.modifier > 0 ? "+" : "−"} ${Math.abs(roll.modifier)}`
}

export function buildDiceBreakdown(roll: DiceRollResponse, options: { dropLowest?: boolean; criticalState?: DiceCriticalState | null } = {}): DiceBreakdown {
    const pair = roll.mode !== "normal" && roll.selectedD20 && typeof roll.selectedD20.discarded === "number" ? { kept: roll.selectedD20.kept, discarded: roll.selectedD20.discarded, mode: roll.mode } : null
    let pairUsed = false
    let dropped = false
    const lowest = options.dropLowest ? Math.min(...roll.terms.flatMap((term) => term.results)) : null
    const terms: BreakdownTerm[] = roll.terms.map((term) => {
        const values = term.results.map((value) => {
            if (pair && !pairUsed && term.dice === "d20" && value === pair.kept) {
                pairUsed = true
                return { value, role: "kept" as const }
            }
            if (lowest !== null && !dropped && value === lowest) {
                dropped = true
                return { value, role: "dropped" as const }
            }
            return { value, role: "rolled" as const }
        })
        return { dice: term.dice, label: `${term.quantity}${term.dice}`, values, subtotal: term.results.reduce((acc, value) => acc + value, 0) }
    })
    const lines = alignModifierParts(roll.modifierParts, roll.modifier, roll.modifierParts?.length ? MODIFIER_REMAINDER_LABEL : MODIFIER_FALLBACK_LABEL)
    // A conta fecha no total do servidor: se ele não for dados + modificador, a diferença aparece como linha própria.
    const computed = roll.diceTotal + lines.reduce((acc, part) => acc + part.value, 0)
    if (computed !== roll.total) lines.push({ label: "Ajuste do servidor", value: roll.total - computed, color: "manual" })
    const equation = `${[String(roll.diceTotal), ...lines.map((part) => `${part.value >= 0 ? "+" : "−"} ${Math.abs(part.value)}`)].join(" ")} = ${roll.total}`
    const dice = roll.terms.map((term) => `${term.quantity}${term.dice}`).join(" + ")
    return {
        label: roll.label?.trim() || null,
        mode: roll.mode,
        modeLabel: DICE_MODE_LABELS[roll.mode] ?? DICE_MODE_LABELS.normal,
        formula: diceFormula(roll),
        time: formatTime(roll.createdAt),
        terms,
        d20Pair: pair,
        diceLabel: `Dados (${dice || "—"})`,
        diceTotal: roll.diceTotal,
        lines,
        equation,
        total: roll.total,
        critical: options.criticalState !== undefined ? options.criticalState : getDiceCriticalState(roll),
        keptScore: lowest !== null && dropped ? roll.diceTotal - lowest : null,
    }
}
