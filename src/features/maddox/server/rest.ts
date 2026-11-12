import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import {
    MADDOX_ANSWER_FAILED_MESSAGE,
    MADDOX_CAMPAIGN_AUDIT_ENTITY,
    MADDOX_MASTER_GENERATION_TIMEOUT_MS,
    MADDOX_MASTER_TIMEOUT_MESSAGE,
    MADDOX_OPEX_REST_CONSUMPTION_ORIGIN,
    MADDOX_REST_EXCHANGE_REQUESTS_MAX,
    MADDOX_REST_OPEX_EXCHANGE_ROUNDS,
    MADDOX_REST_PREP_ATTEMPTS,
    MADDOX_SHEET_AUDIT_ENTITY,
    MADDOX_SHEET_RIGORS,
    MADDOX_TOOL_TEXT_MAX,
} from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { abilityModifier } from "../combat-rules"
import { isExhaustionDeath } from "../exhaustion-rules"
import { hitPointsLine } from "../hit-points-ops"
import {
    canSpendHitDice,
    emptyRestDecisions,
    hitDicePool,
    hitDieHeal,
    restEntryDone,
    restEntryWaits,
    restLineText,
    restNeedsCatalog,
    restPlan,
    type RestCatalogDecisions,
    type RestChargeRow,
    type RestPlan,
    type RestSheet,
} from "../rest-rules"
import type { MaddoxRestCharacterDto, MaddoxRestDto, MaddoxRestWaitDto, MaddoxGameStateDto } from "../game-types"
import { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCampaignMessage, type IMaddoxCharacter, type IMaddoxRest, type IMaddoxRestCharacter, type IMaddoxRestHitDieRoll } from "../models"
import { assertMemberCanPlay, isMemberReadyToPlay } from "./campaigns"
import { beginLive, emitRestRolled, enqueueMaddoxJob, isAbortedMaddoxJob, isActiveMaddoxJob, jobDraftRest, maddoxJobMeta, maddoxJobSignal, setDraftRest, type MaddoxDraftRest } from "./game-live"
import type { MaddoxToolContext } from "./master-tools"

/**
 * Descanso curto e longo conduzidos pelo Maddox (DND-58) — SOMENTE servidor.
 *
 * - O narrador chama `start_rest` (graus com ficha, só na narração) já com o desfecho; o pedido fica no job e vira a
 *   mensagem `kind: "rest"` logo abaixo da narração (`restMessageDoc`). Interrompido = nada muda.
 * - Concluído: cada personagem ganha a preparação da ficha (um job por personagem na fila da campanha, com o Maddox lendo o
 *   catálogo quando há recurso a decidir), os dados de vida (curto, um por vez, rolados pelo jogador) e as trocas (pedidos
 *   em texto avaliados pelo Maddox com as ferramentas da ficha do "Pergunte ao mestre").
 * - A recuperação grava valores ABSOLUTOS guardados antes na entrada (`prep.plan`): reaplicar não soma duas vezes.
 * - O turno dos jogadores não fecha com parte pendente (`restBlocksTurn`); quem está offline conclui sem rolar e sem trocar.
 */

const log = loggerFor({ module: "maddox", feature: "rest" })

export class RestError extends Error {}

type CampaignDoc = IMaddoxCampaign
type MessageDoc = IMaddoxCampaignMessage
type RestMessage = MessageDoc & { rest: IMaddoxRest }
type StoredRestSheet = RestSheet & { _id: Types.ObjectId; constitution?: number; classRef?: string | null; subclassRef?: string | null; class?: string; subclass?: string; name?: string }

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const clip = (value: string | null | undefined, max: number) => {
    const text = (value ?? "").trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
const sameId = (a: unknown, b: unknown) => String(a) === String(b)
const globalRest = globalThis as unknown as { __maddoxRestActive?: Set<string> }
/** Preparações e partes de Personagem Opex com job vivo neste processo (instância única). */
const active: Set<string> = (globalRest.__maddoxRestActive ??= new Set())

async function sheetModel() {
    return (await import("@/features/character-sheets/models/character-sheet")).CharacterSheet
}

async function loadRestSheet(sheetId: Types.ObjectId): Promise<StoredRestSheet | null> {
    const CharacterSheet = await sheetModel()
    const sheet = await CharacterSheet.findById(sheetId).lean<StoredRestSheet>()
    if (!sheet) return null
    const slots = (sheet.spellSlots as unknown) instanceof Map ? Object.fromEntries(sheet.spellSlots as unknown as Map<string, { total: number; used: number }>) : { ...(sheet.spellSlots ?? {}) }
    return { ...sheet, spellSlots: slots, resourceCharges: (sheet.resourceCharges ?? []) as RestChargeRow[], hpTemp: sheet.hpTemp ?? 0, hitDiceUsed: sheet.hitDiceUsed ?? 0, deathSavesSuccess: sheet.deathSavesSuccess ?? 0, deathSavesFailure: sheet.deathSavesFailure ?? 0, exhaustion: sheet.exhaustion ?? 0 }
}

/** O descanso aberto da campanha (concluído e com partes pendentes), se houver. */
export async function openRest(campaignId: Types.ObjectId): Promise<RestMessage | null> {
    return MaddoxCampaignMessageModel.findOne({ campaignId, kind: "rest", "rest.status": "running" }).sort({ _id: -1 }).lean<RestMessage>()
}

// ── Ferramenta do narrador ────────────────────────────────────────────────────

export interface RestToolInput {
    tipo: "curto" | "longo"
    personagens?: string[]
    desfecho: "concluido" | "interrompido"
    interrupcao?: string
    descricao: string
}

interface RestCandidate {
    character: IMaddoxCharacter
    member: IMaddoxCampaignMember
    dead: boolean
}

async function restCandidates(campaignId: Types.ObjectId): Promise<{ playing: RestCandidate[]; all: IMaddoxCharacter[] }> {
    const [members, all] = await Promise.all([
        MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).lean<IMaddoxCampaignMember[]>(),
        MaddoxCharacterModel.find({ campaignId, status: { $in: ["active", "dead"] } }).lean<IMaddoxCharacter[]>(),
    ])
    const sheetIds = all.map((character) => character.sheetId).filter((id): id is Types.ObjectId => Boolean(id))
    const CharacterSheet = await sheetModel()
    const sheets = sheetIds.length ? await CharacterSheet.find({ _id: { $in: sheetIds } }).select("exhaustion").lean<{ _id: Types.ObjectId; exhaustion?: number }[]>() : []
    const exhausted = new Set(sheets.filter((sheet) => isExhaustionDeath(sheet.exhaustion)).map((sheet) => String(sheet._id)))
    const playing: RestCandidate[] = []
    for (const member of members) {
        const character = all.find((item) => sameId(item._id, member.characterId))
        if (!character?.sheetId || !isMemberReadyToPlay(character)) continue
        playing.push({ character, member, dead: character.status === "dead" || exhausted.has(String(character.sheetId)) })
    }
    return { playing, all }
}

