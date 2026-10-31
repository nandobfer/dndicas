import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { maddoxUserChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { User } from "@/features/users/models/user"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_GAME_CHANGED_EVENT, MADDOX_GAME_PAGE_SIZE, MADDOX_MASTER_LOCK_STALE_MS, type MaddoxTurnPhase } from "../constants"
import {
    MaddoxCampaignMemberModel,
    MaddoxCampaignMessageModel,
    MaddoxCampaignModel,
    MaddoxCharacterModel,
    type IMaddoxCampaign,
    type IMaddoxCampaignMember,
    type IMaddoxCampaignMessage,
    type IMaddoxCharacter,
} from "../models"
import type { MaddoxGameActionInput, MaddoxSkipPlayerInput } from "../game-schemas"
import type { MaddoxGameMessageDto, MaddoxGameMessagesPageDto, MaddoxGameParticipantDto, MaddoxGameStateDto } from "../game-types"
import { assertMemberCanPlay, isMemberReadyToPlay, loadMembership } from "./campaigns"
import { getMaddoxMaster, type MaddoxMasterDeclaration } from "./game-master"
import { onlineUserIds } from "./game-presence"

/**
 * Mesa e motor de turnos das Campanhas Maddox (Maddox 3). SOMENTE servidor; `userId` é o usuário EFETIVO.
 *
 * - O dono inicia a campanha (`lobby` → `active`) e o turno 1 do mestre abre a história.
 * - Ao terminar o turno do mestre, abre o turno dos jogadores com a lista de ELEGÍVEIS fixada (membros
 *   ativos que concluíram a entrevista): quem fica pronto depois entra no próximo turno.
 * - O turno dos jogadores fecha quando todos os elegíveis PRESENTES (canal de presença do Pusher) já
 *   declararam ou passaram, com ao menos uma declaração. Presença desconhecida = todos os elegíveis.
 * - Pergunta ao mestre é respondida na hora e não muda o turno.
 * - Toda ação de jogo chama `assertMemberCanPlay` (entrevista de personagem concluída).
 * - Nesta entrega o mestre é simulado (`game-mock`).
 */

const log = loggerFor({ module: "maddox", feature: "game" })

type CampaignDoc = IMaddoxCampaign
type MemberDoc = IMaddoxCampaignMember
type CharacterDoc = IMaddoxCharacter
type MessageDoc = IMaddoxCampaignMessage

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000
const idSet = (ids: readonly Types.ObjectId[] | undefined) => new Set((ids ?? []).map(String))

function assertActive(campaign: CampaignDoc) {
    if (campaign.status !== "active") throw new DomainError(409, "A campanha não está em andamento.", "CAMPAIGN_NOT_ACTIVE")
}

function assertPlayersTurn(campaign: CampaignDoc) {
    if (campaign.turn?.phase !== "players") throw new DomainError(409, "O Maddox está narrando. Aguarde o turno dos jogadores.", "MASTER_TURN")
}

async function loadAsMember(campaignId: string, userId: string): Promise<{ campaign: CampaignDoc; member: MemberDoc }> {
    const { campaign, member } = await loadMembership(campaignId, userId)
    if (!member) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    return { campaign: campaign as CampaignDoc, member }
}

const reloadCampaign = async (id: Types.ObjectId) => {
    const campaign = await MaddoxCampaignModel.findById(id).lean<CampaignDoc>()
    if (!campaign) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    return campaign
}

/** Membros ativos com o personagem (para elegibilidade e DTO). */
async function joinedMembers(campaignId: Types.ObjectId) {
    const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).sort({ joinedAt: 1, createdAt: 1 }).lean<MemberDoc[]>()
    const characterIds = members.map((member) => member.characterId).filter((id): id is Types.ObjectId => Boolean(id))
    const characters = characterIds.length ? await MaddoxCharacterModel.find({ _id: { $in: characterIds } }).lean<CharacterDoc[]>() : []
    const byId = new Map(characters.map((character) => [String(character._id), character]))
    return members.map((member) => ({ member, character: member.characterId ? (byId.get(String(member.characterId)) ?? null) : null }))
}

