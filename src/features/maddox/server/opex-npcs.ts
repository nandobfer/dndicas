import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_INVITE_CLOSED_STATUSES, MADDOX_OPEX_NPC_SYSTEM_ACTOR, type MaddoxOpexNpcRetireReason } from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxNpcModel, type IMaddoxCampaign, type IMaddoxNpc } from "../models"

/**
 * NPCs Opex (DND-27): promover e desfazer — SOMENTE servidor. Único lugar com as regras, usado pelas ferramentas do
 * Maddox, pelas rotas do dono e pelos ganchos de morte (`save_npc` e o fim do combate).
 *
 * Promover grava a marca (`opex.active`) e, em segundo plano, provisiona o agente no Engramind (restaura o canal
 * arquivado de uma promoção anterior) e grava a memória inicial (descrição pública e notas do mestre). Desfazer (ou a
 * morte) desliga a marca e aposenta o agente (canal arquivado, agente desativado, token revogado). Nenhuma das duas
 * cria mensagem na conversa: a mesa só é avisada para o chip aparecer ou sumir.
 */

const log = loggerFor({ module: "maddox", feature: "opex-npc" })

type CampaignDoc = Pick<IMaddoxCampaign, "_id" | "name" | "status" | "ownerId"> & { turn?: Pick<IMaddoxCampaign["turn"], "number"> }
type NpcDoc = IMaddoxNpc

/** NPC pelo id (rotas do dono) ou pelo nome (ferramentas do Maddox; acento e caixa não importam). */
export type OpexNpcTarget = { id: string } | { name: string }

export interface OpexNpcPromotion {
    npc: { id: string; name: string; visibility: NpcDoc["visibility"] }
    alreadyOpex: boolean
}

export interface OpexNpcRetirement {
    npc: { id: string; name: string }
    notOpex: boolean
}

// ── Trabalho em segundo plano (Engramind) ─────────────────────────────────────

const globalBackground = globalThis as unknown as { __maddoxOpexNpcWork?: Set<Promise<unknown>> }
const background: Set<Promise<unknown>> = (globalBackground.__maddoxOpexNpcWork ??= new Set())

function inBackground(label: string, work: () => Promise<unknown>): void {
    const running = work()
        .catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : String(error), label }, "[maddox] memórias do NPC Opex não atualizadas"))
        .finally(() => background.delete(running))
    background.add(running)
}

/** Testes: espera o provisionamento e as gravações em segundo plano dos NPCs Opex. */
export async function waitForOpexNpcWork(): Promise<void> {
    while (background.size) await Promise.allSettled([...background])
}

// ── Leitura ──────────────────────────────────────────────────────────────────

async function loadCampaign(campaignId: Types.ObjectId | string): Promise<CampaignDoc> {
    if (!Types.ObjectId.isValid(String(campaignId))) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("name status ownerId turn.number").lean<CampaignDoc>()
    if (!campaign) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    return campaign
}

async function findNpc(campaignId: Types.ObjectId, target: OpexNpcTarget): Promise<NpcDoc | null> {
    if ("id" in target) {
        if (!Types.ObjectId.isValid(target.id)) return null
        return MaddoxNpcModel.findOne({ _id: new Types.ObjectId(target.id), campaignId }).lean<NpcDoc>()
    }
    const nameKey = normalizeCatalogName(target.name.trim())
    if (!nameKey) return null
    return MaddoxNpcModel.findOne({ campaignId, nameKey }).lean<NpcDoc>()
}

/** Recusa "NPC inexistente" com a lista dos NPCs da campanha (a ferramenta mostra ao Maddox). */
async function notFound(campaignId: Types.ObjectId, target: OpexNpcTarget): Promise<never> {
    const names = await MaddoxNpcModel.find({ campaignId }).sort({ name: 1 }).limit(100).select("name").lean<{ name: string }[]>()
    const label = "name" in target ? `"${target.name}"` : "informado"
    const list = names.length ? names.map((item) => item.name).join(", ") : "(nenhum registrado)"
    throw new DomainError(404, `Nenhum NPC ${label} nesta campanha. NPCs: ${list}.`, "NPC_NOT_FOUND")
}

/** NPCs Opex ativos da campanha. */
export async function activeOpexNpcs(campaignId: Types.ObjectId): Promise<NpcDoc[]> {
    return MaddoxNpcModel.find({ campaignId, "opex.active": true }).sort({ name: 1 }).lean<NpcDoc[]>()
}

/**
 * Dentre os ids informados, os NPCs Opex que os jogadores conhecem (chip "Opex" nos cards do chat e na iniciativa): um NPC
 * Opex só do mestre não ganha chip até ficar conhecido.
 */
export async function knownOpexNpcIds(npcIds: readonly (Types.ObjectId | string | null | undefined)[]): Promise<Set<string>> {
    const ids = [...new Set(npcIds.filter((id): id is Types.ObjectId | string => Boolean(id) && Types.ObjectId.isValid(String(id))).map(String))]
    if (!ids.length) return new Set()
    const rows = await MaddoxNpcModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, visibility: "players", "opex.active": true }).select("_id").lean<{ _id: Types.ObjectId }[]>()
    return new Set(rows.map((row) => String(row._id)))
}

