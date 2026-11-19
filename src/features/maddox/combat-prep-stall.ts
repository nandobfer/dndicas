import { MADDOX_COMBAT_PREP_STALL_NOTICE_MS } from "./constants"

/**
 * DND-75: regra única de "preparação parada". Uma preparação `running` conta desde o início do job (`startedAt`); uma
 * `pending`, desde a última mudança (`updatedAt`: entrada na fila, resposta do jogador, "Tentar de novo"). Passou de
 * `MADDOX_COMBAT_PREP_STALL_NOTICE_MS`, a mesa mostra o aviso e o dono pode reiniciar ou seguir sem a preparação.
 */
export interface CombatPrepClock {
    status: string
    startedAt?: Date | string | null
    updatedAt?: Date | string | null
}

export function combatPrepSince(prep: CombatPrepClock): Date | null {
    const value = prep.status === "running" ? prep.startedAt : prep.status === "pending" ? prep.updatedAt : null
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

export function isCombatPrepStalled(prep: CombatPrepClock, now: number = Date.now()): boolean {
    const since = combatPrepSince(prep)
    return Boolean(since && now - since.getTime() >= MADDOX_COMBAT_PREP_STALL_NOTICE_MS)
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
