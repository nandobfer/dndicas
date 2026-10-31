import { randomUUID } from "node:crypto"
import { loggerFor } from "@/lib/logger"
import type { MaddoxGameStreamLine, MaddoxLiveGenerationDto } from "../game-types"

/**
 * Barramento em memória da mesa do Maddox (Maddox 4) — SOMENTE servidor, em `globalThis` (o app roda num processo
 * só e o `next dev` recarrega módulos). Por campanha:
 *
 * - **fila em série**: uma geração do Maddox por vez (narração ou resposta). Evita duas gerações na mesma sessão do
 *   OpenCode e corridas no estado gravado pelas ferramentas;
 * - **gerações ao vivo**: o texto já transmitido, enviado no `snapshot` a quem conecta no meio;
 * - **ouvintes** do stream NDJSON (`GET …/game/stream`);
 * - **jobs ativos**: o token de turno do MCP só vale enquanto o job dele está rodando.
 */

type Listener = (line: MaddoxGameStreamLine) => void

interface CampaignHub {
    tail: Promise<void>
    pending: number
    live: Map<string, MaddoxLiveGenerationDto>
    listeners: Set<Listener>
    jobs: Set<string>
}

const log = loggerFor({ module: "maddox", feature: "game-live" })

const globalHub = globalThis as unknown as { __maddoxGameHub?: Map<string, CampaignHub> }
const hubs: Map<string, CampaignHub> = (globalHub.__maddoxGameHub ??= new Map())

function hubOf(campaignId: string): CampaignHub {
    let hub = hubs.get(campaignId)
    if (!hub) {
        hub = { tail: Promise.resolve(), pending: 0, live: new Map(), listeners: new Set(), jobs: new Set() }
        hubs.set(campaignId, hub)
    }
    return hub
}

/** Hub sem fila, ao vivo nem ouvintes sai do mapa (não acumula campanhas antigas). */
function prune(campaignId: string) {
    const hub = hubs.get(campaignId)
    if (hub && hub.pending === 0 && hub.live.size === 0 && hub.listeners.size === 0) hubs.delete(campaignId)
}

function emit(campaignId: string, line: MaddoxGameStreamLine) {
    for (const listener of hubs.get(campaignId)?.listeners ?? []) {
        try {
            listener(line)
        } catch {
            // ouvinte com problema não derruba os demais
        }
    }
}

export interface MaddoxJob {
    jobId: string
}

/**
 * Põe uma geração na fila da campanha (uma por vez). Devolve a promessa do job, que nunca rejeita: a falha é
 * logada (o job deve tratar e gravar as próprias falhas).
 */
export function enqueueMaddoxJob(campaignId: string, label: string, run: (job: MaddoxJob) => Promise<void>): Promise<void> {
    const hub = hubOf(campaignId)
    hub.pending += 1
    const jobId = randomUUID()
    const next = hub.tail.then(async () => {
        hub.jobs.add(jobId)
        try {
            await run({ jobId })
        } catch (error) {
            log.error({ err: error instanceof Error ? error.message : String(error), campaignId, job: label }, "[maddox] falha numa geração da mesa")
        } finally {
            hub.jobs.delete(jobId)
            hub.pending -= 1
            prune(campaignId)
        }
    })
    hub.tail = next
    return next
}

/** Há geração do Maddox na fila ou rodando neste processo. */
export function isCampaignBusy(campaignId: string): boolean {
    return (hubs.get(campaignId)?.pending ?? 0) > 0
}

/** Espera a fila da campanha esvaziar (inclusive jobs enfileirados por outros jobs). */
export async function waitForCampaignIdle(campaignId: string): Promise<void> {
    for (;;) {
        const hub = hubs.get(campaignId)
        if (!hub || hub.pending === 0) return
        await hub.tail
    }
}

export function isActiveMaddoxJob(campaignId: string, jobId: string): boolean {
    return hubs.get(campaignId)?.jobs.has(jobId) ?? false
}

export interface LiveSink {
    liveId: string
    delta(text: string): void
    tool(running: boolean): void
    end(result: { messageId: string | null; error: string | null }): void
}

/** Começa uma geração ao vivo (todos os ouvintes recebem `live-start`). */
export function beginLive(campaignId: string, input: Pick<MaddoxLiveGenerationDto, "kind" | "turnNumber" | "replyToId">): LiveSink {
    const hub = hubOf(campaignId)
    const live: MaddoxLiveGenerationDto = { liveId: randomUUID(), ...input, text: "", tool: false, startedAt: new Date().toISOString() }
    hub.live.set(live.liveId, live)
    emit(campaignId, { type: "live-start", live: { ...live } })
    let ended = false
    return {
        liveId: live.liveId,
        delta(text) {
            if (ended || !text) return
            live.text += text
            emit(campaignId, { type: "delta", liveId: live.liveId, text })
        },
        tool(running) {
            if (ended || live.tool === running) return
            live.tool = running
            emit(campaignId, { type: "tool", liveId: live.liveId, running })
        },
        end(result) {
            if (ended) return
            ended = true
            hubs.get(campaignId)?.live.delete(live.liveId)
            emit(campaignId, { type: "live-end", liveId: live.liveId, ...result })
            prune(campaignId)
        },
    }
}

export function liveSnapshot(campaignId: string): MaddoxLiveGenerationDto[] {
    return [...(hubs.get(campaignId)?.live.values() ?? [])].map((live) => ({ ...live }))
}

/** Assina o barramento da campanha; devolve a função de saída. */
export function subscribeGameLive(campaignId: string, listener: Listener): () => void {
    const hub = hubOf(campaignId)
    hub.listeners.add(listener)
    return () => {
        hubs.get(campaignId)?.listeners.delete(listener)
        prune(campaignId)
    }
}
