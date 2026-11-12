/**
 * Exaustão (DND-58) — módulo PURO, servidor e tela. A ficha guarda o nível (0–6, `exhaustion`); cada nível tira 2 de todo
 * teste de d20 rolado na mesa Maddox e o nível 6 mata o personagem. O descanso longo concluído tira 1 nível.
 */

export const MADDOX_EXHAUSTION_MAX = 6
export const MADDOX_EXHAUSTION_DEATH_LEVEL = 6

/** Nível dentro de 0–6 (valores antigos, ausentes ou fora da faixa viram o limite). */
export const exhaustionLevel = (value: number | null | undefined) => Math.max(0, Math.min(MADDOX_EXHAUSTION_MAX, Math.floor(Number(value) || 0)))

/** −2 por nível em todos os testes de d20. */
export const exhaustionPenaltyOf = (level: number | null | undefined) => {
    const value = exhaustionLevel(level)
    return value === 0 ? 0 : -2 * value
}

/** Próximo nível depois de uma variação (presa a 0–6). */
export const nextExhaustion = (current: number | null | undefined, delta: number) => exhaustionLevel(exhaustionLevel(current) + Math.trunc(delta))

export const isExhaustionDeath = (level: number | null | undefined) => exhaustionLevel(level) >= MADDOX_EXHAUSTION_DEATH_LEVEL

/** "Exaustão de Nala: 1 → 2 (marcha forçada)". */
export const exhaustionLine = (name: string, before: number, after: number, reason: string) => `Exaustão de ${name}: ${before} → ${after}${reason.trim() ? ` (${reason.trim()})` : ""}`
