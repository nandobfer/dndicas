import { stableHash } from "@engramind/client/react"
import type { MemoryUniverseProps } from "@engramind/client/react"

/** Memória do universo (o tipo da lib, derivado das props do `MemoryUniverse`). */
export type SampleMemory = MemoryUniverseProps["memories"][number]

export const SAMPLE_UNIVERSE_LIMITS = { count: { min: 1, max: 500, default: 120 }, channels: { min: 1, max: 8, default: 3 } } as const
const DAY_MS = 86_400_000

/** Número estável em [0, 1) de uma chave (sem `Math.random()`: a mesma amostra em toda renderização). */
const unit = (key: string) => stableHash(key) / 2 ** 32

/**
 * Universo de exemplo da prévia da aba Visualização (DND-34, copiado do Opex OPE-142): `count` memórias em `channels` canais, com
 * datas espalhadas por ~1 ano, usos variados, algumas fixadas e inativas. Determinístico.
 */
export function buildSampleUniverse(count: number, channels: number): { memories: SampleMemory[]; channels: string[] } {
    const total = Math.min(SAMPLE_UNIVERSE_LIMITS.count.max, Math.max(SAMPLE_UNIVERSE_LIMITS.count.min, Math.round(count)))
    const slugs = Array.from({ length: Math.min(SAMPLE_UNIVERSE_LIMITS.channels.max, Math.max(SAMPLE_UNIVERSE_LIMITS.channels.min, Math.round(channels))) }, (_, index) => `exemplo/canal-${index + 1}`)
    const now = Date.now()
    const memories = Array.from({ length: total }, (_, index): SampleMemory => {
        const id = `exemplo-${index + 1}`
        const age = Math.floor(unit(`${id}:age`) * 365)
        const created = new Date(now - age * DAY_MS).toISOString()
        const uses = Math.floor(unit(`${id}:uses`) ** 3 * 60)
        const roll = unit(`${id}:status`)
        return {
            id,
            channel: slugs[Math.floor(unit(`${id}:channel`) * slugs.length)] ?? slugs[0]!,
            title: `Memória de exemplo ${index + 1}`,
            text: "Memória fictícia da prévia: nada aqui vem do Engramind.",
            category: "fact",
            status: roll > 0.95 ? "permanent" : roll < 0.05 ? "archived" : "active",
            version: 1,
            createdAt: created,
            updatedAt: new Date(new Date(created).getTime() + Math.floor(unit(`${id}:upd`) * 30) * DAY_MS).toISOString(),
            retrievals: uses,
            injections: Math.floor(uses / 2),
            lastRetrievedAt: uses > 0 ? new Date(now - Math.floor(unit(`${id}:last`) * 120) * DAY_MS).toISOString() : null,
            verifiedAt: null,
            stale: false,
            author: null,
        }
    })
    return { memories, channels: slugs }
}