/** `start_rest`: confere e guarda o descanso no job (vira mensagem só depois de a narração ser gravada). */
export async function draftRest(context: MaddoxToolContext, input: RestToolInput): Promise<Record<string, unknown>> {
    const campaign = await MaddoxCampaignModel.findById(context.campaignId).select("rigor").lean<Pick<CampaignDoc, "rigor">>()
    if (!campaign || !MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new RestError("Esta campanha é narrativa: não há descanso com ficha. Narre o descanso pela história.")
    const meta = context.jobId ? maddoxJobMeta(String(context.campaignId), context.jobId) : null
    if (!meta || meta.kind !== "narration") throw new RestError("O descanso só é iniciado na narração do turno do mestre.")
    const campaignKey = String(context.campaignId)
    if (jobDraftRest(campaignKey, context.jobId!)) throw new RestError("Já existe um descanso nesta narração: um por narração.")
    const { findActiveTactical } = await import("./tactical-combat")
    if (await findActiveTactical(context.campaignId)) throw new RestError("Há um combate tático em andamento: não dá para descansar agora.")
    if (await openRest(context.campaignId)) throw new RestError("Já existe um descanso aberto nesta campanha: os personagens ainda estão concluindo a parte deles.")
    const interrupted = input.desfecho === "interrompido"
    const interruption = clip(input.interrupcao, MADDOX_TOOL_TEXT_MAX)
    if (interrupted && !interruption) throw new RestError("Informe em `interrupcao` o que interrompeu o descanso (os jogadores leem).")

    const { playing, all } = await restCandidates(context.campaignId)
    let chosen: RestCandidate[]
    if (input.personagens?.length) {
        chosen = []
        for (const name of input.personagens) {
            const key = normalizeCatalogName(name)
            const known = all.find((character) => normalizeCatalogName(character.name) === key)
            if (!known) throw new RestError(`Nenhum personagem jogador chamado "${name}". Personagens: ${all.map((character) => character.name).join(", ") || "nenhum"}.`)
            const candidate = playing.find((item) => sameId(item.character._id, known._id))
            if (!candidate) throw new RestError(`${known.name} não está jogando agora (ou não tem ficha): fica fora do descanso.`)
            if (candidate.dead) throw new RestError(`${known.name} está morto: fica fora do descanso.`)
            if (!chosen.some((item) => sameId(item.character._id, known._id))) chosen.push(candidate)
        }
    } else chosen = playing.filter((item) => !item.dead)
    if (!chosen.length) throw new RestError("Nenhum personagem pode descansar agora.")

    const draft: MaddoxDraftRest = {
        type: input.tipo === "longo" ? "long" : "short",
        outcome: interrupted ? "interrupted" : "concluded",
        description: clip(input.descricao, MADDOX_TOOL_TEXT_MAX),
        interruption: interrupted ? interruption : null,
        characters: chosen.map(({ character, member }) => ({ characterId: String(character._id), memberId: String(member._id), userId: member.userId, sheetId: String(character.sheetId), name: character.name, opex: member.kind === "opex" })),
    }
    if (!setDraftRest(campaignKey, context.jobId!, draft)) throw new RestError("Esta narração já terminou.")
    return {
        saved: true,
        tipo: input.tipo,
        desfecho: input.desfecho,
        personagens: draft.characters.map((item) => item.name),
        nota: interrupted
            ? "Narre a interrupção do descanso: nada é recuperado."
            : "Narre o descanso. Depois da narração, o servidor prepara as fichas e abre os dados de vida (curto) e as trocas de cada personagem.",
    }
}

/** Documento da mensagem do descanso (gravado logo abaixo da narração). Um combate iniciado na mesma narração o interrompe. */
export async function restMessageDoc(campaignId: Types.ObjectId, turnNumber: number, round: number, draft: MaddoxDraftRest, combatStarted: boolean) {
    const interrupted = draft.outcome === "interrupted" || combatStarted
    const characters: IMaddoxRestCharacter[] = []
    for (const item of draft.characters) {
        const sheet = interrupted ? null : await loadRestSheet(new Types.ObjectId(item.sheetId))
        const pool = sheet ? hitDicePool(sheet) : null
        characters.push({
            characterId: new Types.ObjectId(item.characterId),
            memberId: new Types.ObjectId(item.memberId),
            userId: item.userId,
            sheetId: new Types.ObjectId(item.sheetId),
            name: item.name,
            opex: item.opex,
            prep: { status: interrupted ? "ready" : "pending", attempts: 0, error: null, token: null, plan: null, recovered: [], notRecovered: [], skippedCatalog: false, appliedAt: null },
            hitDice: { status: !interrupted && draft.type === "short" && sheet && canSpendHitDice(sheet) ? "open" : "none", die: pool?.die ?? null, rolls: [] },
            exchange: { status: interrupted ? "skipped" : "open", requests: 0, applied: [] },
            answeredBy: "player",
            opexError: null,
            doneReason: null,
        })
    }
    const rest: IMaddoxRest = {
        type: draft.type,
        status: interrupted ? "interrupted" : "running",
        description: draft.description,
        interruption: interrupted ? (draft.interruption ?? "Um combate começou.") : null,
        jobId: null,
        closedAt: interrupted ? new Date() : null,
        characters,
    }
    return { campaignId, turnNumber, phase: "master" as const, kind: "rest" as const, content: draft.description, segment: round, rest }
}

/** Depois de gravar a mensagem do descanso: auditoria e, se concluído, as preparações na fila. */
export async function afterRestCreated(campaign: Pick<CampaignDoc, "_id" | "ownerId">, message: { _id: Types.ObjectId; turnNumber: number; rest?: IMaddoxRest | null }): Promise<void> {
    if (!message.rest) return
    await recordAudit({
        userId: campaign.ownerId,
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(campaign._id),
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { by: "maddox", rest: { id: String(message._id), type: message.rest.type, status: message.rest.status, turn: message.turnNumber, characters: message.rest.characters.map((entry) => entry.name), interruption: message.rest.interruption } },
    })
    log.info({ campaignId: String(campaign._id), restId: String(message._id), type: message.rest.type, status: message.rest.status }, "[maddox] descanso registrado")
    if (message.rest.status === "running") void scheduleRestPreps(campaign._id)
}

// ── Preparação da ficha ───────────────────────────────────────────────────────

const prepKey = (messageId: unknown, characterId: unknown) => `prep:${String(messageId)}:${String(characterId)}`

/** Põe na fila as preparações pendentes (ou presas por um reinício do processo). Idempotente. */
export async function scheduleRestPreps(campaignId: Types.ObjectId): Promise<number> {
    const message = await openRest(campaignId)
    if (!message) return 0
    let scheduled = 0
    for (const entry of message.rest.characters) {
        const key = prepKey(message._id, entry.characterId)
        if (active.has(key)) continue
        if (!["pending", "running", "applying"].includes(entry.prep.status)) continue
        active.add(key)
        scheduled += 1
        void enqueueMaddoxJob(String(campaignId), `preparação da ficha no descanso (${entry.name})`, async ({ jobId }) => {
            try {
                await runRestPrep(campaignId, message._id, entry.characterId, jobId)
            } finally {
                active.delete(key)
            }
        })
    }
    return scheduled
}

/**
 * As partes de cada personagem são atualizadas pelo driver (sem o cast do Mongoose): o subdocumento `rest` é `Mixed` e o
 * cast dos `arrayFilters` perdia a condição do personagem, mexendo na entrada de outro.
 */
const messages = () => MaddoxCampaignMessageModel.collection

const arrayFilter = (characterId: Types.ObjectId, extra: Record<string, unknown> = {}) => ({ arrayFilters: [{ "c.characterId": characterId, ...Object.fromEntries(Object.entries(extra).map(([field, value]) => [`c.${field}`, value])) }] })

async function entryOf(messageId: Types.ObjectId, characterId: Types.ObjectId): Promise<{ message: RestMessage; entry: IMaddoxRestCharacter } | null> {
    const message = await MaddoxCampaignMessageModel.findById(messageId).lean<RestMessage>()
    const entry = message?.rest?.characters.find((item) => sameId(item.characterId, characterId))
    return message && entry ? { message, entry } : null
}

/** Texto da ficha para o Maddox: classe/subclasse com as refs, espaços e recursos gastos com a origem. */
function restSheetText(sheet: StoredRestSheet): string {
    const plain = (value: string | undefined) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    const lines = [
        `Classe: ${plain(sheet.class) || "?"}${sheet.classRef ? ` (ref Classe:${sheet.classRef})` : ""} · nível ${sheet.level}`,
        sheet.subclass || sheet.subclassRef ? `Subclasse: ${plain(sheet.subclass) || "?"}${sheet.subclassRef ? ` (ref Subclasse:${sheet.subclassRef})` : ""}` : null,
    ].filter(Boolean) as string[]
    const slots = Object.entries(sheet.spellSlots ?? {}).filter(([, slot]) => (slot?.used ?? 0) > 0)
    lines.push(`Espaços de magia gastos: ${slots.length ? slots.map(([circle, slot]) => `${circle}º círculo ${slot.used}/${slot.total}`).join(", ") : "nenhum"}`)
    const charges = (sheet.resourceCharges ?? []).filter((charge) => charge.used > 0 && charge.source)
    lines.push("Recursos gastos (decida cada um):", ...(charges.length ? charges.map((charge) => `- chargeId="${charge.id}" — ${plain(charge.name)}: ${charge.used}/${charge.total} usados · origem ref ${charge.source!.entityType}:${charge.source!.entityId}`) : ["- nenhum"]))
    return lines.join("\n")
}

const classRefsOf = (sheet: StoredRestSheet) => [sheet.classRef ? `Classe:${sheet.classRef}` : null, sheet.subclassRef ? `Subclasse:${sheet.subclassRef}` : null].filter((ref): ref is string => Boolean(ref))

async function runRestPrep(campaignId: Types.ObjectId, messageId: Types.ObjectId, characterId: Types.ObjectId, jobId: string): Promise<void> {
    const found = await entryOf(messageId, characterId)
    if (!found || found.message.rest.status !== "running") return
    const { message, entry } = found
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.status !== "active") return
    // Queda no meio da gravação: o plano absoluto já guardado é reaplicado (não soma de novo).
    if (entry.prep.status === "applying" && entry.prep.plan) {
        await commitPrep(campaign, message, entry, entry.prep.plan, { from: "applying", skippedCatalog: entry.prep.skippedCatalog })
        return
    }
    // Preparação presa por um reinício do processo: volta à fila.
    if (entry.prep.status === "running") await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].prep.status": "pending" } }, arrayFilter(characterId, { "prep.status": "running" }))
    const token = randomUUID()
    const claimed = await messages().updateOne({ _id: messageId, "rest.status": "running" }, { $set: { "rest.characters.$[c].prep.status": "running", "rest.characters.$[c].prep.token": token }, $inc: { "rest.characters.$[c].prep.attempts": 1 } }, arrayFilter(characterId, { "prep.status": "pending" }))
    if (claimed.modifiedCount === 0) return
    const sheet = await loadRestSheet(entry.sheetId)
    if (!sheet) {
        await failPrep(campaign, messageId, entry, token, "A ficha do personagem não foi encontrada.", true)
        return
    }
    let decisions: RestCatalogDecisions = emptyRestDecisions()
    if (restNeedsCatalog(sheet, message.rest.type)) {
        try {
            const [{ createCatalogReadLog }, { reviewRestRecovery }, { interpretRestPrep }] = await Promise.all([import("./catalog-reads"), import("./rest-prep-ai"), import("./rest-interpret")])
            const reads = createCatalogReadLog()
            const raw = await reviewRestRecovery({ campaign, characterName: entry.name, restType: message.rest.type, sheetText: restSheetText(sheet), reads, jobId })
            decisions = interpretRestPrep(raw, { type: message.rest.type, charges: sheet.resourceCharges, classRefs: classRefsOf(sheet) }, reads)
        } catch (error) {
            if (isAbortedMaddoxJob(jobId) || !isActiveMaddoxJob(String(campaignId), jobId)) return
            const attempts = entry.prep.attempts + 1
            await failPrep(campaign, messageId, entry, token, errorText(error), attempts >= MADDOX_REST_PREP_ATTEMPTS)
            return
        }
    }
    if (isAbortedMaddoxJob(jobId)) return
    await commitPrep(campaign, message, entry, restPlan(sheet, message.rest.type, decisions), { from: "running", token, skippedCatalog: false })
}