export const isOpexNpc = (npc: Pick<NpcDoc, "opex"> | null | undefined) => Boolean(npc?.opex?.active)

async function opexNpcLimit(): Promise<number | null> {
    const { loadMaddoxSettings } = await import("./settings")
    const { settings } = await loadMaddoxSettings()
    return settings.opexNpcLimit ?? null
}

function assertOpen(campaign: CampaignDoc, verb: "promover" | "desfazer") {
    if (MADDOX_INVITE_CLOSED_STATUSES.includes(campaign.status)) {
        throw new DomainError(409, `A campanha foi ${campaign.status === "archived" ? "arquivada" : "encerrada"}: não dá para ${verb} NPCs Opex.`, "CAMPAIGN_CLOSED")
    }
}

const limitError = (limit: number) => new DomainError(409, `Limite de ${limit} NPC${limit === 1 ? "" : "s"} Opex desta campanha atingido.`, "OPEX_NPC_LIMIT")

async function announce(campaignId: Types.ObjectId): Promise<void> {
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(campaignId)
}

// ── Promover ────────────────────────────────────────────────────────────────

/**
 * Promove um NPC a NPC Opex. Recusas (mesmo código para o Maddox e o dono): NPC inexistente (com a lista), morto,
 * campanha encerrada/arquivada, promoção desligada (limite 0) e limite atingido. NPC que já é Opex não muda.
 */
export async function promoteOpexNpc(campaignId: Types.ObjectId | string, target: OpexNpcTarget, actorId: string): Promise<OpexNpcPromotion> {
    const campaign = await loadCampaign(campaignId)
    assertOpen(campaign, "promover")
    const npc = (await findNpc(campaign._id, target)) ?? (await notFound(campaign._id, target))
    const view = { id: String(npc._id), name: npc.name, visibility: npc.visibility }
    if (isOpexNpc(npc)) return { npc: view, alreadyOpex: true }
    if (npc.status === "dead") throw new DomainError(409, `${npc.name} está morto: um NPC morto não pode ser promovido a NPC Opex.`, "NPC_DEAD")
    const limit = await opexNpcLimit()
    if (limit === 0) throw new DomainError(409, "A promoção de NPCs Opex está desligada nesta configuração.", "OPEX_NPC_DISABLED")
    if (limit !== null && (await MaddoxNpcModel.countDocuments({ campaignId: campaign._id, "opex.active": true })) >= limit) throw limitError(limit)

    const now = new Date()
    const marks = { active: true, promotedAt: now, promotedBy: actorId, retiredAt: null, retiredReason: null }
    // Sem subdocumento (primeira promoção) grava o objeto inteiro; com ele, só as marcas (o agente anterior fica).
    const written = npc.opex
        ? await MaddoxNpcModel.updateOne({ _id: npc._id, "opex.active": { $ne: true } }, { $set: Object.fromEntries(Object.entries(marks).map(([key, value]) => [`opex.${key}`, value])) })
        : await MaddoxNpcModel.updateOne({ _id: npc._id, opex: null }, { $set: { opex: { ...marks, engramind: null } } })
    if (written.modifiedCount === 0) return { npc: view, alreadyOpex: true }
    // Duas promoções ao mesmo tempo podem passar do limite: a que sobrou é desfeita.
    if (limit !== null && (await MaddoxNpcModel.countDocuments({ campaignId: campaign._id, "opex.active": true })) > limit) {
        await MaddoxNpcModel.updateOne({ _id: npc._id, "opex.promotedAt": now }, { $set: { "opex.active": false, "opex.retiredAt": now } })
        throw limitError(limit)
    }
    log.info({ campaignId: String(campaign._id), npcId: view.id, actorId }, "[maddox] NPC promovido a NPC Opex")
    const ref = { campaignId: String(campaign._id), npcId: view.id, npcName: npc.name }
    inBackground("promover", async () => {
        const memories = await import("@/features/engramind/server/opex-npcs")
        await memories.provisionOpexNpcAgent(ref, actorId)
        await memories.seedOpexNpcInitialMemories(ref, { publicDescription: npc.publicDescription ?? "", masterNotes: npc.masterNotes ?? "" }, campaign.turn?.number ?? null)
    })
    await announce(campaign._id)
    return { npc: view, alreadyOpex: false }
}

// ── Desfazer ────────────────────────────────────────────────────────────────

/**
 * NPC deixa de ser Opex (pelo Maddox, pelo dono ou pela morte): a marca é desligada e o agente aposentado. Campanha
 * encerrada/arquivada recusa, exceto a morte. NPC que não é Opex não muda.
 */