const readyMemberIds = async (campaignId: Types.ObjectId) => (await joinedMembers(campaignId)).filter(({ character }) => isMemberReadyToPlay(character)).map(({ member }) => member._id)

/** Avisa todos os membros ativos (e quem mais for indicado) que a mesa mudou. Nunca lança. */
async function publishGameChanged(campaignId: Types.ObjectId, extraUserIds: string[] = []) {
    try {
        await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { updatedAt: new Date() } }, { timestamps: false })
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("turn").lean<Pick<CampaignDoc, "turn">>()
        const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).select("userId").lean<{ userId: string }[]>()
        const channels = [...new Set([...members.map((member) => member.userId), ...extraUserIds].filter(Boolean))].map(maddoxUserChannel)
        await publishToChannels(channels, MADDOX_GAME_CHANGED_EVENT, { campaignId: String(campaignId), turnNumber: campaign?.turn?.number ?? 0, phase: campaign?.turn?.phase ?? "master" })
    } catch (error) {
        log.warn({ err: error, campaignId: String(campaignId) }, "[maddox] Falha ao avisar a mesa")
    }
}

// ── Turno do mestre ────────────────────────────────────────────────────────────

/**
 * Narra o turno `turnNumber` do mestre (com a trava `token`) e abre o turno dos jogadores com a nova
 * lista de elegíveis. Retomada segura: a narração já gravada deste turno é reaproveitada.
 */
async function runMasterTurn(campaignId: Types.ObjectId, token: string, turnNumber: number): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.turn?.generating?.token !== token || campaign.turn.number !== turnNumber) return
    try {
        const existing = await MaddoxCampaignMessageModel.findOne({ campaignId, turnNumber, kind: "narration" }).select("_id").lean()
        if (!existing) {
            const actions = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber: turnNumber - 1, turnAction: true }).sort({ _id: 1 }).lean<MessageDoc[]>()
            const declarations: MaddoxMasterDeclaration[] = actions.map((action) => ({
                characterName: action.characterName ?? "Personagem",
                kind: action.kind === "pass" ? "pass" : "declaration",
                content: action.content,
                skipped: Boolean(action.skippedBy),
            }))
            const master = await getMaddoxMaster()
            const content = await master.narrate({ campaignName: campaign.name, turnNumber, openingSituation: campaign.openingSituation ?? "", declarations })
            await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "master", kind: "narration", content })
        }
        const eligible = await readyMemberIds(campaignId)
        const opened = await MaddoxCampaignModel.updateOne(
            { _id: campaignId, "turn.generating.token": token },
            { $set: { "turn.phase": "players", "turn.startedAt": new Date(), "turn.eligibleMemberIds": eligible, "turn.declaredMemberIds": [], "turn.generating": null } },
        )
        if (opened.modifiedCount === 0) log.info({ campaignId: String(campaignId), turnNumber }, "[maddox] Turno do mestre já retomado por outra chamada")
    } catch (error) {
        // Libera a trava: o próximo `GET`/`check` retoma o turno do mestre.
        log.error({ err: error, campaignId: String(campaignId), turnNumber }, "[maddox] Falha no turno do mestre")
        await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.generating.token": token }, { $set: { "turn.generating": null } })
    }
    await publishGameChanged(campaignId)
}

/** Fase do mestre sem geração em andamento (falha ou trava velha): pega a trava e narra. */
async function resumeMasterTurn(campaign: CampaignDoc): Promise<boolean> {
    if (campaign.status !== "active" || campaign.turn?.phase !== "master") return false
    const generating = campaign.turn.generating
    if (generating && Date.now() - new Date(generating.startedAt).getTime() < MADDOX_MASTER_LOCK_STALE_MS) return false
    const token = randomUUID()
    const stale = new Date(Date.now() - MADDOX_MASTER_LOCK_STALE_MS)
    const won = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, status: "active", "turn.phase": "master", "turn.number": campaign.turn.number, $or: [{ "turn.generating": null }, { "turn.generating.startedAt": { $lt: stale } }] },
        { $set: { "turn.generating": { token, startedAt: new Date() } } },
    )
    if (won.modifiedCount === 0) return false
    log.info({ campaignId: String(campaign._id), turnNumber: campaign.turn.number }, "[maddox] Retomando o turno do mestre")
    await runMasterTurn(campaign._id, token, campaign.turn.number)
    return true
}

