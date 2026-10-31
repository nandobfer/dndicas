import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import { ABILITY_SCORE_KEYS, STANDARD_ARRAY_VALUES, calculateFinalDiceScore, isValidPointBuy } from "@/features/character-sheets/utils/ability-score-rules"
import { MADDOX_ABILITY_BONUS_MAX, MADDOX_ABILITY_BONUS_POINTS, MADDOX_ABILITY_METHOD_LABELS, MADDOX_ABILITY_ROLLS, type MaddoxAbilityMethod } from "./constants"
import { MADDOX_ABILITY_LABELS } from "./check-modifier"

/**
 * Atributos na entrevista de personagem (Maddox 5) — módulo PURO (tela, servidor e testes). Confere o envio de cada
 * método, o bônus do antecedente e deriva o valor final (base + bônus).
 */

export type AbilityScores = Record<AttributeType, number>
export type AbilityBonusParts = Partial<Record<AttributeType, number>>

export const ABILITY_KEYS = ABILITY_SCORE_KEYS

/** Rótulo pt-BR → chave (entrada das ferramentas do Maddox). */
export const ABILITY_BY_LABEL = Object.fromEntries(ABILITY_KEYS.map((key) => [MADDOX_ABILITY_LABELS[key], key])) as Record<string, AttributeType>
export const ABILITY_LABEL_LIST = ABILITY_KEYS.map((key) => MADDOX_ABILITY_LABELS[key]) as [string, ...string[]]

const sameMultiset = (left: readonly number[], right: readonly number[]) => {
    if (left.length !== right.length) return false
    const a = [...left].sort((x, y) => x - y)
    const b = [...right].sort((x, y) => x - y)
    return a.every((value, index) => value === b[index])
}

export interface AbilityRollsState {
    scores: number[]
    sixth: number | null
    invalid: boolean
}

/** Pontuações já roladas: as cinco rolagens e, quando válida, a sexta (72 − soma). */
export function rolledScores(rolls: AbilityRollsState | null): number[] {
    if (!rolls) return []
    return rolls.sixth !== null && !rolls.invalid ? [...rolls.scores, rolls.sixth] : [...rolls.scores]
}

/** Sexta pontuação a partir das cinco rolagens (`invalid` quando fica fora de 3–18). */
export function sixthScore(scores: number[]): { sixth: number | null; invalid: boolean } {
    if (scores.length < MADDOX_ABILITY_ROLLS) return { sixth: null, invalid: false }
    const sixth = calculateFinalDiceScore(scores)
    return sixth === null ? { sixth: null, invalid: true } : { sixth, invalid: false }
}

/** Erro em pt-BR quando o envio não segue o método (`null` = válido). */
export function validateSubmission(method: MaddoxAbilityMethod, scores: Partial<AbilityScores>, rolls: AbilityRollsState | null): string | null {
    const values = ABILITY_KEYS.map((key) => scores[key])
    if (values.some((value) => typeof value !== "number" || !Number.isInteger(value))) return "Defina um valor inteiro para cada um dos seis atributos."
    const list = values as number[]
    if (method === "standard") return sameMultiset(list, STANDARD_ARRAY_VALUES) ? null : "No conjunto padrão, use cada valor (15, 14, 13, 12, 10 e 8) exatamente uma vez."
    if (method === "point-buy") return isValidPointBuy(scores) ? null : "Na compra de pontos, cada atributo fica entre 8 e 15 e o custo total não passa de 27 pontos."
    if (!rolls || rolls.scores.length < MADDOX_ABILITY_ROLLS) return `Faça as ${MADDOX_ABILITY_ROLLS} rolagens de 4d6 antes de enviar.`
    if (rolls.invalid || rolls.sixth === null) return "A sexta pontuação ficou fora do intervalo 3-18. Reinicie as rolagens."
    return sameMultiset(list, rolledScores(rolls)) ? null : "Distribua exatamente as seis pontuações roladas, uma por atributo."
}

/** Erro em pt-BR quando o bônus não segue a regra (`suggested` vazio = qualquer atributo). */
export function validateBonus(parts: AbilityBonusParts, suggested: readonly AttributeType[]): string | null {
    const entries = Object.entries(parts).filter(([, value]) => value !== 0 && value !== undefined) as [AttributeType, number][]
    if (!entries.length) return `Distribua ${MADDOX_ABILITY_BONUS_POINTS} pontos de bônus.`
    if (entries.some(([key, value]) => !ABILITY_KEYS.includes(key as (typeof ABILITY_KEYS)[number]) || !Number.isInteger(value) || value < 1 || value > MADDOX_ABILITY_BONUS_MAX)) return `Cada atributo recebe +1 ou +${MADDOX_ABILITY_BONUS_MAX} de bônus.`
    const total = entries.reduce((sum, [, value]) => sum + value, 0)
    if (total !== MADDOX_ABILITY_BONUS_POINTS) return `O bônus do antecedente soma exatamente ${MADDOX_ABILITY_BONUS_POINTS} pontos (recebido: ${total}).`
    if (suggested.length) {
        const outside = entries.filter(([key]) => !suggested.includes(key)).map(([key]) => MADDOX_ABILITY_LABELS[key])
        if (outside.length) return `O antecedente só dá bônus em ${suggested.map((key) => MADDOX_ABILITY_LABELS[key]).join(", ")} (recebido também: ${outside.join(", ")}).`
    }
    return null
}

/** Valor final de cada atributo: base + bônus. */
export function finalScores(base: AbilityScores, bonus: AbilityBonusParts | null | undefined): AbilityScores {
    return Object.fromEntries(ABILITY_KEYS.map((key) => [key, base[key] + (bonus?.[key] ?? 0)])) as AbilityScores
}

/** Linha legível para o prompt e a fala interna, ex.: "Força 15 (+2) = 17, Destreza 14, …". */
export function scoresLine(base: AbilityScores, bonus?: AbilityBonusParts | null): string {
    return ABILITY_KEYS.map((key) => {
        const extra = bonus?.[key] ?? 0
        return extra ? `${MADDOX_ABILITY_LABELS[key]} ${base[key]} (+${extra}) = ${base[key] + extra}` : `${MADDOX_ABILITY_LABELS[key]} ${base[key]}`
    }).join(", ")
}

export const abilityMethodLabel = (method: MaddoxAbilityMethod) => MADDOX_ABILITY_METHOD_LABELS[method]
