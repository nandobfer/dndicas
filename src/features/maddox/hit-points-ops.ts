/**
 * PV fora do combate tático (DND-49) — módulo PURO. Operações da ferramenta `update_character_hit_points` do narrador
 * e da checagem de quem está a 0 PV ao abrir o combate: curar, definir, estabilizar e acordar com 1 PV. Os dados são
 * rolados pelo servidor antes; aqui só a regra sobre os campos da ficha. O descanso (dados de vida, PV máximos) é do
 * `start_rest` (DND-58, `rest-rules.ts`).
 */

export const MADDOX_HIT_POINT_OPERATIONS = ["curar", "definir", "estabilizar", "acordar"] as const
export type MaddoxHitPointOperation = (typeof MADDOX_HIT_POINT_OPERATIONS)[number]

export interface SheetHitPoints {
    hp: number
    hpMax: number
    tempHp: number
    deathSuccess: number
    deathFailure: number
}

export type HitPointsChange =
    | { op: "curar"; amount: number }
    | { op: "definir"; value: number }
    | { op: "estabilizar" }
    | { op: "acordar" }

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
    }
}

/** "PV de Nala: 0 → 1 (acordou na caverna)". */
export const hitPointsLine = (name: string, before: number, after: number, reason: string) => `PV de ${name}: ${before} → ${after} (${reason})`