async function failPrep(campaign: CampaignDoc, messageId: Types.ObjectId, entry: IMaddoxRestCharacter, token: string, reason: string, final: boolean): Promise<void> {
    log.warn({ campaignId: String(campaign._id), restId: String(messageId), character: entry.name, err: reason, final }, "[maddox] preparação da ficha no descanso falhou")
    await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].prep.status": final ? "failed" : "pending", "rest.characters.$[c].prep.error": clip(reason, 500), "rest.characters.$[c].prep.token": null } }, arrayFilter(entry.characterId, { "prep.token": token }))
    if (final) {
        const { publishGameChanged } = await import("./game")
        await publishGameChanged(campaign._id)
    } else void scheduleRestPreps(campaign._id)
}

/** Grava o plano absoluto na entrada, escreve a ficha e marca a preparação como pronta. */
async function commitPrep(campaign: CampaignDoc, message: RestMessage, entry: IMaddoxRestCharacter, plan: RestPlan, options: { from: "running" | "applying" | "failed"; token?: string; skippedCatalog: boolean }): Promise<boolean> {
    const filter: Record<string, unknown> = { "prep.status": options.from }
    if (options.token) filter["prep.token"] = options.token
    if (options.from !== "applying") {
        const staged = await messages().updateOne({ _id: message._id, "rest.status": "running" }, { $set: { "rest.characters.$[c].prep.status": "applying", "rest.characters.$[c].prep.plan": plan, "rest.characters.$[c].prep.skippedCatalog": options.skippedCatalog } }, arrayFilter(entry.characterId, filter))
        if (staged.modifiedCount === 0) return false
    }
    if (Object.keys(plan.set).length) {
        const CharacterSheet = await sheetModel()
        await CharacterSheet.updateOne({ _id: entry.sheetId }, { $set: plan.set })
        const { publishPatched } = await import("./combat-sheet")
        await publishPatched(String(entry.sheetId))
        await recordAudit({
            userId: campaign.ownerId,
            entidade: MADDOX_SHEET_AUDIT_ENTITY,
            entidadeId: String(entry.sheetId),
            acao: AcaoAuditoria.ATUALIZAR,
            depois: { by: "maddox", origin: "rest-recovery", campaign: String(campaign._id), rest: String(message._id), type: message.rest.type, character: entry.name, set: plan.set, skippedCatalog: options.skippedCatalog },
        })
    }
    await messages().updateOne(
        { _id: message._id },
        { $set: { "rest.characters.$[c].prep.status": "ready", "rest.characters.$[c].prep.recovered": plan.recovered, "rest.characters.$[c].prep.notRecovered": plan.notRecovered, "rest.characters.$[c].prep.appliedAt": new Date(), "rest.characters.$[c].prep.token": null, "rest.characters.$[c].prep.error": null } },
        arrayFilter(entry.characterId, { "prep.status": "applying" }),
    )
    log.info({ campaignId: String(campaign._id), restId: String(message._id), character: entry.name, recovered: plan.recovered.length, notRecovered: plan.notRecovered.length }, "[maddox] ficha preparada no descanso")
    await afterRestProgress(campaign._id)
    return true
}