export async function retireOpexNpc(campaignId: Types.ObjectId | string, target: OpexNpcTarget, reason: MaddoxOpexNpcRetireReason, actorId: string): Promise<OpexNpcRetirement> {
    const campaign = await loadCampaign(campaignId)
    if (reason !== "death") assertOpen(campaign, "desfazer")
    const npc = (await findNpc(campaign._id, target)) ?? (await notFound(campaign._id, target))
    const view = { id: String(npc._id), name: npc.name }
    if (!isOpexNpc(npc)) return { npc: view, notOpex: true }
    const written = await MaddoxNpcModel.updateOne({ _id: npc._id, "opex.active": true }, { $set: { "opex.active": false, "opex.retiredAt": new Date(), "opex.retiredReason": reason } })
    if (written.modifiedCount === 0) return { npc: view, notOpex: true }
    log.info({ campaignId: String(campaign._id), npcId: view.id, reason, actorId }, "[maddox] NPC deixou de ser NPC Opex")
    inBackground("desfazer", async () => {
        const { retireOpexNpcAgent } = await import("@/features/engramind/server/opex-npcs")
        await retireOpexNpcAgent({ campaignId: String(campaign._id), npcId: view.id }, actorId)
    })
    await announce(campaign._id)
    return { npc: view, notOpex: false }
}

/** Gancho de morte (`save_npc` e fim do combate): NPC Opex morto deixa de ser Opex sozinho. Nunca lança. */
export async function retireOpexNpcIfDead(campaignId: Types.ObjectId | string, npcId: Types.ObjectId | string): Promise<boolean> {
    try {
        const npc = await MaddoxNpcModel.findById(npcId).select("status opex.active").lean<Pick<NpcDoc, "status" | "opex">>()
        if (npc?.status !== "dead" || !isOpexNpc(npc)) return false
        const result = await retireOpexNpc(campaignId, { id: String(npcId) }, "death", MADDOX_OPEX_NPC_SYSTEM_ACTOR)
        return !result.notOpex
    } catch (error) {
        log.warn({ campaignId: String(campaignId), npcId: String(npcId), err: error instanceof Error ? error.message : String(error) }, "[maddox] NPC Opex morto não desfeito")
        return false
    }
}

// ── Dono da campanha ─────────────────────────────────────────────────────────

/**
 * NPC para uma ação do dono: quem não participa recebe 404, um jogador 403 e um NPC só do mestre (ou inexistente) 404 —
 * o dono não vê os NPCs que os jogadores não conhecem.
 */
async function loadNpcAsOwner(campaignId: string, npcId: string, userId: string): Promise<{ campaign: CampaignDoc; npc: NpcDoc }> {
    const campaign = await loadCampaign(campaignId)
    if (campaign.ownerId !== userId) {
        const isMember = await MaddoxCampaignMemberModel.exists({ campaignId: campaign._id, userId, status: "joined" })
        if (!isMember) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
        throw new DomainError(403, "Só o dono da campanha pode cuidar dos NPCs Opex.", "FORBIDDEN")
    }
    const npc = Types.ObjectId.isValid(npcId) ? await MaddoxNpcModel.findOne({ _id: new Types.ObjectId(npcId), campaignId: campaign._id, visibility: "players" }).lean<NpcDoc>() : null
    if (!npc) throw new DomainError(404, "NPC não encontrado", "NOT_FOUND")
    return { campaign, npc }
}

/** "Promover a NPC Opex" (dono com `maddox.opex`, conferida na rota): mesmas recusas do Maddox; auditado. */
export async function promoteOpexNpcAsOwner(campaignId: string, npcId: string, userId: string) {
    const { campaign, npc } = await loadNpcAsOwner(campaignId, npcId, userId)
    const result = await promoteOpexNpc(campaign._id, { id: String(npc._id) }, userId)
    if (!result.alreadyOpex) await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { npcOpex: String(npc._id), nome: npc.name, acao: "promover" } })
    const { getGameState } = await import("./game")
    return getGameState(String(campaign._id), userId)
}

/** "Remover Opex" (dono com `maddox.opex`, conferida na rota): campanha encerrada recusa; auditado. */
export async function retireOpexNpcAsOwner(campaignId: string, npcId: string, userId: string) {
    const { campaign, npc } = await loadNpcAsOwner(campaignId, npcId, userId)
    const result = await retireOpexNpc(campaign._id, { id: String(npc._id) }, "owner", userId)
    if (!result.notOpex) await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, depois: { npcOpex: String(npc._id), nome: npc.name, acao: "remover" } })
    const { getGameState } = await import("./game")
    return getGameState(String(campaign._id), userId)
}

/**
 * "Promover"/"Remover Opex" aparecem para quem vê a mesa ou o Diário: o dono com `maddox.opex`. As permissões vêm do
 * usuário da requisição (respeita "Visualizar como"); fora de uma requisição (gerações em segundo plano), `false`.
 */
export async function canManageOpexNpcsAs(ownerId: string, userId: string): Promise<boolean> {
    if (ownerId !== userId) return false
    try {
        const [{ optionalAccess }, { canAddMaddoxOpex }] = await Promise.all([import("@/features/perfix/server/auth"), import("../opex-schemas")])
        const access = await optionalAccess()
        return Boolean(access && access.userId === userId && canAddMaddoxOpex([...access.effective]))
    } catch {
        return false
    }
}