// ── Turno dos jogadores ────────────────────────────────────────────────────────

/** Turno sem nenhum elegível (todos saíram): quem estiver pronto entra no turno atual — não há ninguém esperando. */
async function fillEmptyTurn(campaign: CampaignDoc): Promise<CampaignDoc> {
    if (campaign.status !== "active" || campaign.turn?.phase !== "players" || (campaign.turn.eligibleMemberIds ?? []).length > 0) return campaign
    const ready = await readyMemberIds(campaign._id)
    if (ready.length === 0) return campaign
    await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, "turn.number": campaign.turn.number, "turn.phase": "players", "turn.eligibleMemberIds": { $size: 0 } },
        { $set: { "turn.eligibleMemberIds": ready } },
    )
    return reloadCampaign(campaign._id)
}

/**
 * Fecha o turno dos jogadores se todos os elegíveis presentes já declararam (ao menos uma declaração).
 * A transição é condicional: só uma chamada vence e roda o turno do mestre.
 */
async function evaluateTurn(campaignId: Types.ObjectId): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.status !== "active") return
    if (campaign.turn?.phase === "master") {
        await resumeMasterTurn(campaign)
        return
    }
    const declared = idSet(campaign.turn?.declaredMemberIds)
    const eligibleIds = (campaign.turn?.eligibleMemberIds ?? []).map(String)
    if (eligibleIds.length === 0 || declared.size === 0) return

    const eligibleMembers = await MaddoxCampaignMemberModel.find({ _id: { $in: eligibleIds }, campaignId, status: "joined" }).select("userId").lean<{ _id: Types.ObjectId; userId: string }[]>()
    const online = await onlineUserIds(String(campaignId))
    const required = online ? eligibleMembers.filter((member) => online.has(member.userId)) : eligibleMembers
    const pending = required.filter((member) => !declared.has(String(member._id)))
    if (pending.length > 0) return

    const token = randomUUID()
    const number = campaign.turn.number
    const closed = await MaddoxCampaignModel.updateOne(
        { _id: campaignId, status: "active", "turn.number": number, "turn.phase": "players" },
        { $set: { "turn.number": number + 1, "turn.phase": "master" as MaddoxTurnPhase, "turn.startedAt": new Date(), "turn.eligibleMemberIds": [], "turn.declaredMemberIds": [], "turn.generating": { token, startedAt: new Date() } } },
    )
    if (closed.modifiedCount === 0) return
    log.info({ campaignId: String(campaignId), turnNumber: number, required: required.length, presence: online ? "pusher" : "unknown" }, "[maddox] Turno dos jogadores fechado")
    await publishGameChanged(campaignId)
    await runMasterTurn(campaignId, token, number + 1)
}

/** Grava a declaração/"não fazer nada" de um membro e a conta no turno (409 se o turno fechou no meio). */
async function recordTurnAction(campaign: CampaignDoc, target: MemberDoc, character: CharacterDoc | null, kind: "declaration" | "pass", content: string, skippedBy: string | null) {
    const turnNumber = campaign.turn.number
    if (idSet(campaign.turn.declaredMemberIds).has(String(target._id))) throw new DomainError(409, "Este jogador já declarou neste turno.", "ALREADY_DECLARED")
    let message
    try {
        message = await MaddoxCampaignMessageModel.create({
            campaignId: campaign._id,
            turnNumber,
            phase: "players",
            kind,
            memberId: target._id,
            userId: target.userId,
            characterId: character?._id ?? null,
            characterName: character?.name ?? null,
            content,
            skippedBy,
            turnAction: true,
        })
    } catch (error) {
        if (isDuplicateKey(error)) throw new DomainError(409, "Este jogador já declarou neste turno.", "ALREADY_DECLARED")
        throw error
    }
    const counted = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, status: "active", "turn.number": turnNumber, "turn.phase": "players", "turn.eligibleMemberIds": target._id },
        { $addToSet: { "turn.declaredMemberIds": target._id } },
    )
    if (counted.matchedCount === 0) {
        await MaddoxCampaignMessageModel.deleteOne({ _id: message._id })
        throw new DomainError(409, "O turno dos jogadores já foi encerrado.", "TURN_CLOSED")
    }
}