// ── Ações das pessoas ─────────────────────────────────────────────────────────

interface RestTarget {
    campaign: CampaignDoc
    message: RestMessage
    entry: IMaddoxRestCharacter
    isOwner: boolean
}

async function loadRestTarget(campaignId: string, messageId: string, characterId: string, userId: string, options: { ownerAction?: boolean } = {}): Promise<RestTarget> {
    const { loadAsMember, assertActive } = await import("./game")
    const { campaign, member } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    if (!Types.ObjectId.isValid(messageId) || !Types.ObjectId.isValid(characterId)) throw new DomainError(404, "Descanso não encontrado.", "REST_NOT_FOUND")
    const message = await MaddoxCampaignMessageModel.findOne({ _id: new Types.ObjectId(messageId), campaignId: campaign._id, kind: "rest" }).lean<RestMessage>()
    const entry = message?.rest?.characters.find((item) => sameId(item.characterId, characterId))
    if (!message?.rest || !entry) throw new DomainError(404, "Descanso não encontrado.", "REST_NOT_FOUND")
    if (message.rest.status !== "running") throw new DomainError(409, "Este descanso já foi encerrado.", "REST_CLOSED")
    const isOwner = campaign.ownerId === userId
    if (options.ownerAction) {
        if (!isOwner) throw new DomainError(403, "Só o dono da campanha pode fazer isso.", "FORBIDDEN")
    } else {
        const allowed = entry.opex ? isOwner && entry.answeredBy === "owner" : sameId(entry.memberId, member._id)
        if (!allowed) throw new DomainError(403, "Só o jogador deste personagem responde por ele no descanso.", "NOT_REST_TARGET")
        if (!entry.opex) await assertMemberCanPlay(campaignId, userId)
        if (entry.doneReason) throw new DomainError(409, "A parte deste personagem no descanso já foi encerrada.", "REST_PART_CLOSED")
    }
    return { campaign, message, entry, isOwner }
}

async function stateFor(campaignId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { getGameState } = await import("./game")
    return getGameState(campaignId, userId)
}

/** Rola UM dado de vida (dado + Constituição) e cura. A rolagem é gravada antes da ficha (valores absolutos). */
async function spendHitDie(campaign: CampaignDoc, message: RestMessage, entry: IMaddoxRestCharacter, rolledBy: string): Promise<DiceRollResponse> {
    if (entry.hitDice.status !== "open") throw new DomainError(409, "Os dados de vida deste personagem já foram encerrados neste descanso.", "REST_PART_CLOSED")
    const sheet = await loadRestSheet(entry.sheetId)
    if (!sheet?.hpMax) throw new DomainError(409, "A ficha deste personagem não tem PV máximo.", "REST_SHEET_MISSING")
    const pool = hitDicePool(sheet)
    if (!canSpendHitDice(sheet) || !pool.die) {
        await setHitDiceStatus(message._id, entry.characterId, "open", "done")
        throw new DomainError(409, (sheet.hpCurrent ?? sheet.hpMax) >= sheet.hpMax ? "Os PV já estão no máximo." : "Não há dados de vida disponíveis.", "REST_HIT_DICE_EMPTY")
    }
    const con = abilityModifier(sheet.constitution ?? 10)
    const [{ rollGeneralDice }, { resolveGeneralDiceTarget }] = await Promise.all([import("@/features/dice-roller/server/dice-roll-service"), import("@/features/dice-roller/server/dice-target")])
    const roll = await rollGeneralDice(
        { terms: [{ dice: pool.die as "d8", quantity: 1 }], modifier: con, modifierParts: con ? [{ label: "Constituição", value: con, color: "constitution" }] : [], mode: "normal", label: `${entry.name} · dado de vida`, source: "sheet" },
        resolveGeneralDiceTarget({ userId: entry.userId })!,
    )
    const hpBefore = Math.max(0, sheet.hpCurrent ?? sheet.hpMax)
    const hpAfter = Math.min(sheet.hpMax, hpBefore + hitDieHeal(roll.total))
    const doc: IMaddoxRestHitDieRoll = { roll, total: roll.total, healed: hpAfter - hpBefore, hpBefore, hpAfter, usedAfter: pool.used + 1, rolledBy, at: new Date() }
    const pushed = await messages().updateOne(
        { _id: message._id, "rest.status": "running" },
        { $push: { "rest.characters.$[c].hitDice.rolls": doc } } as never,
        arrayFilter(entry.characterId, { "hitDice.status": "open", "hitDice.rolls": { $size: entry.hitDice.rolls.length } }),
    )
    if (pushed.modifiedCount === 0) throw new DomainError(409, "Este dado de vida já foi rolado.", "REST_ROLL_CONFLICT")
    const CharacterSheet = await sheetModel()
    await CharacterSheet.updateOne({ _id: entry.sheetId }, { $set: { hpCurrent: hpAfter, hitDiceUsed: doc.usedAfter, ...(hpBefore === 0 && hpAfter > 0 ? { deathSavesSuccess: 0, deathSavesFailure: 0 } : {}) } })
    const { publishPatched } = await import("./combat-sheet")
    await publishPatched(String(entry.sheetId))
    await recordAudit({
        userId: rolledBy.startsWith("opex:") ? campaign.ownerId : rolledBy,
        entidade: MADDOX_SHEET_AUDIT_ENTITY,
        entidadeId: String(entry.sheetId),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { hpCurrent: hpBefore, hitDiceUsed: pool.used },
        depois: { by: "maddox", origin: "rest-hit-die", campaign: String(campaign._id), rest: String(message._id), character: entry.name, rolled: `${pool.die}${con ? `${con > 0 ? "+" : ""}${con}` : ""} = ${roll.total}`, hpCurrent: hpAfter, hitDiceUsed: doc.usedAfter },
    })
    await MaddoxCampaignMessageModel.create({ campaignId: campaign._id, turnNumber: campaign.turn.number, phase: "players", kind: "hit-points", characterId: entry.characterId, characterName: entry.name, content: hitPointsLine(entry.name, hpBefore, hpAfter, `dado de vida: ${pool.die}${con ? `${con > 0 ? "+" : ""}${con}` : ""} = ${roll.total}`) })
    if (hpAfter >= sheet.hpMax || pool.available - 1 <= 0) await setHitDiceStatus(message._id, entry.characterId, "open", "done")
    emitRestRolled(String(campaign._id), String(message._id), String(entry.characterId), roll)
    return roll
}

