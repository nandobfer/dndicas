import { MADDOX_COIN_KEYS, MADDOX_COIN_SHEET_FIELDS, MADDOX_COMBAT_COINS_MAX, type MaddoxCoinKey } from "./constants"

/**
 * Moedas da ficha pelo Maddox (DND-65) — módulo PURO. Moeda é campo da ficha (`sheet.coins`), nunca item do inventário.
 * Siglas em pt-BR: po (ouro → `gp`), pp (prata → `sp`), pe (electrum → `ep`), pc (cobre → `cp`), pl (platina → `pp`).
 */

/** `sheet.coins` como está gravado. */
export type SheetCoins = Partial<Record<"gp" | "sp" | "ep" | "cp" | "pp", number | null>>
/** Quantidades por sigla pt-BR. */
export type MaddoxCoinAmounts = Partial<Record<MaddoxCoinKey, number>>

export interface MaddoxCoinChange {
    add?: MaddoxCoinAmounts
    subtract?: MaddoxCoinAmounts
}

/** Ordem de exibição: da moeda mais valiosa à menos valiosa. */
const DISPLAY_ORDER: readonly MaddoxCoinKey[] = ["pl", "po", "pe", "pp", "pc"]

const amountOf = (coins: SheetCoins | null | undefined, key: MaddoxCoinKey) => {
    const value = Number(coins?.[MADDOX_COIN_SHEET_FIELDS[key]] ?? 0)
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/** "11 po, 20 pp" (só as moedas com saldo) ou "nenhuma". */
export function coinsText(coins: SheetCoins | null | undefined): string {
    const parts = DISPLAY_ORDER.filter((key) => amountOf(coins, key) > 0).map((key) => `${amountOf(coins, key)} ${key}`)
    return parts.length ? parts.join(", ") : "nenhuma"
}

const signedAmounts = (amounts: MaddoxCoinAmounts | undefined, sign: string) => DISPLAY_ORDER.filter((key) => (amounts?.[key] ?? 0) > 0).map((key) => `${sign}${amounts![key]} ${key}`)

/** "+2 po, −5 pp". */
export function coinChangeText(change: MaddoxCoinChange): string {
    return [...signedAmounts(change.add, "+"), ...signedAmounts(change.subtract, "−")].join(", ")
}

/** Problema no formato da alteração (valor não inteiro, negativo, acima do teto, vazia ou a mesma moeda nos dois lados). */
export function coinChangeProblem(change: MaddoxCoinChange): string | null {
    let any = false
    for (const side of ["add", "subtract"] as const) {
        for (const [key, value] of Object.entries(change[side] ?? {})) {
            if (!(MADDOX_COIN_KEYS as readonly string[]).includes(key)) return `moeda "${key}" desconhecida (use po, pp, pe, pc ou pl)`
            if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return `quantidade de ${key} inválida: informe um número inteiro maior ou igual a 0`
            if (value > MADDOX_COMBAT_COINS_MAX) return `quantidade de ${key} acima do limite (${MADDOX_COMBAT_COINS_MAX})`
            if (value > 0) any = true
        }
    }
    if (!any) return "informe ao menos uma moeda com quantidade maior que 0"
    const both = MADDOX_COIN_KEYS.filter((key) => (change.add?.[key] ?? 0) > 0 && (change.subtract?.[key] ?? 0) > 0)
    if (both.length) return `a mesma moeda (${both.join(", ")}) não pode ser somada e subtraída na mesma alteração`
    return null
}

export type CoinChangeResult = { ok: true; after: SheetCoins; inc: Record<string, number>; requires: Record<string, number> } | { ok: false; reason: string }

/**
 * Aplica a alteração ao saldo. Subtrair mais do que existe é recusado (nada muda): sem troco automático entre moedas —
 * o troco é explícito (`subtract: {po: 1}, add: {pp: 10}`). `inc` e `requires` são o `$inc` e o piso (`$gte`) da gravação.
 */
export function applyCoinChange(current: SheetCoins | null | undefined, change: MaddoxCoinChange, characterName = "O personagem"): CoinChangeResult {
    const problem = coinChangeProblem(change)
    if (problem) return { ok: false, reason: problem }
    const short = MADDOX_COIN_KEYS.filter((key) => (change.subtract?.[key] ?? 0) > amountOf(current, key))
    if (short.length) {
        const missing = short.map((key) => `tem ${amountOf(current, key)} ${key} e precisa tirar ${change.subtract![key]} ${key}`).join("; ")
        return { ok: false, reason: `${characterName} não tem moedas suficientes: ${missing} (saldo: ${coinsText(current)}). Para pagar com outra moeda, faça o troco na mesma alteração (ex.: subtrair 1 po e somar 10 pp).` }
    }
    const after: SheetCoins = Object.fromEntries(MADDOX_COIN_KEYS.map((key) => [MADDOX_COIN_SHEET_FIELDS[key], amountOf(current, key)]))
    const inc: Record<string, number> = {}
    const requires: Record<string, number> = {}
    for (const key of MADDOX_COIN_KEYS) {
        const field = MADDOX_COIN_SHEET_FIELDS[key]
        const delta = (change.add?.[key] ?? 0) - (change.subtract?.[key] ?? 0)
        if (!delta) continue
        after[field] = (after[field] ?? 0) + delta
        inc[`coins.${field}`] = delta
        if ((change.subtract?.[key] ?? 0) > 0) requires[`coins.${field}`] = change.subtract![key]!
    }
    return { ok: true, after, inc, requires }
}

const normalize = (value: string) =>
    value
        .replace(/<[^>]*>/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()

const METALS = "(ouro|prata|cobre|platina|electrum|eletro)"
const COIN_NAME = new RegExp(`^(\\d+ )?(bolsa (de |com )?)?(\\d+ )?(moedas?|pecas?)( de)? ${METALS}( \\d+)?$`)
const COIN_ABBR = /^\d+ ?(po|pp|pe|pc|pl|gp|sp|ep|cp)$/

/**
 * Nome de item que é, na verdade, moeda ("Peças de prata", "30 po", "Moedas de ouro (12)"). Não pega objetos de metal
 * ("Espada Curta de Prata") nem "Poção de Cura".
 */
export function isCoinItemName(name: string): boolean {
    const key = normalize(name)
    if (!key) return false
    return COIN_NAME.test(key) || COIN_ABBR.test(key)
}

export const COIN_ITEM_REFUSAL = 'moeda não é item: as moedas (po, pp, pe, pc, pl) ficam no campo de moedas da ficha — use {"type":"coins","add":{…}} / {"type":"coins","subtract":{…}} (ou update_character_coins)'
