import { loggerFor } from "@/lib/logger"

/**
 * Execuções vivas dos Personagens Opex neste processo (DND-26): instância única, então um registro em `globalThis`
 * basta. Serve para o single-flight (uma execução por chave) e para reconhecer, depois de um reinício, o estado
 * "em andamento" gravado no banco sem processo vivo (vira falha acionável).
 */

const log = loggerFor({ module: "maddox", feature: "opex" })

interface OpexRuntime {
    running: Map<string, Promise<void>>
    again: Set<string>
}

const globalRef = globalThis as typeof globalThis & { __maddoxOpexRuntime?: OpexRuntime }
const runtime: OpexRuntime = (globalRef.__maddoxOpexRuntime ??= { running: new Map(), again: new Set() })

export const isOpexRunning = (key: string) => runtime.running.has(key)

/**
 * Roda `task` com single-flight por `key`. Chamada durante uma execução marca uma nova passada, que roda logo depois
 * (o estado pode ter mudado no meio). Nunca rejeita: falhas são logadas.
 */
export function runOpexOnce(key: string, task: () => Promise<void>): Promise<void> {
    const current = runtime.running.get(key)
    if (current) {
        runtime.again.add(key)
        return current
    }
    const run = (async () => {
        try {
            do {
                runtime.again.delete(key)
                await task()
            } while (runtime.again.has(key))
        } catch (error) {
            log.warn({ key, err: error instanceof Error ? error.message : String(error) }, "[maddox] Falha na execução do Personagem Opex")
        } finally {
            runtime.running.delete(key)
            runtime.again.delete(key)
        }
    })()
    runtime.running.set(key, run)
    return run
}

/** Espera todas as execuções vivas terminarem (testes). */
export async function waitForOpexIdle(): Promise<void> {
    for (let round = 0; round < 50 && runtime.running.size > 0; round++) await Promise.allSettled([...runtime.running.values()])
}

/** Espera as execuções vivas destas chaves, com teto (reinício da campanha, DND-50). Nunca rejeita. */
export async function waitForOpexKeys(keys: readonly string[], timeoutMs: number): Promise<void> {
    const runs = keys.map((key) => runtime.running.get(key)).filter((run): run is Promise<void> => Boolean(run))
    if (!runs.length) return
    let timer: ReturnType<typeof setTimeout> | null = null
    await Promise.race([Promise.allSettled(runs), new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)))])
    if (timer) clearTimeout(timer)
}