async function setHitDiceStatus(messageId: Types.ObjectId, characterId: Types.ObjectId, from: string, to: string): Promise<boolean> {
    const result = await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].hitDice.status": to } }, arrayFilter(characterId, { "hitDice.status": from }))
    return result.modifiedCount > 0
}

/** `POST …/rests/[restId]/characters/[characterId]/hit-dice/roll`. */
export async function rollRestHitDie(campaignId: string, messageId: string, characterId: string, userId: string): Promise<{ roll: DiceRollResponse; state: MaddoxGameStateDto }> {
    const { campaign, message, entry } = await loadRestTarget(campaignId, messageId, characterId, userId)
    const roll = await spendHitDie(campaign, message, entry, userId)
    await afterRestProgress(campaign._id)
    return { roll, state: await stateFor(campaignId, userId) }
}

/** `POST …/hit-dice/decline`: o personagem para de rolar (ou não quer rolar). */
export async function declineRestHitDice(campaignId: string, messageId: string, characterId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, message, entry } = await loadRestTarget(campaignId, messageId, characterId, userId)
    if (!(await setHitDiceStatus(message._id, entry.characterId, "open", entry.hitDice.rolls.length ? "done" : "declined"))) throw new DomainError(409, "Os dados de vida deste personagem já foram encerrados neste descanso.", "REST_PART_CLOSED")
    await afterRestProgress(campaign._id)
    return stateFor(campaignId, userId)
}

/** Reserva a vez do pedido de troca (um por vez, até o teto). */
async function claimExchange(message: RestMessage, entry: IMaddoxRestCharacter): Promise<void> {
    // As trocas só abrem com a ficha preparada: a preparação grava `resourceCharges`/`spellSlots` inteiros e apagaria o
    // que uma troca feita no meio dela tivesse criado (uma carga de talento novo, por exemplo).
    const claimed = await messages().updateOne(
        { _id: message._id, "rest.status": "running" },
        { $set: { "rest.characters.$[c].exchange.status": "processing" }, $inc: { "rest.characters.$[c].exchange.requests": 1 } },
        arrayFilter(entry.characterId, { "prep.status": "ready", "exchange.status": "open", "exchange.requests": { $lt: MADDOX_REST_EXCHANGE_REQUESTS_MAX } }),
    )
    if (claimed.modifiedCount > 0) return
    if (entry.prep.status !== "ready" && entry.exchange.status === "open") throw new DomainError(409, "O Maddox ainda está preparando a ficha deste personagem: as trocas abrem em seguida.", "REST_PREP_PENDING")
    if (entry.exchange.status === "processing") throw new DomainError(409, "O Maddox ainda está avaliando o pedido anterior.", "REST_EXCHANGE_BUSY")
    if (entry.exchange.status === "open") throw new DomainError(409, `Limite de ${MADDOX_REST_EXCHANGE_REQUESTS_MAX} pedidos de troca neste descanso: conclua as trocas.`, "REST_EXCHANGE_LIMIT")
    throw new DomainError(409, "As trocas deste personagem já foram concluídas neste descanso.", "REST_PART_CLOSED")
}

async function createRequest(campaign: CampaignDoc, message: RestMessage, entry: IMaddoxRestCharacter, text: string): Promise<Types.ObjectId> {
    const request = await MaddoxCampaignMessageModel.create({ campaignId: campaign._id, turnNumber: campaign.turn.number, phase: "players", kind: "rest-request", memberId: entry.memberId, userId: entry.userId, characterId: entry.characterId, characterName: entry.name, content: text, restId: message._id })
    return request._id
}

/** `POST …/exchange`: o pedido entra na conversa e o Maddox o avalia em segundo plano (fila da campanha). */
export async function submitRestExchange(campaignId: string, messageId: string, characterId: string, text: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, message, entry } = await loadRestTarget(campaignId, messageId, characterId, userId)
    await claimExchange(message, entry)
    const requestId = await createRequest(campaign, message, entry, text)
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaign._id)
    void enqueueMaddoxJob(String(campaign._id), `trocas do descanso (${entry.name})`, async ({ jobId }) => {
        await runRestExchange(campaign._id, jobId, message._id, entry.characterId, requestId, userId)
    }, { kind: "rest-exchange", turnNumber: campaign.turn.number, round: 0 })
    return stateFor(campaignId, userId)
}

/**
 * Gera e grava a resposta do Maddox a um pedido de troca (roda DENTRO de um job da fila: o do pedido ou o do Personagem
 * Opex). Devolve o texto (vazio na falha) e devolve a parte para "aberta" (ou "pulada", se o jogador saiu no meio).
 */