const characterOf = async (member: MemberDoc) => (member.characterId ? MaddoxCharacterModel.findById(member.characterId).lean<CharacterDoc>() : null)

// ── API do serviço ─────────────────────────────────────────────────────────────

/** Dono inicia a campanha: exige o cenário concluído e a própria entrevista de personagem. */
export async function startCampaign(campaignId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign } = await loadAsMember(campaignId, userId)
    if (campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode iniciá-la.", "FORBIDDEN")
    if (campaign.status === "lobby" || campaign.status === "interview") {
        if (campaign.scenarioInterview?.status !== "done" || campaign.status === "interview") throw new DomainError(409, "Conclua a entrevista de cenário com o Maddox antes de iniciar a campanha.", "SCENARIO_PENDING")
    } else {
        throw new DomainError(409, "Esta campanha já foi iniciada.", "CAMPAIGN_ALREADY_STARTED")
    }
    await assertMemberCanPlay(campaignId, userId)

    const token = randomUUID()
    const now = new Date()
    const started = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, status: "lobby", "scenarioInterview.status": "done" },
        { $set: { status: "active", startedAt: now, turn: { number: 1, phase: "master", startedAt: now, eligibleMemberIds: [], declaredMemberIds: [], generating: { token, startedAt: now } } } },
    )
    if (started.modifiedCount === 0) throw new DomainError(409, "Esta campanha já foi iniciada.", "CAMPAIGN_ALREADY_STARTED")
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, antes: { status: campaign.status }, depois: { status: "active", turn: 1 } })
    await publishGameChanged(campaign._id)
    await runMasterTurn(campaign._id, token, 1)
    return getGameState(campaignId, userId)
}

/** Declaração, "Não fazer nada" ou pergunta ao mestre (esta não encerra o turno). */
export async function submitGameAction(campaignId: string, input: MaddoxGameActionInput, userId: string): Promise<MaddoxGameStateDto> {
    const loaded = await loadAsMember(campaignId, userId)
    assertActive(loaded.campaign)
    await assertMemberCanPlay(campaignId, userId)
    assertPlayersTurn(loaded.campaign)
    const campaign = await fillEmptyTurn(loaded.campaign)
    const member = loaded.member
    if (!idSet(campaign.turn.eligibleMemberIds).has(String(member._id))) throw new DomainError(409, "Você entra no jogo a partir do próximo turno.", "NEXT_TURN")
    const character = await characterOf(member)

    if (input.kind === "question") {
        const turnNumber = campaign.turn.number
        const question = await MaddoxCampaignMessageModel.create({
            campaignId: campaign._id,
            turnNumber,
            phase: "players",
            kind: "question",
            memberId: member._id,
            userId,
            characterId: character?._id ?? null,
            characterName: character?.name ?? null,
            content: input.content,
        })
        const master = await getMaddoxMaster()
        const answer = await master.answer({ campaignName: campaign.name, turnNumber, characterName: character?.name ?? "Personagem", question: input.content })
        await MaddoxCampaignMessageModel.create({ campaignId: campaign._id, turnNumber, phase: "players", kind: "answer", content: answer, replyToId: question._id })
        await publishGameChanged(campaign._id)
        return getGameState(campaignId, userId)
    }

    await recordTurnAction(campaign, member, character, input.kind, input.kind === "declaration" ? input.content : "", null)
    await publishGameChanged(campaign._id)
    await evaluateTurn(campaign._id)
    return getGameState(campaignId, userId)
}

