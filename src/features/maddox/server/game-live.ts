import { randomUUID } from "node:crypto"
import { loggerFor } from "@/lib/logger"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxGameStreamLine, MaddoxLiveGenerationDto } from "../game-types"

/**
 * Barramento em memória da mesa do Maddox (Maddox 4) — SOMENTE servidor, em `globalThis` (o app roda num processo
 * só e o `next dev` recarrega módulos). Por campanha:
 *
 * - **fila em série**: uma geração do Maddox por vez (narração ou resposta). Evita duas gerações na mesma sessão do
 *   OpenCode e corridas no estado gravado pelas ferramentas;
 * - **gerações ao vivo**: o texto já transmitido, enviado no `snapshot` a quem conecta no meio;
 * - **ouvintes** do stream NDJSON (`GET …/game/stream`);
 * - **jobs ativos**: o token de turno do MCP só vale enquanto o job dele está rodando. Cada job guarda o que é dele
 *   (tipo de geração, rodada de testes) e os testes pedidos pela ferramenta `request_check` (Maddox 5), que só viram
 *   mensagens depois que a narração é gravada — se a geração falhar, eles somem com o job.
 */

type Listener = (line: MaddoxGameStreamLine) => void

interface CampaignHub {
    tail: Promise<void>
    pending: number
    live: Map<string, MaddoxLiveGenerationDto>
    listeners: Set<Listener>
    jobs: Map<string, MaddoxJobState>
}

/** O que a geração faz: narração do turno do mestre (rodada de testes `round`) ou resposta a uma pergunta. */
export interface MaddoxJobMeta {
    kind: "narration" | "answer"
    turnNumber: number
    round: number
}

/** Teste pedido pelo narrador durante a geração (ainda não gravado). */
export interface MaddoxDraftCheck {
    memberId: string
    userId: string
    characterId: string
    characterName: string
    sheetId: string | null
    kind: "skill" | "ability" | "save"
    ability: string
    skill: string | null
    dc: number
    mode: "normal" | "advantage" | "disadvantage"
    reason: string
}

/** Adversário ou aliado informado pelo narrador (`start_combat`/`update_combat`). */
export interface MaddoxDraftCombatant {
    name: string
    side: "inimigo" | "aliado"
    quantity: number
    description: string
    condition: string
    /** Cria o NPC se ainda não existir (só nomes próprios). */
    registerNpc: boolean
}

/** Recompensa informada pelo narrador em `end_combat` (personagem já resolvido pelo nome). */
export interface MaddoxDraftCombatReward {
    kind: "moedas" | "item" | "outro"
    description: string
    characterId: string | null
    characterName: string | null
    coins: Partial<Record<"po" | "pp" | "pe" | "pc" | "pl", number>> | null
    item: { ref: string; quantity: number } | null
}

/**
 * Evento de combate pedido pelo narrador (Maddox 6). Como os testes, fica no job até a narração ser gerada e só então é
 * aplicado (`applyCombatDrafts`): se a geração falhar, o combate não muda.
 */
export type MaddoxDraftCombatEvent =
    | { type: "start"; title: string; location: string; combatants: MaddoxDraftCombatant[] }
    | { type: "update"; combatants: (Partial<Omit<MaddoxDraftCombatant, "name">> & { name: string })[] }
    | {
          type: "end"
          outcome: "vitoria" | "derrota" | "fuga" | "tregua" | "interrompido"
          summary: string
          masterNotes: string
          combatants: { name: string; outcome: "morto" | "derrotado" | "capturado" | "rendeu-se" | "fugiu" | "poupado" | "ileso" }[]
          rewards: MaddoxDraftCombatReward[]
          characterStates: { characterId: string; characterName: string; condition: string }[]
          finalScene: string
      }

interface MaddoxJobState {
    meta: MaddoxJobMeta | null
    checks: MaddoxDraftCheck[]
    combat: MaddoxDraftCombatEvent[]
}

const log = loggerFor({ module: "maddox", feature: "game-live" })

const globalHub = globalThis as unknown as { __maddoxGameHub?: Map<string, CampaignHub> }
const hubs: Map<string, CampaignHub> = (globalHub.__maddoxGameHub ??= new Map())

function hubOf(campaignId: string): CampaignHub {
    let hub = hubs.get(campaignId)
    if (!hub) {
        hub = { tail: Promise.resolve(), pending: 0, live: new Map(), listeners: new Set(), jobs: new Map() }
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
export function enqueueMaddoxJob(campaignId: string, label: string, run: (job: MaddoxJob) => Promise<void>, meta: MaddoxJobMeta | null = null): Promise<void> {
    const hub = hubOf(campaignId)
    hub.pending += 1
    const jobId = randomUUID()
    const next = hub.tail.then(async () => {
        hub.jobs.set(jobId, { meta, checks: [], combat: [] })
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

/** Tipo e rodada do job em andamento (`null` = job sem metadados ou que já terminou). */
export function maddoxJobMeta(campaignId: string, jobId: string): MaddoxJobMeta | null {
    return hubs.get(campaignId)?.jobs.get(jobId)?.meta ?? null
}

/** Testes já pedidos neste job (para validar duplicados). */
export function jobDraftChecks(campaignId: string, jobId: string): readonly MaddoxDraftCheck[] {
    return hubs.get(campaignId)?.jobs.get(jobId)?.checks ?? []
}

/** Guarda um teste pedido pelo narrador no job em andamento; `false` se o job não está rodando. */
export function addDraftCheck(campaignId: string, jobId: string, check: MaddoxDraftCheck): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    job.checks.push(check)
    return true
}

/** Retira os testes pedidos no job (depois de gravar a narração). */
export function takeDraftChecks(campaignId: string, jobId: string): MaddoxDraftCheck[] {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return []
    const checks = job.checks
    job.checks = []
    return checks
}

/** Eventos de combate já pedidos neste job (o estado do combate considera banco + rascunho). */
export function jobDraftCombat(campaignId: string, jobId: string): readonly MaddoxDraftCombatEvent[] {
    return hubs.get(campaignId)?.jobs.get(jobId)?.combat ?? []
}

/** Guarda um evento de combate no job em andamento; `false` se o job não está rodando. */
export function addDraftCombat(campaignId: string, jobId: string, event: MaddoxDraftCombatEvent): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    job.combat.push(event)
    return true
}

/** Retira os eventos de combate do job (antes de gravar a narração). */
export function takeDraftCombat(campaignId: string, jobId: string): MaddoxDraftCombatEvent[] {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return []
    const events = job.combat
    job.combat = []
    return events
}

/** Avisa as mesas abertas que um teste foi rolado (todos repetem a animação com o resultado oficial). */
export function emitCheckRolled(campaignId: string, messageId: string, roll: DiceRollResponse): void {
    emit(campaignId, { type: "check-rolled", messageId, roll })
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
