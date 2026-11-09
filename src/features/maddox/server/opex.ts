import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_INVITE_CLOSED_STATUSES } from "../constants"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel, type IMaddoxCampaign } from "../models"
import type { AddMaddoxOpexInput } from "../opex-schemas"
import type { MaddoxCampaignDetailDto } from "../campaign-types"
import { changed, getCampaignDetail } from "./campaigns"
import { opexUserIdFor } from "./opex-members"

/**
 * Personagens Opex (DND-26): adicionar e remover — SOMENTE servidor. A permissão `maddox.opex` é conferida na rota
 * (só para adicionar); as demais ações do dono exigem `maddox.play` e ser o dono da campanha.
 */

const log = loggerFor({ module: "maddox", feature: "opex" })

/**
 * Dono adiciona um Personagem Opex: no lobby ou com a campanha em andamento (nunca encerrada/arquivada), com o cenário
 * pronto e o Agente Maddox disponível (o mesmo 409 da criação). Sem limite de quantidade. O personagem entra como membro
 * `joined` e a entrevista começa em segundo plano (autônoma) ou aguarda o dono (ao vivo).
 */
export async function addOpexCharacter(campaignId: string, input: AddMaddoxOpexInput, userId: string): Promise<MaddoxCampaignDetailDto> {
    if (!Types.ObjectId.isValid(campaignId)) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<IMaddoxCampaign>()
    if (!campaign) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    if (campaign.ownerId !== userId) {
        const isMember = await MaddoxCampaignMemberModel.exists({ campaignId: campaign._id, userId, status: "joined" })
        if (!isMember) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
        throw new DomainError(403, "Só o dono da campanha pode adicionar Personagens Opex.", "FORBIDDEN")
    }
    if (MADDOX_INVITE_CLOSED_STATUSES.includes(campaign.status)) throw new DomainError(409, "A campanha foi encerrada: não dá para adicionar personagens.", "CAMPAIGN_CLOSED")
    if (campaign.scenarioInterview?.status !== "done" || campaign.status === "interview") throw new DomainError(409, "Conclua a entrevista de cenário com o Maddox antes de adicionar Personagens Opex.", "SCENARIO_PENDING")
    const { loadMaddoxSettings, maddoxOpexAvailability } = await import("./settings")
    const { settings } = await loadMaddoxSettings()
    const availability = await maddoxOpexAvailability(settings, campaign.rigor)
    if (!availability.available) throw new DomainError(409, availability.reason ?? 'O "Agente Maddox" não está disponível. Fale com um administrador.', "MADDOX_UNAVAILABLE")

    const _id = new Types.ObjectId()
    const now = new Date()
    await MaddoxCampaignMemberModel.create({
        _id,
        campaignId: campaign._id,
        userId: opexUserIdFor(_id),
        kind: "opex",
        role: "player",
        status: "joined",
        invitedBy: userId,
        joinedAt: now,
        opex: { ownerUserId: userId, prompt: input.prompt ?? "", interviewMode: input.interviewMode, addedAt: now, run: { status: "running", stage: "interview", error: null, updatedAt: now }, engramind: null },
    })
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.CRIAR, depois: { personagemOpex: String(_id), interviewMode: input.interviewMode, prompt: Boolean(input.prompt) } })
    await changed(campaign._id)
    // Memórias (agente e canais no Engramind) e a entrevista, em segundo plano: nada disso segura a resposta.
    void import("@/features/engramind/server/opex-characters")
        .then(({ provisionOpexCharacterAgent }) => provisionOpexCharacterAgent({ campaignId: String(campaign._id), memberId: String(_id), characterName: "" }, userId))
        .catch((error: unknown) => log.warn({ memberId: String(_id), err: error instanceof Error ? error.message : String(error) }, "[maddox] memórias do Personagem Opex não agendadas"))
    void import("./opex-interview").then(({ scheduleOpexInterview }) => scheduleOpexInterview(String(_id)))
    return getCampaignDetail(campaignId, userId)
}

/** Opex removido (já gravado e auditado por `removeMember`): o canal individual é arquivado e o agente aposentado. */
export async function onOpexRemoved(campaignId: Types.ObjectId, memberId: Types.ObjectId, actorId: string): Promise<void> {
    try {
        const { retireOpexCharacterAgent } = await import("@/features/engramind/server/opex-characters")
        await retireOpexCharacterAgent({ campaignId: String(campaignId), memberId: String(memberId) }, actorId)
    } catch (error) {
        log.warn({ memberId: String(memberId), err: error instanceof Error ? error.message : String(error) }, "[maddox] memórias do Personagem Opex removido não arquivadas")
    }
}

// ── Mesa: falha do agente ───────────────────────────────────────────────────

async function loadForTable(campaignId: string, memberId: string, userId: string) {
    const { loadOpexAsOwner } = await import("./opex-members")
    const loaded = await loadOpexAsOwner(campaignId, memberId, userId)
    if (loaded.campaign.status !== "active") throw new DomainError(409, "A campanha não está em andamento.", "CAMPAIGN_NOT_ACTIVE")
    return loaded
}

/** "Tentar de novo" na mesa: o Opex que falhou age de novo. */
export async function retryOpexTableAction(campaignId: string, memberId: string, userId: string) {
    const { campaign, member } = await loadForTable(campaignId, memberId, userId)
    const { retryOpexAction } = await import("./opex-table")
    await retryOpexAction(campaign, member._id)
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { turn: campaign.turn.number, personagemOpex: memberId, mesa: "tentar de novo" } })
    const { getGameState } = await import("./game")
    return getGameState(campaignId, userId)
}

/** "Pular" na mesa: registra "não fez nada" (ou encerra a vez no combate) no lugar do Opex. */
export async function skipOpexTableAction(campaignId: string, memberId: string, userId: string) {
    const { campaign, member } = await loadForTable(campaignId, memberId, userId)
    const actor = campaign.turn?.opexActor
    const combatActor = campaign.turn?.combatActor
    const isActor = (actor && String(actor.memberId) === memberId) || (combatActor && String(combatActor.memberId) === memberId)
    if (campaign.turn?.phase !== "players" || !isActor) throw new DomainError(409, "Não é a vez deste Personagem Opex.", "NOT_OPEX_TURN")
    const { skipOpexAction } = await import("./opex-table")
    await skipOpexAction(campaign, member, userId)
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { turn: campaign.turn.number, personagemOpex: memberId, mesa: "pulado" } })
    const { getGameState } = await import("./game")
    return getGameState(campaignId, userId)
}
