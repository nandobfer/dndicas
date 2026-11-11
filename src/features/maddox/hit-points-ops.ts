/**
 * PV fora do combate tático (DND-49) — módulo PURO. Operações da ferramenta `update_character_hit_points` do narrador
 * e da checagem de quem está a 0 PV ao abrir o combate: curar, definir, estabilizar, acordar com 1 PV, descanso curto
 * (dados de vida) e descanso longo. Os dados são rolados pelo servidor antes; aqui só a regra sobre os campos da ficha.
 */

export const MADDOX_HIT_POINT_OPERATIONS = ["curar", "definir", "estabilizar", "acordar", "descanso-curto", "descanso-longo"] as const
export type MaddoxHitPointOperation = (typeof MADDOX_HIT_POINT_OPERATIONS)[number]

export interface SheetHitPoints {
    hp: number
    hpMax: number
    tempHp: number
    deathSuccess: number
    deathFailure: number
    /** Dados de vida gastos e o total da ficha ("3d8"). */
    hitDiceUsed: number
    hitDiceTotal: string
}

export type HitPointsChange =
    | { op: "curar"; amount: number }
    | { op: "definir"; value: number }
    | { op: "estabilizar" }
    | { op: "acordar" }
    /** `healed` = soma dos dados de vida rolados (com o modificador de Constituição) e `spent` = quantos dados. */
    | { op: "descanso-curto"; healed: number; spent: number }
    | { op: "descanso-longo" }

/** "3d8" → { count: 3, die: "d8" }; vários tipos ("2d10 + 1d8") somam a quantidade e usam o primeiro dado. */
export function parseHitDice(total: string | null | undefined): { count: number; die: string } | null {
    const matches = [...String(total ?? "").matchAll(/(\d+)\s*d\s*(\d+)/gi)]
    if (!matches.length) return null
    const count = matches.reduce((sum, match) => sum + Number(match[1]), 0)
    return count > 0 ? { count, die: `d${matches[0]![2]}` } : null
}

export const availableHitDice = (sheet: Pick<SheetHitPoints, "hitDiceTotal" | "hitDiceUsed">) => Math.max(0, (parseHitDice(sheet.hitDiceTotal)?.count ?? 0) - Math.max(0, sheet.hitDiceUsed))

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.floor(value)))
const awake = (next: SheetHitPoints) => (next.hp > 0 ? { ...next, deathSuccess: 0, deathFailure: 0 } : next)

/** Aplica a operação. `error` (pt-BR) = recusada, nada muda. PV nunca passa do máximo. */
export function applyHitPointsChange(current: SheetHitPoints, change: HitPointsChange): { next: SheetHitPoints; error: string | null } {
    const refuse = (error: string) => ({ next: current, error })
    switch (change.op) {
        case "curar":
            if (change.amount <= 0) return refuse("Informe uma cura maior que zero.")
            return { next: awake({ ...current, hp: clamp(current.hp + change.amount, current.hpMax) }), error: null }
        case "definir":
            return { next: awake({ ...current, hp: clamp(change.value, current.hpMax) }), error: null }
        case "estabilizar":
            if (current.hp > 0) return refuse("O personagem não está a 0 PV: não há o que estabilizar.")
            return { next: { ...current, deathSuccess: 3, deathFailure: 0 }, error: null }
        case "acordar":
            if (current.hp > 0) return refuse("O personagem não está a 0 PV.")
            if (current.deathSuccess < 3) return refuse("O personagem precisa estar estabilizado para voltar com 1 PV (use estabilizar antes, ou cure).")
            return { next: { ...current, hp: 1, deathSuccess: 0, deathFailure: 0 }, error: null }
        case "descanso-curto":
            if (change.spent <= 0) return { next: current, error: "Informe quantos dados de vida o personagem gasta no descanso curto." }
            return { next: awake({ ...current, hp: clamp(current.hp + Math.max(0, change.healed), current.hpMax), hitDiceUsed: current.hitDiceUsed + change.spent }), error: null }
        case "descanso-longo":
            // Só PV máximos e testes contra a morte (escopo do E1); os dados de vida gastos ficam como estão.
            return { next: { ...current, hp: current.hpMax, tempHp: 0, deathSuccess: 0, deathFailure: 0 }, error: null }
    }
}

/** "PV de Nala: 0 → 1 (acordou na caverna)". */
export const hitPointsLine = (name: string, before: number, after: number, reason: string) => `PV de ${name}: ${before} → ${after} (${reason})`
