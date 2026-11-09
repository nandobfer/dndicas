import { randomUUID } from "node:crypto"
import { loggerFor } from "@/lib/logger"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxGameStreamLine, MaddoxLiveGenerationDto, MaddoxLiveRollDto } from "../game-types"
import type { TacticalDraftCombatant } from "./tactical-combat"

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
    | { type: "start"; title: string; location: string; combatants: MaddoxDraftCombatant[]; tactical?: { surprise: "personagens" | "adversarios" | null; combatants: TacticalDraftCombatant[] } }
    | { type: "update"; combatants: (Partial<Omit<MaddoxDraftCombatant, "name">> & { name: string })[]; tactical?: TacticalDraftCombatant[] }
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

/**
 * Imagem da cena pedida pelo narrador (`request_scene_image`, Maddox 10): como os testes, só vira pedido depois que a
 * narração é gravada (ligada a ela); se a geração falhar, some com o job.
 */
export interface MaddoxDraftSceneImage {
    situation: string
    description: string
    caption: string
    characters: string[]
    npcs: string[]
    catalog: { type: string; id: string }[]
}

/** Sugestões de ação pedidas pelo narrador (`suggest_actions`, DND-30) para um personagem. */
export interface MaddoxDraftActionOptions {
    memberId: string
    characterId: string
    characterName: string
    options: string[]
}

interface MaddoxJobState {
    meta: MaddoxJobMeta | null
    checks: MaddoxDraftCheck[]
    combat: MaddoxDraftCombatEvent[]
    sceneImage: MaddoxDraftSceneImage | null
    /** Sugestões de ação por personagem (DND-30), gravadas junto com a narração. */
    actionOptions: MaddoxDraftActionOptions[]
    /** NPCs marcados para retrato (`save_npc { gerarRetrato }`), pelo id. */
    npcPortraits: string[]
    /** Combate tático (Maddox 7): cópia de trabalho do combate e das fichas mexida pelas ferramentas dos adversários. */
    workspace: unknown
    /** Geração ao vivo deste job (os dados dos adversários vão para ela, DND-25). */
    liveId: string | null
    /** Lembranças reivindicadas por esta geração e a decisão do Maddox sobre cada uma (DND-25). */
    reminders: MaddoxDraftReminder[]
    /** NPCs Opex (DND-27): decisões já consultadas nesta geração (pelo id do NPC) e as falhas do agente. */
    opexNpcConsults: Map<string, unknown>
    opexNpcFailures: MaddoxDraftOpexNpcFailure[]
}

/** Agente de um NPC Opex que não respondeu nesta geração (o Maddox decidiu por ele); o motivo só vai ao dono. */
export interface MaddoxDraftOpexNpcFailure {
    npcId: string
    npcName: string
    error: string
}

/** Lembrança considerada pela geração: `memory` = guardar como memória (aplicado depois de a narração ser gravada). */
export interface MaddoxDraftReminder {
    id: string
    characterName: string
    text: string
    memory: { kind: string; title: string; text: string; visibility: "players" | "master" } | null
    decided: boolean
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
        hub.jobs.set(jobId, { meta, checks: [], combat: [], sceneImage: null, actionOptions: [], npcPortraits: [], workspace: null, liveId: null, reminders: [], opexNpcConsults: new Map(), opexNpcFailures: [] })
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

/** Imagem da cena já pedida neste job (uma por narração). */
export function jobDraftSceneImage(campaignId: string, jobId: string): MaddoxDraftSceneImage | null {
    return hubs.get(campaignId)?.jobs.get(jobId)?.sceneImage ?? null
}

/** Guarda a imagem pedida pelo narrador no job em andamento; `false` se o job não está rodando. */
export function setDraftSceneImage(campaignId: string, jobId: string, image: MaddoxDraftSceneImage): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    job.sceneImage = image
    return true
}

/** Guarda as sugestões de um personagem no job em andamento (substitui as anteriores dele); `false` se o job não está rodando. */
export function setDraftActionOptions(campaignId: string, jobId: string, entry: MaddoxDraftActionOptions): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    job.actionOptions = [...job.actionOptions.filter((item) => item.memberId !== entry.memberId), entry]
    return true
}

/** Retira as sugestões de ação pedidas no job (ao gravar a narração). */
export function takeDraftActionOptions(campaignId: string, jobId: string): MaddoxDraftActionOptions[] {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return []
    const taken = job.actionOptions
    job.actionOptions = []
    return taken
}

/** Marca um NPC para retrato no job em andamento; `false` se o job não está rodando. */
export function addDraftNpcPortrait(campaignId: string, jobId: string, npcId: string): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    if (!job.npcPortraits.includes(npcId)) job.npcPortraits.push(npcId)
    return true
}