/** Dono registra "não fez nada" no lugar de um jogador ausente (só neste turno). */
export async function skipPlayer(campaignId: string, input: MaddoxSkipPlayerInput, userId: string): Promise<MaddoxGameStateDto> {
    const loaded = await loadAsMember(campaignId, userId)
    if (loaded.campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode pular a vez de um jogador.", "FORBIDDEN")
    assertActive(loaded.campaign)
    await assertMemberCanPlay(campaignId, userId)
    assertPlayersTurn(loaded.campaign)
    const campaign = await fillEmptyTurn(loaded.campaign)
    if (!Types.ObjectId.isValid(input.memberId)) throw new DomainError(404, "Jogador não encontrado", "NOT_FOUND")
    const target = await MaddoxCampaignMemberModel.findOne({ _id: new Types.ObjectId(input.memberId), campaignId: campaign._id, status: "joined" }).lean<MemberDoc>()
    if (!target) throw new DomainError(404, "Jogador não encontrado", "NOT_FOUND")
    if (!idSet(campaign.turn.eligibleMemberIds).has(String(target._id))) throw new DomainError(409, "Este jogador entra no jogo a partir do próximo turno.", "NEXT_TURN")
    const character = await characterOf(target)
    await recordTurnAction(campaign, target, character, "pass", "", userId)
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { turn: campaign.turn.number, skipped: target.userId } })
    await publishGameChanged(campaign._id)
    await evaluateTurn(campaign._id)
    return getGameState(campaignId, userId)
}

/**
 * Reavalia o turno (um jogador saiu da mesa, trava do mestre presa). Qualquer membro chama — inclusive quem
 * ainda não pode jogar e só assiste — porque não grava nada em nome de ninguém: o servidor consulta a
 * presença por conta própria e só aplica as regras do turno.
 */
export async function checkTurn(campaignId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign } = await loadAsMember(campaignId, userId)
    if (campaign.status === "active") {
        await fillEmptyTurn(campaign)
        await evaluateTurn(campaign._id)
    }
    return getGameState(campaignId, userId)
}

/** Membro saiu ou foi removido: deixa de contar no turno atual, que pode fechar. */
export async function onMemberLeftGame(campaignId: Types.ObjectId, memberId: Types.ObjectId): Promise<void> {
    const pulled = await MaddoxCampaignModel.updateOne({ _id: campaignId, status: "active" }, { $pull: { "turn.eligibleMemberIds": memberId } })
    if (pulled.modifiedCount === 0) return
    await publishGameChanged(campaignId)
    await evaluateTurn(campaignId)
}

// ── Leitura ────────────────────────────────────────────────────────────────────

async function messagesDto(messages: MessageDoc[]): Promise<MaddoxGameMessageDto[]> {
    const characterIds = [...new Set(messages.map((message) => message.characterId).filter((id): id is Types.ObjectId => Boolean(id)).map(String))]
    const skippers = [...new Set(messages.map((message) => message.skippedBy).filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id!)))]
    const [characters, users] = await Promise.all([
        characterIds.length ? MaddoxCharacterModel.find({ _id: { $in: characterIds } }).select("name portraitUrl").lean<Pick<CharacterDoc, "_id" | "name" | "portraitUrl">[]>() : Promise.resolve([]),
        skippers.length ? User.find({ _id: { $in: skippers } }).select("name username").lean<{ _id: Types.ObjectId; name?: string; username?: string }[]>() : Promise.resolve([]),
    ])
    const characterById = new Map(characters.map((character) => [String(character._id), character]))
    const userById = new Map(users.map((user) => [String(user._id), user.name?.trim() || user.username || "Dono"]))
    return messages.map((message) => {
        const character = message.characterId ? characterById.get(String(message.characterId)) : undefined
        return {
            id: String(message._id),
            turnNumber: message.turnNumber,
            phase: message.phase,
            kind: message.kind,
            memberId: message.memberId ? String(message.memberId) : null,
            characterName: character?.name ?? message.characterName ?? null,
            portraitUrl: character?.portraitUrl ?? null,
            content: message.content,
            replyToId: message.replyToId ? String(message.replyToId) : null,
            skippedByName: message.skippedBy ? (userById.get(message.skippedBy) ?? "Dono") : null,
            createdAt: new Date(message.createdAt).toISOString(),
        }
    })
}