export async function runRestExchange(campaignId: Types.ObjectId, jobId: string, messageId: Types.ObjectId, characterId: Types.ObjectId, requestId: Types.ObjectId, requesterUserId: string): Promise<{ content: string; error: string | null }> {
    const found = await entryOf(messageId, characterId)
    const request = await MaddoxCampaignMessageModel.findById(requestId).select("content turnNumber").lean<{ content: string; turnNumber: number }>()
    let content = ""
    let error: string | null = null
    if (found && request) {
        const { message, entry } = found
        const previous = await MaddoxCampaignMessageModel.find({ campaignId, restId: messageId, characterId, kind: "rest-request", _id: { $lt: requestId } }).sort({ _id: 1 }).select("_id content characterName").lean<{ _id: Types.ObjectId; content: string; characterName: string | null }[]>()
        const answers = previous.length ? await MaddoxCampaignMessageModel.find({ campaignId, kind: "answer", replyToId: { $in: previous.map((item) => item._id) }, error: null }).select("_id content replyToId").lean<{ _id: Types.ObjectId; content: string; replyToId: Types.ObjectId }[]>() : []
        const thread = previous.flatMap((item) => [
            { role: "player" as const, characterName: item.characterName, content: item.content, id: String(item._id) },
            ...answers.filter((answer) => sameId(answer.replyToId, item._id)).map((answer) => ({ role: "maddox" as const, characterName: null, content: answer.content, id: String(answer._id) })),
        ])
        const live = beginLive(String(campaignId), { kind: "answer", turnNumber: request.turnNumber, replyToId: String(requestId) })
        try {
            const { getMaddoxMaster } = await import("./game-master")
            const master = await getMaddoxMaster()
            const controller = new AbortController()
            const outer = maddoxJobSignal(String(campaignId), jobId)
            const abort = () => controller.abort()
            outer?.addEventListener("abort", abort, { once: true })
            const timer = setTimeout(() => controller.abort(), MADDOX_MASTER_GENERATION_TIMEOUT_MS)
            // As ferramentas da ficha do "Pergunte ao mestre", presas ao personagem do descanso (o dono que responde pelo
            // Personagem Opex não ganha acesso a outra ficha) e à lista das trocas.
            const [runs, { MADDOX_REST_EXCHANGE_CHANGE_TYPES }] = await Promise.all([import("./question-runs"), import("../rest-schemas")])
            runs.openQuestionRun({
                campaignId: String(campaignId),
                jobId,
                turnNumber: request.turnNumber,
                questionId: String(requestId),
                askerUserId: requesterUserId,
                askerCharacterId: String(characterId),
                askerIsOwner: false,
                playerTexts: [...thread.filter((item) => item.role === "player").map((item) => item.content), request.content],
                allowedChangeTypes: MADDOX_REST_EXCHANGE_CHANGE_TYPES,
                sheetChangeTitle: `Trocas de ${entry.name} depois do ${message.rest.type === "long" ? "descanso longo" : "descanso curto"}:`,
                onSheetChanged: async (lines) => {
                    await messages().updateOne({ _id: messageId }, { $push: { "rest.characters.$[c].exchange.applied": { $each: lines } } } as never, arrayFilter(characterId))
                },
            })
            try {
                content = await master.restExchange(
                    {
                        campaignId: String(campaignId),
                        jobId,
                        turnNumber: request.turnNumber,
                        requestId: String(requestId),
                        characterId: String(characterId),
                        characterName: entry.name,
                        restType: message.rest.type,
                        request: request.content,
                        requesterUserId,
                        thread,
                        signal: controller.signal,
                    },
                    live,
                )
                if (controller.signal.aborted && !outer?.aborted) throw new Error(MADDOX_MASTER_TIMEOUT_MESSAGE)
            } finally {
                clearTimeout(timer)
                outer?.removeEventListener("abort", abort)
                runs.closeQuestionRun(jobId)
            }
            if (!isActiveMaddoxJob(String(campaignId), jobId)) {
                live.end({ messageId: null, error: null })
                return { content: "", error: MADDOX_ANSWER_FAILED_MESSAGE }
            }
        } catch (failure) {
            if (!isActiveMaddoxJob(String(campaignId), jobId)) {
                live.end({ messageId: null, error: null })
                return { content: "", error: MADDOX_ANSWER_FAILED_MESSAGE }
            }
            log.warn({ err: errorText(failure), campaignId: String(campaignId), character: entry.name }, "[maddox] falha ao avaliar as trocas do descanso")
            error = MADDOX_ANSWER_FAILED_MESSAGE
        }
        try {
            const answer = await MaddoxCampaignMessageModel.create({ campaignId, turnNumber: request.turnNumber, phase: "players", kind: "answer", content: error ? "" : content, error, replyToId: requestId })
            live.end({ messageId: String(answer._id), error })
        } catch (failure) {
            live.end({ messageId: null, error: MADDOX_ANSWER_FAILED_MESSAGE })
            log.warn({ err: errorText(failure), campaignId: String(campaignId) }, "[maddox] falha ao gravar a resposta das trocas")
        }
    }
    // A parte volta a aceitar pedidos; se o jogador saiu (ou ficou offline) no meio, ela fica pulada.
    const reopened = await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].exchange.status": "open" } }, arrayFilter(characterId, { "exchange.status": "processing", doneReason: null }))
    if (reopened.modifiedCount === 0) await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].exchange.status": "skipped" } }, arrayFilter(characterId, { "exchange.status": "processing" }))
    await afterRestProgress(campaignId)
    return { content: error ? "" : content, error }
}

/** `POST …/exchange/finish`: "Concluir trocas" ou "Nada a trocar". */
export async function finishRestExchange(campaignId: string, messageId: string, characterId: string, nothing: boolean, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, message, entry } = await loadRestTarget(campaignId, messageId, characterId, userId)
    if (!(await setExchangeStatus(message._id, entry.characterId, "open", nothing && !entry.exchange.applied.length ? "nothing" : "done"))) {
        if (entry.exchange.status === "processing") throw new DomainError(409, "O Maddox ainda está avaliando o pedido anterior.", "REST_EXCHANGE_BUSY")
        throw new DomainError(409, "As trocas deste personagem já foram concluídas neste descanso.", "REST_PART_CLOSED")
    }
    await afterRestProgress(campaign._id)
    return stateFor(campaignId, userId)
}

async function setExchangeStatus(messageId: Types.ObjectId, characterId: Types.ObjectId, from: string, to: string): Promise<boolean> {
    const result = await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].exchange.status": to } }, arrayFilter(characterId, { "exchange.status": from }))
    return result.modifiedCount > 0
}

/** "Tentar de novo" do dono na preparação que falhou. */
export async function retryRestPrep(campaignId: string, messageId: string, characterId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, message, entry } = await loadRestTarget(campaignId, messageId, characterId, userId, { ownerAction: true })
    const reset = await messages().updateOne({ _id: message._id }, { $set: { "rest.characters.$[c].prep.status": "pending", "rest.characters.$[c].prep.attempts": 0, "rest.characters.$[c].prep.error": null } }, arrayFilter(entry.characterId, { "prep.status": "failed" }))
    if (reset.modifiedCount === 0) throw new DomainError(409, "A preparação desta ficha não está com falha.", "REST_PREP_NOT_FAILED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { rest: String(message._id), character: entry.name, prep: "retry" } })
    await scheduleRestPreps(campaign._id)
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaign._id)
    return stateFor(campaignId, userId)
}

/** "Seguir sem" do dono: aplica a regra sem o catálogo (cargas e espaços do curto não voltam, com o motivo). */
export async function skipRestPrep(campaignId: string, messageId: string, characterId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, message, entry } = await loadRestTarget(campaignId, messageId, characterId, userId, { ownerAction: true })
    if (entry.prep.status !== "failed") throw new DomainError(409, "A preparação desta ficha não está com falha.", "REST_PREP_NOT_FAILED")
    const sheet = await loadRestSheet(entry.sheetId)
    if (!sheet) throw new DomainError(409, "A ficha do personagem não foi encontrada.", "REST_SHEET_MISSING")
    const plan = restPlan(sheet, message.rest.type, { ...emptyRestDecisions(), unavailable: true })
    const done = await commitPrep(campaign, message, entry, plan, { from: "failed", skippedCatalog: true })
    if (!done) throw new DomainError(409, "A preparação desta ficha não está com falha.", "REST_PREP_NOT_FAILED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { rest: String(message._id), character: entry.name, prep: "skip" } })
    return stateFor(campaignId, userId)
}

// ── Espera e encerramento ─────────────────────────────────────────────────────

/** Conclui as partes de um personagem que não vai mais responder (offline, saiu, morreu). */
async function skipEntry(messageId: Types.ObjectId, characterId: Types.ObjectId, reason: "offline" | "left" | "dead"): Promise<void> {
    await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].doneReason": reason } }, arrayFilter(characterId, { doneReason: null }))
    await setHitDiceStatus(messageId, characterId, "open", "skipped")
    await setExchangeStatus(messageId, characterId, "open", "skipped")
}

