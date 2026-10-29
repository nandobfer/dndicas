import { DomainError } from "@/lib/api/route"
import type { OpexAnonymousSettings } from "../schemas"

/**
 * Limite de turnos dos visitantes anônimos do Agente Opex (por visitante e por IP, janela de uma
 * hora). Em memória do processo: o DnDicas roda numa única instância (PM2 com uma instância, um
 * processo no Docker), então o contador é o mesmo para todas as requisições. Reiniciar zera.
 */

const WINDOW_MS = 60 * 60 * 1000

interface Bucket {
    hits: number[]
}

type RateLimitStore = { visitors: Map<string, Bucket>; ips: Map<string, Bucket> }

const globalForRateLimit = globalThis as typeof globalThis & { __opexAnonymousRateLimit?: RateLimitStore }
const store: RateLimitStore = (globalForRateLimit.__opexAnonymousRateLimit ??= { visitors: new Map(), ips: new Map() })

function prune(bucket: Bucket, now: number): void {
    const since = now - WINDOW_MS
    while (bucket.hits.length && bucket.hits[0]! <= since) bucket.hits.shift()
}

function bucketOf(map: Map<string, Bucket>, key: string, now: number): Bucket {
    const bucket = map.get(key) ?? { hits: [] }
    prune(bucket, now)
    map.set(key, bucket)
    return bucket
}

/** Minutos até liberar o próximo turno (a mais antiga da janela sai). */
function minutesUntilFree(bucket: Bucket, now: number): number {
    const oldest = bucket.hits[0] ?? now
    return Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 60_000))
}

/**
 * Conta um turno do visitante; acima do limite responde 429 em pt-BR com o tempo de espera.
 * Módulo testável: `now` injetável.
 */
export function assertAnonymousTurnAllowed(anonymousId: string, ip: string | null, limits: Pick<OpexAnonymousSettings, "turnsPerHourPerVisitor" | "turnsPerHourPerIp">, now = Date.now()): void {
    const visitor = bucketOf(store.visitors, anonymousId, now)
    const byIp = ip ? bucketOf(store.ips, ip, now) : null
    const blocked = visitor.hits.length >= limits.turnsPerHourPerVisitor ? visitor : byIp && byIp.hits.length >= limits.turnsPerHourPerIp ? byIp : null
    if (blocked) {
        throw new DomainError(
            429,
            `Limite de mensagens para visitantes atingido. Tente de novo em ${minutesUntilFree(blocked, now)} min ou entre na sua conta para continuar.`,
            "OPEX_RATE_LIMITED",
        )
    }
    visitor.hits.push(now)
    byIp?.hits.push(now)
}

/** Zera os contadores (testes). */
export function resetAnonymousRateLimit(): void {
    store.visitors.clear()
    store.ips.clear()
}

/** IP do cliente a partir dos cabeçalhos do proxy (primeiro de `x-forwarded-for`) ou `x-real-ip`. */
export function clientIpOf(headers: Headers): string | null {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    return forwarded || headers.get("x-real-ip")?.trim() || null
}