/** Retira a imagem e os retratos pedidos no job (depois de gravar a narração). */
export function takeDraftImages(campaignId: string, jobId: string): { sceneImage: MaddoxDraftSceneImage | null; npcPortraits: string[] } {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return { sceneImage: null, npcPortraits: [] }
    const taken = { sceneImage: job.sceneImage, npcPortraits: job.npcPortraits }
    job.sceneImage = null
    job.npcPortraits = []
    return taken
}

/** Cópia de trabalho do combate tático deste job (`null` = ainda não carregada ou o job terminou). */
export function jobWorkspace<T>(campaignId: string, jobId: string): T | null {
    return (hubs.get(campaignId)?.jobs.get(jobId)?.workspace as T | undefined) ?? null
}

export function setJobWorkspace(campaignId: string, jobId: string, workspace: unknown): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    job.workspace = workspace
    return true
}

/** Retira a cópia de trabalho do job (aplicada depois de a narração ser gerada). */
export function takeJobWorkspace<T>(campaignId: string, jobId: string): T | null {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return null
    const workspace = job.workspace as T | null
    job.workspace = null
    return workspace
}

/** Lembranças que esta geração considera (reivindicadas no começo dela). */
export function setJobReminders(campaignId: string, jobId: string, reminders: MaddoxDraftReminder[]): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    job.reminders = reminders
    return true
}

export function jobReminders(campaignId: string, jobId: string): MaddoxDraftReminder[] {
    return hubs.get(campaignId)?.jobs.get(jobId)?.reminders ?? []
}

/** Decisão já consultada do NPC Opex neste job (`undefined` = ainda não). */
export function jobOpexNpcConsult<T>(campaignId: string, jobId: string, npcId: string): T | undefined {
    return hubs.get(campaignId)?.jobs.get(jobId)?.opexNpcConsults.get(npcId) as T | undefined
}

/** Quantos NPCs Opex já foram consultados neste job. */
export function jobOpexNpcConsultCount(campaignId: string, jobId: string): number {
    return hubs.get(campaignId)?.jobs.get(jobId)?.opexNpcConsults.size ?? 0
}

export function setJobOpexNpcConsult(campaignId: string, jobId: string, npcId: string, decision: unknown): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    job.opexNpcConsults.set(npcId, decision)
    return true
}

/** Registra a falha do agente de um NPC Opex no job (uma por NPC); `false` se o job não está rodando. */
export function addDraftOpexNpcFailure(campaignId: string, jobId: string, failure: MaddoxDraftOpexNpcFailure): boolean {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return false
    job.opexNpcFailures = [...job.opexNpcFailures.filter((item) => item.npcId !== failure.npcId), failure]
    return true
}

/** Retira as falhas dos NPCs Opex do job (gravadas na própria narração). */
export function takeDraftOpexNpcFailures(campaignId: string, jobId: string): MaddoxDraftOpexNpcFailure[] {
    const job = hubs.get(campaignId)?.jobs.get(jobId)
    if (!job) return []
    const taken = job.opexNpcFailures
    job.opexNpcFailures = []
    return taken
}

/** Dado de um adversário rolado durante a geração: vai para a geração ao vivo do job (`snapshot` inclui os já rolados). */
export function emitLiveRoll(campaignId: string, jobId: string, roll: MaddoxLiveRollDto): boolean {
    const hub = hubs.get(campaignId)
    const liveId = hub?.jobs.get(jobId)?.liveId
    const live = liveId ? hub?.live.get(liveId) : undefined
    if (!live) return false
    live.rolls = [...(live.rolls ?? []), roll]
    emit(campaignId, { type: "live-roll", liveId: live.liveId, roll })
    return true
}

/** Avisa as mesas que um dado do servidor (salvaguarda de um adversário) saiu num card de ação (todos veem rolar). */
export function emitCombatStepRolled(campaignId: string, messageId: string, stepIndex: number, roll: DiceRollResponse): void {
    emit(campaignId, { type: "combat-step-rolled", messageId, stepIndex, roll })
}

/** Avisa as mesas abertas que uma rolagem do combate tático saiu (todos repetem a animação). */
export function emitCombatRolled(campaignId: string, messageId: string, roll: DiceRollResponse): void {
    emit(campaignId, { type: "combat-rolled", messageId, roll })
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
export function beginLive(campaignId: string, input: Pick<MaddoxLiveGenerationDto, "kind" | "turnNumber" | "replyToId">, jobId: string | null = null): LiveSink {
    const hub = hubOf(campaignId)
    const live: MaddoxLiveGenerationDto = { liveId: randomUUID(), ...input, text: "", tool: false, startedAt: new Date().toISOString(), rolls: [] }
    hub.live.set(live.liveId, live)
    const job = jobId ? hub.jobs.get(jobId) : undefined
    if (job) job.liveId = live.liveId
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
    return [...(hubs.get(campaignId)?.live.values() ?? [])].map((live) => ({ ...live, rolls: [...(live.rolls ?? [])] }))
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