/** Fecha o descanso quando todos concluíram (troca condicional: uma só chamada vence). */
export async function settleRest(campaignId: Types.ObjectId): Promise<boolean> {
    const message = await openRest(campaignId)
    if (!message || !message.rest.characters.every(restEntryDone)) return false
    const closed = await MaddoxCampaignMessageModel.updateOne({ _id: message._id, "rest.status": "running" }, { $set: { "rest.status": "closed", "rest.closedAt": new Date() } })
    if (closed.modifiedCount === 0) return false
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("ownerId").lean<{ ownerId: string }>()
    await recordAudit({
        userId: campaign?.ownerId ?? "maddox",
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(campaignId),
        acao: AcaoAuditoria.ATUALIZAR,
        depois: {
            by: "maddox",
            rest: {
                id: String(message._id),
                type: message.rest.type,
                status: "closed",
                applied: message.rest.characters.map((entry) => ({ character: entry.name, recovered: entry.prep.recovered.map(restLineText), hitDice: entry.hitDice.rolls.length, exchanges: entry.exchange.applied, doneReason: entry.doneReason })),
            },
        },
    })
    log.info({ campaignId: String(campaignId), restId: String(message._id) }, "[maddox] descanso encerrado")
    return true
}

/**
 * O turno dos jogadores espera o descanso aberto. Quem está offline (presença conhecida) conclui sem rolar e sem trocar; os
 * Personagens Opex contam sempre como presentes.
 */
export async function restBlocksTurn(campaignId: Types.ObjectId, online: ReadonlySet<string> | null): Promise<boolean> {
    const message = await openRest(campaignId)
    if (!message) return false
    if (online) {
        for (const entry of message.rest.characters) {
            if (entry.opex || entry.doneReason || online.has(entry.userId) || restEntryDone(entry)) continue
            await skipEntry(message._id, entry.characterId, "offline")
        }
    }
    if (await settleRest(campaignId)) {
        const { publishGameChanged } = await import("./game")
        await publishGameChanged(campaignId)
        return false
    }
    return Boolean(await openRest(campaignId))
}

/** Depois de uma parte concluída: fecha o descanso se for o caso, avisa a mesa e reavalia o turno. */
export async function afterRestProgress(campaignId: Types.ObjectId): Promise<void> {
    await settleRest(campaignId)
    const { publishGameChanged, evaluateTurn } = await import("./game")
    await publishGameChanged(campaignId)
    await evaluateTurn(campaignId)
}

/** O membro saiu da campanha: as partes dele no descanso aberto são concluídas sem ele. */
export async function onRestMemberLeft(campaignId: Types.ObjectId, memberId: Types.ObjectId): Promise<void> {
    const message = await openRest(campaignId)
    if (!message) return
    for (const entry of message.rest.characters.filter((item) => sameId(item.memberId, memberId))) await skipEntry(message._id, entry.characterId, "left")
    await settleRest(campaignId)
}

/** Quem o descanso aberto ainda espera (faixa do turno). */
export async function restWaiting(campaignId: Types.ObjectId): Promise<MaddoxRestWaitDto[]> {
    const message = await openRest(campaignId)
    if (!message) return []
    return message.rest.characters.filter((entry) => !restEntryDone(entry)).map((entry) => ({ characterName: entry.name, parts: restEntryWaits(entry) }))
}

// ── DTO ───────────────────────────────────────────────────────────────────────

export interface RestViewer {
    userId: string
    memberId: string | null
    isOwner: boolean
}

/** Balões de descanso de uma página de mensagens (PV e dados de vida ao vivo só nos descansos abertos). */
export async function restDtos(messages: readonly MessageDoc[], viewer: RestViewer, portraits: ReadonlyMap<string, string | null>): Promise<Map<string, MaddoxRestDto>> {
    const result = new Map<string, MaddoxRestDto>()
    const rests = messages.filter((message): message is RestMessage => message.kind === "rest" && Boolean(message.rest))
    if (!rests.length) return result
    const liveIds = rests.filter((message) => message.rest.status === "running").flatMap((message) => message.rest.characters.map((entry) => entry.sheetId))
    const sheets = new Map<string, StoredRestSheet>()
    if (liveIds.length) {
        const CharacterSheet = await sheetModel()
        for (const sheet of await CharacterSheet.find({ _id: { $in: liveIds } }).select("hpCurrent hpMax hitDiceTotal hitDiceUsed level constitution").lean<StoredRestSheet[]>()) sheets.set(String(sheet._id), sheet)
    }
    for (const message of rests) {
        const running = message.rest.status === "running"
        result.set(String(message._id), {
            type: message.rest.type,
            status: message.rest.status,
            description: message.rest.description,
            interruption: message.rest.interruption,
            characters: message.rest.characters.map((entry): MaddoxRestCharacterDto => {
                const sheet = sheets.get(String(entry.sheetId))
                const pool = sheet ? hitDicePool(sheet) : null
                const answering = running && !entry.doneReason && (entry.opex ? viewer.isOwner && entry.answeredBy === "owner" : viewer.memberId !== null && sameId(entry.memberId, viewer.memberId))
                return {
                    characterId: String(entry.characterId),
                    name: entry.name,
                    portraitUrl: portraits.get(String(entry.characterId)) ?? null,
                    opex: entry.opex,
                    prep: { status: entry.prep.status, recovered: entry.prep.recovered, notRecovered: entry.prep.notRecovered, skippedCatalog: entry.prep.skippedCatalog, error: viewer.isOwner ? entry.prep.error : null },
                    hitDice: {
                        status: entry.hitDice.status,
                        die: entry.hitDice.die,
                        available: pool?.available ?? 0,
                        hp: sheet?.hpMax ? Math.max(0, sheet.hpCurrent ?? sheet.hpMax) : 0,
                        hpMax: sheet?.hpMax ?? 0,
                        constitution: sheet ? abilityModifier(sheet.constitution ?? 10) : 0,
                        rolls: entry.hitDice.rolls.map((roll) => ({ roll: roll.roll, total: roll.total, healed: roll.healed, hpBefore: roll.hpBefore, hpAfter: roll.hpAfter })),
                    },
                    exchange: { status: entry.exchange.status, applied: entry.exchange.applied, requests: entry.exchange.requests },
                    answeredBy: entry.answeredBy,
                    doneReason: entry.doneReason,
                    done: restEntryDone(entry),
                    can: { roll: answering && entry.hitDice.status === "open", exchange: answering && entry.prep.status === "ready" && entry.exchange.status === "open", retryPrep: running && viewer.isOwner && entry.prep.status === "failed" },
                }
            }),
        })
    }
    return result
}

// ── Personagem Opex ───────────────────────────────────────────────────────────

const opexKey = (messageId: unknown, characterId: unknown) => `opex:${String(messageId)}:${String(characterId)}`

