import { MADDOX_COMBAT_PREP_STALL_NOTICE_MS } from "./constants"
import type { MaddoxTacticalSlotDto } from "./game-types"

/**
 * DND-75: regra única de "preparação parada", usada pelo servidor (autoriza "Reiniciar"/"Seguir sem preparação") e pela
 * tela (aviso do dono, calculado com o relógio do cliente a partir de `prep.since`, sem depender de nova leitura da mesa).
 * Só a preparação `running` conta, desde o início do job (`startedAt`): a `pending` está na fila serial da campanha atrás
 * das outras e não é alarme (uma órfã de reinício volta à fila sozinha, pela retomada).
 */
export interface CombatPrepClock {
    status: string
    startedAt?: Date | string | null
}

export function combatPrepSince(prep: CombatPrepClock): Date | null {
    if (prep.status !== "running" || !prep.startedAt) return null
    const date = new Date(prep.startedAt)
    return Number.isNaN(date.getTime()) ? null : date
}

export function isCombatPrepStalled(prep: CombatPrepClock, now: number = Date.now()): boolean {
    const since = combatPrepSince(prep)
    return Boolean(since && now - since.getTime() >= MADDOX_COMBAT_PREP_STALL_NOTICE_MS)
}

export interface StalledCombatPrep {
    prepId: string
    characterName: string
    since: string
}

/** Tela: preparações "Preparando…" da ordem há mais que o aviso (mesma regra do servidor, com o relógio do cliente). */
export function stalledCombatPreps(order: readonly Pick<MaddoxTacticalSlotDto, "name" | "prep">[], now: number): StalledCombatPrep[] {
    return order.flatMap((slot) => {
        const prep = slot.prep
        if (!prep?.prepId || !prep.since || prep.status !== "preparing") return []
        return isCombatPrepStalled({ status: "running", startedAt: prep.since }, now) ? [{ prepId: prep.prepId, characterName: slot.name, since: prep.since }] : []
    })
}

/** Tempo decorrido para o selo ("12 min", "1 h 5 min"); abaixo de 1 min, nada. */
export function prepElapsedLabel(since: string | null | undefined, now: number): string | null {
    if (!since) return null
    const start = new Date(since).getTime()
    if (Number.isNaN(start)) return null
    const minutes = Math.floor((now - start) / 60_000)
    if (minutes < 1) return null
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${hours} h ${rest} min` : `${hours} h`
}