async function messagesPage(campaignId: Types.ObjectId, before: Types.ObjectId | null): Promise<MaddoxGameMessagesPageDto> {
    const docs = await MaddoxCampaignMessageModel.find({ campaignId, ...(before ? { _id: { $lt: before } } : {}) })
        .sort({ _id: -1 })
        .limit(MADDOX_GAME_PAGE_SIZE + 1)
        .lean<MessageDoc[]>()
    const hasMore = docs.length > MADDOX_GAME_PAGE_SIZE
    return { messages: await messagesDto(docs.slice(0, MADDOX_GAME_PAGE_SIZE).reverse()), hasMore }
}

async function maddoxAvatarUrl(): Promise<string | null> {
    try {
        const { loadMaddoxSettings } = await import("./settings")
        const { settings } = await loadMaddoxSettings()
        return settings.avatar?.url ?? null
    } catch (error) {
        log.warn({ err: error }, "[maddox] Falha ao carregar o avatar do Maddox")
        return null
    }
}

/** Estado da mesa (o mesmo para todos os membros; `me` é o do usuário). Retoma turno do mestre interrompido. */
export async function getGameState(campaignId: string, userId: string): Promise<MaddoxGameStateDto> {
    const loaded = await loadAsMember(campaignId, userId)
    let campaign = loaded.campaign
    if (campaign.status === "active") {
        if (await resumeMasterTurn(campaign)) campaign = await reloadCampaign(campaign._id)
        campaign = await fillEmptyTurn(campaign)
    }
    const [members, page, avatarUrl] = await Promise.all([joinedMembers(campaign._id), messagesPage(campaign._id, null), maddoxAvatarUrl()])
    const userIds = members.map(({ member }) => member.userId).filter((id) => Types.ObjectId.isValid(id))
    const found = userIds.length ? await User.find({ _id: { $in: userIds } }).select("name username").lean<{ _id: Types.ObjectId; name?: string; username?: string }[]>() : []
    const users = new Map(found.map((user) => [String(user._id), user.name?.trim() || user.username || "Usuário"]))
    const eligible = idSet(campaign.turn?.eligibleMemberIds)
    const declared = idSet(campaign.turn?.declaredMemberIds)
    const playersTurn = campaign.status === "active" && campaign.turn?.phase === "players"
    const participants: MaddoxGameParticipantDto[] = members
        .map(({ member, character }) => ({
            memberId: String(member._id),
            userId: member.userId,
            name: users.get(member.userId) ?? "Usuário",
            characterName: character?.name ?? null,
            portraitUrl: character?.portraitUrl ?? null,
            role: member.role,
            ready: isMemberReadyToPlay(character),
            eligible: playersTurn && eligible.has(String(member._id)),
            declared: playersTurn && declared.has(String(member._id)),
        }))
        .sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1))
    const mine = participants.find((participant) => participant.memberId === String(loaded.member._id))
    return {
        campaignId: String(campaign._id),
        name: campaign.name,
        rigor: campaign.rigor,
        status: campaign.status,
        ownerId: campaign.ownerId,
        maddoxAvatarUrl: avatarUrl,
        turn: {
            number: campaign.turn?.number ?? 0,
            phase: campaign.turn?.phase ?? "master",
            startedAt: campaign.turn?.startedAt ? new Date(campaign.turn.startedAt).toISOString() : null,
            generating: Boolean(campaign.turn?.generating),
        },
        participants,
        me: { memberId: String(loaded.member._id), isOwner: campaign.ownerId === userId, ready: mine?.ready ?? false, eligible: mine?.eligible ?? false, declared: mine?.declared ?? false },
        messages: page.messages,
        hasMore: page.hasMore,
    }
}

/** Mensagens anteriores a `before` (paginação "Carregar anteriores"). */
export async function listGameMessages(campaignId: string, before: string | null, userId: string): Promise<MaddoxGameMessagesPageDto> {
    const { campaign } = await loadAsMember(campaignId, userId)
    if (before !== null && !Types.ObjectId.isValid(before)) throw new DomainError(400, "Cursor inválido", "INVALID_CURSOR")
    await dbConnect()
    return messagesPage(campaign._id, before ? new Types.ObjectId(before) : null)
}