/** Põe na fila a parte de cada Personagem Opex do descanso aberto (chamado por `driveOpex`). */
export async function scheduleOpexRests(campaignId: Types.ObjectId): Promise<void> {
    const message = await openRest(campaignId)
    if (!message) return
    for (const entry of message.rest.characters) {
        if (!entry.opex || entry.answeredBy !== "player" || entry.doneReason) continue
        if (entry.hitDice.status !== "open" && entry.exchange.status !== "open") continue
        // O Opex só decide com a ficha preparada (as trocas não podem correr junto com a preparação).
        if (entry.prep.status !== "ready") continue
        const key = opexKey(message._id, entry.characterId)
        if (active.has(key)) continue
        active.add(key)
        void enqueueMaddoxJob(String(campaignId), `descanso do Personagem Opex (${entry.name})`, async ({ jobId, signal }) => {
            try {
                await runOpexRest(campaignId, message._id, entry.characterId, jobId, signal)
            } finally {
                active.delete(key)
            }
        })
    }
}

async function runOpexRest(campaignId: Types.ObjectId, messageId: Types.ObjectId, characterId: Types.ObjectId, jobId: string, signal: AbortSignal): Promise<void> {
    const found = await entryOf(messageId, characterId)
    if (!found || found.message.rest.status !== "running") return
    const { message, entry } = found
    if (entry.answeredBy !== "player" || entry.doneReason) return
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    const member = await MaddoxCampaignMemberModel.findById(entry.memberId).lean<IMaddoxCampaignMember>()
    if (!campaign || campaign.status !== "active" || !member) return
    const character = await MaddoxCharacterModel.findById(entry.characterId).lean<IMaddoxCharacter>()
    try {
        const [{ loadOpexModel, opexPromptContext, decideOpex }, { buildOpexInstructions, opexRestTask, opexRestReplyTask, opexMemoriesOf }, { opexRestDecisionSchema, opexRestReplySchema }] = await Promise.all([import("./opex-player"), import("./opex-prompt"), import("../rest-schemas")])
        const { settings, model } = await loadOpexModel(campaign.rigor)
        const instructions = buildOpexInstructions(await opexPromptContext(campaign, member, character, settings))
        const sheet = await loadRestSheet(entry.sheetId)
        const pool = sheet ? hitDicePool(sheet) : null
        const base = { model, instructions, title: `Personagem Opex · descanso · ${campaign.name}`, origin: MADDOX_OPEX_REST_CONSUMPTION_ORIGIN, subject: String(campaign._id), signal }
        const decision = await decideOpex({
            ...base,
            schema: opexRestDecisionSchema,
            prompt: opexRestTask({
                restType: message.rest.type,
                character: entry.name,
                recovered: entry.prep.recovered.map(restLineText),
                exchange: entry.exchange.status === "open",
                hitDice: { open: entry.hitDice.status === "open", die: pool?.die ?? null, available: pool?.available ?? 0, hp: sheet?.hpMax ? Math.max(0, sheet.hpCurrent ?? sheet.hpMax) : 0, hpMax: sheet?.hpMax ?? 0, constitution: abilityModifier(sheet?.constitution ?? 10) },
            }),
        })
        const memories = opexMemoriesOf({ memorias: decision.memorias })
        if (memories.length) {
            void import("@/features/engramind/server/opex-characters")
                .then(({ saveOpexCharacterMemories }) => saveOpexCharacterMemories({ campaignId: String(campaignId), memberId: String(member._id), characterName: entry.name }, memories, campaign.turn.number))
                .catch((error: unknown) => log.warn({ memberId: String(member._id), err: errorText(error) }, "[maddox] memórias do Personagem Opex (descanso) não gravadas"))
        }
        // Dados de vida: um por vez, até o que ele decidiu (ou até o PV máximo / os dados acabarem).
        for (let rolled = 0; rolled < decision.dadosDeVida; rolled++) {
            if (isAbortedMaddoxJob(jobId)) return
            const fresh = await entryOf(messageId, characterId)
            if (!fresh || fresh.entry.hitDice.status !== "open") break
            try {
                await spendHitDie(campaign, fresh.message, fresh.entry, member.userId)
            } catch (error) {
                if (error instanceof DomainError) break
                throw error
            }
        }
        await setHitDiceStatus(messageId, characterId, "open", decision.dadosDeVida > 0 ? "done" : "declined")
        // Trocas: o Maddox avalia (inline, neste job) e o Opex responde a um esclarecimento, até o teto de idas e voltas.
        let text = decision.trocas?.trim() || null
        let rounds = 0
        while (text && rounds < MADDOX_REST_OPEX_EXCHANGE_ROUNDS) {
            if (isAbortedMaddoxJob(jobId)) return
            const fresh = await entryOf(messageId, characterId)
            if (!fresh || fresh.entry.exchange.status !== "open") break
            try {
                await claimExchange(fresh.message, fresh.entry)
            } catch (error) {
                if (error instanceof DomainError) break
                throw error
            }
            const requestId = await createRequest(campaign, fresh.message, fresh.entry, clip(text, 4_000))
            const answer = await runRestExchange(campaignId, jobId, messageId, characterId, requestId, member.userId)
            rounds += 1
            if (answer.error) {
                // O Maddox não conseguiu avaliar o pedido: a parte não fecha sem troca nenhuma; o dono responde pelo
                // personagem (as trocas voltam a ficar abertas para ele).
                log.warn({ campaignId: String(campaignId), character: entry.name, err: answer.error }, "[maddox] troca do Personagem Opex não avaliada: o dono responde")
                await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].answeredBy": "owner", "rest.characters.$[c].opexError": clip(`O Maddox não avaliou a troca: ${answer.error}`, 500) } }, arrayFilter(characterId))
                await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].exchange.status": "open" } }, arrayFilter(characterId, { "exchange.status": "processing" }))
                await afterRestProgress(campaignId)
                return
            }
            if (rounds >= MADDOX_REST_OPEX_EXCHANGE_ROUNDS) break
            const reply = await decideOpex({ ...base, schema: opexRestReplySchema, prompt: opexRestReplyTask({ request: text, answer: answer.content }) })
            text = reply.resposta?.trim() || null
        }
        await setExchangeStatus(messageId, characterId, "open", rounds ? "done" : "nothing")
        log.info({ campaignId: String(campaignId), character: entry.name, hitDice: decision.dadosDeVida, exchanges: rounds }, "[maddox] Personagem Opex concluiu o descanso")
    } catch (error) {
        if (isAbortedMaddoxJob(jobId)) return
        // O agente falhou: a pergunta vai para o dono da campanha, que responde pelo personagem.
        log.warn({ campaignId: String(campaignId), character: entry.name, err: errorText(error) }, "[maddox] Personagem Opex não decidiu o descanso: o dono responde")
        await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].answeredBy": "owner", "rest.characters.$[c].opexError": clip(errorText(error), 500) } }, arrayFilter(characterId))
        await messages().updateOne({ _id: messageId }, { $set: { "rest.characters.$[c].exchange.status": "open" } }, arrayFilter(characterId, { "exchange.status": "processing" }))
    }
    await afterRestProgress(campaignId)
}
