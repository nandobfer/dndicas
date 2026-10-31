import { randomBytes } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { User } from "@/features/users/models/user"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_INVITE_CLOSED_STATUSES, type MaddoxCampaignStatus } from "../constants"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCharacter } from "../models"
import type { CreateMaddoxCampaignInput, MaddoxCharacterDraftInput, UpdateMaddoxCampaignInput } from "../campaign-schemas"
import type {
    MaddoxCampaignCharacterDto,
    MaddoxCampaignDetailDto,
    MaddoxCampaignListItemDto,
    MaddoxCampaignMemberDto,
    MaddoxInviteLinkDto,
    MaddoxInvitePreviewDto,
} from "../campaign-types"
import { notifyCampaignChanged } from "./campaign-realtime"

/**
 * Campanhas Maddox (Maddox 1 e 2; a mesa do Maddox 3 fica em `./game`): lista, criação, lobby, link de convite, esboço de personagem e a
 * regra "só entra no jogo quem concluiu a entrevista".
 * SOMENTE servidor. `userId` é sempre o usuário EFETIVO (respeita o "Visualizar como").
 */

const log = loggerFor({ module: "maddox", feature: "campaigns" })

const NOT_FOUND = "Campanha não encontrada"
const INVITE_NOT_FOUND = "Convite inválido ou expirado. Peça um link novo ao dono da campanha."
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/

type CampaignDoc = Omit<IMaddoxCampaign, "invite"> & { invite?: { token?: string | null; rotatedAt?: Date | null } }
type MemberDoc = IMaddoxCampaignMember
type CharacterDoc = IMaddoxCharacter

const newToken = () => randomBytes(32).toString("base64url")
const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000
const inviteOpen = (status: MaddoxCampaignStatus) => !MADDOX_INVITE_CLOSED_STATUSES.includes(status)
const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)

function objectId(id: string, message = NOT_FOUND): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, message, "NOT_FOUND")
    return new Types.ObjectId(id)
}

function characterDto(character: CharacterDoc | undefined, sheetSlugs: Map<string, string>): MaddoxCampaignCharacterDto | null {
    if (!character) return null
    const profile = character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...(character.profile ?? {}) }
    return {
        id: String(character._id),
        name: character.name,
        portraitUrl: character.portraitUrl ?? null,
        interviewStatus: character.interview?.status ?? "pending",
        profile,
        sheetSlug: character.sheetId ? (sheetSlugs.get(String(character.sheetId)) ?? null) : null,
    }
}

/** Só entra no jogo (Maddox 3) quem concluiu a entrevista de personagem. */
export function isMemberReadyToPlay(character: Pick<CharacterDoc, "interview"> | null | undefined): boolean {
    return character?.interview?.status === "done"
}

/** Barra quem ainda não concluiu a entrevista de personagem (409 `INTERVIEW_REQUIRED`). */
export async function assertMemberCanPlay(campaignId: string, userId: string): Promise<void> {
    const { member } = await loadMembership(campaignId, userId)
    const character = member?.characterId ? await MaddoxCharacterModel.findById(member.characterId).select("interview").lean<CharacterDoc>() : null
    if (!isMemberReadyToPlay(character)) throw new DomainError(409, "Conclua a entrevista de personagem com o Maddox antes de entrar no jogo.", "INTERVIEW_REQUIRED")
}

/** Membro ativo da campanha (autorização do canal de presença da mesa). */
export async function isActiveCampaignMember(campaignId: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(campaignId)) return false
    await dbConnect()
    return (await MaddoxCampaignMemberModel.exists({ campaignId: new Types.ObjectId(campaignId), userId, status: "joined" })) !== null
}

/** O rigor só muda no lobby e antes de a entrevista de cenário começar. */
const rigorLocked = (campaign: Pick<CampaignDoc, "status" | "scenarioInterview">) => campaign.status !== "lobby" || (campaign.scenarioInterview?.status ?? "pending") !== "pending"

async function loadUsers(ids: string[]) {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return new Map<string, { name: string; username: string | null; avatarUrl: string | null }>()
    const users = await User.find({ _id: { $in: valid } }).select("name username avatarUrl").lean<{ _id: Types.ObjectId; name?: string; username?: string; avatarUrl?: string }[]>()
    return new Map(users.map((user) => [String(user._id), { name: user.name?.trim() || user.username || "Usuário", username: user.username ?? null, avatarUrl: user.avatarUrl ?? null }]))
}

/** Monta os DTOs com os membros ativos (dono primeiro), os perfis dos usuários e os personagens. */
async function buildDtos(campaigns: CampaignDoc[], userId: string): Promise<(MaddoxCampaignListItemDto & { myMemberId: string | null })[]> {
    if (campaigns.length === 0) return []
    const ids = campaigns.map((campaign) => campaign._id)
    const members = await MaddoxCampaignMemberModel.find({ campaignId: { $in: ids }, status: "joined" }).sort({ joinedAt: 1, createdAt: 1 }).lean<MemberDoc[]>()
    const characterIds = members.map((member) => member.characterId).filter((id): id is Types.ObjectId => Boolean(id))
    const [characters, users] = await Promise.all([
        characterIds.length ? MaddoxCharacterModel.find({ _id: { $in: characterIds } }).lean<CharacterDoc[]>() : Promise.resolve([] as CharacterDoc[]),
        loadUsers([...members.map((member) => member.userId), ...campaigns.map((campaign) => campaign.ownerId)]),
    ])
    const sheetIds = characters.map((character) => character.sheetId).filter((id): id is Types.ObjectId => Boolean(id))
    const sheetSlugs = new Map<string, string>()
    if (sheetIds.length) {
        const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
        const sheets = await CharacterSheet.find({ _id: { $in: sheetIds } }).select("slug").lean<{ _id: Types.ObjectId; slug: string }[]>()
        for (const sheet of sheets) sheetSlugs.set(String(sheet._id), sheet.slug)
    }
    const characterById = new Map(characters.map((character) => [String(character._id), character]))
    return campaigns.map((campaign) => {
        const own = members.filter((member) => String(member.campaignId) === String(campaign._id))
        const dtos: MaddoxCampaignMemberDto[] = own
            .map((member) => {
                const user = users.get(member.userId)
                const character = member.characterId ? characterById.get(String(member.characterId)) : undefined
                return {
                    id: String(member._id),
                    userId: member.userId,
                    name: user?.name ?? "Usuário",
                    username: user?.username ?? null,
                    avatarUrl: user?.avatarUrl ?? null,
                    role: member.role,
                    joinedAt: iso(member.joinedAt),
                    character: characterDto(character, sheetSlugs),
                    ready: isMemberReadyToPlay(character),
                }
            })
            .sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1))
        const mine = own.find((member) => member.userId === userId)
        const myDto = dtos.find((member) => member.userId === userId)
        return {
            id: String(campaign._id),
            name: campaign.name,
            rigor: campaign.rigor,
            status: campaign.status,
            coverUrl: campaign.coverUrl ?? null,
            ownerId: campaign.ownerId,
            ownerName: users.get(campaign.ownerId)?.name ?? "Usuário",
            myRole: campaign.ownerId === userId ? "owner" : (mine?.role ?? "player"),
            myCharacter: myDto?.character ?? null,
            members: dtos,
            turnNumber: campaign.turn?.number ?? 0,
            turnPhase: campaign.turn?.phase ?? "master",
            startedAt: iso(campaign.startedAt),
            scenarioStatus: campaign.scenarioInterview?.status ?? "pending",
            createdAt: new Date(campaign.createdAt).toISOString(),
            updatedAt: new Date(campaign.updatedAt).toISOString(),
            myMemberId: mine ? String(mine._id) : null,
        }
    })
}

const memberUserIds = async (campaignId: Types.ObjectId) =>
    (await MaddoxCampaignMemberModel.find({ campaignId, status: "joined" }).select("userId").lean<{ userId: string }[]>()).map((member) => member.userId)

/** Avisa os membros ativos (e quem mais for indicado, ex.: o removido) e marca a campanha como atualizada. */
export async function changed(campaignId: Types.ObjectId, extraUserIds: string[] = []) {
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { updatedAt: new Date() } }, { timestamps: false })
    await notifyCampaignChanged(String(campaignId), [...(await memberUserIds(campaignId)), ...extraUserIds])
}

/** Campanha + meu registro de membro ativo. Quem não participa recebe 404 (não revela a campanha). */
export async function loadMembership(campaignId: string, userId: string): Promise<{ campaign: CampaignDoc; member: MemberDoc | null }> {
    const _id = objectId(campaignId)
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findById(_id).lean<CampaignDoc>()
    if (!campaign) throw new DomainError(404, NOT_FOUND, "NOT_FOUND")
    const member = await MaddoxCampaignMemberModel.findOne({ campaignId: _id, userId, status: "joined" }).lean<MemberDoc>()
    if (!member && campaign.ownerId !== userId) throw new DomainError(404, NOT_FOUND, "NOT_FOUND")
    return { campaign, member }
}

async function loadAsOwner(campaignId: string, userId: string) {
    const loaded = await loadMembership(campaignId, userId)
    if (loaded.campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode fazer isso.", "FORBIDDEN")
    return loaded
}

// ── Lista e detalhe ────────────────────────────────────────────────────────────

/** Campanhas em que sou dono ou membro ativo (saiu/removido não aparece), da mais recente para a mais antiga. */
export async function listMyCampaigns(userId: string): Promise<MaddoxCampaignListItemDto[]> {
    await dbConnect()
    const memberships = await MaddoxCampaignMemberModel.find({ userId, status: "joined" }).select("campaignId").lean<{ campaignId: Types.ObjectId }[]>()
    const campaigns = await MaddoxCampaignModel.find({ $or: [{ _id: { $in: memberships.map((member) => member.campaignId) } }, { ownerId: userId }] })
        .sort({ updatedAt: -1 })
        .lean<CampaignDoc[]>()
    return (await buildDtos(campaigns, userId)).map((item) => {
        const { myMemberId, ...rest } = item
        void myMemberId
        return rest
    })
}

export async function getCampaignDetail(campaignId: string, userId: string): Promise<MaddoxCampaignDetailDto> {
    const { campaign } = await loadMembership(campaignId, userId)
    const [dto] = await buildDtos([campaign], userId)
    return {
        ...dto!,
        myMemberId: dto!.myMemberId ?? "",
        inviteOpen: inviteOpen(campaign.status),
        setting: campaign.setting ?? "",
        openingSituation: campaign.openingSituation ?? "",
        rigorLocked: rigorLocked(campaign),
    }
}

// ── Criação e edição ───────────────────────────────────────────────────────────

/** Cria a campanha no lobby com o dono como primeiro membro. Exige o Agente Maddox disponível (409). */
export async function createCampaign(input: CreateMaddoxCampaignInput, userId: string): Promise<MaddoxCampaignDetailDto> {
    // Sob demanda: a configuração puxa a camada de IA (memória do projeto: imports pesados lazy).
    const { loadMaddoxSettings, maddoxAvailability } = await import("./settings")
    await dbConnect()
    const { settings } = await loadMaddoxSettings()
    const availability = await maddoxAvailability(settings)
    if (!availability.available) throw new DomainError(409, availability.reason ?? 'O "Agente Maddox" não está disponível. Fale com um administrador.', "MADDOX_UNAVAILABLE")

    const campaign = await MaddoxCampaignModel.create({ name: input.name, ownerId: userId, rigor: input.rigor, status: "lobby", invite: { token: newToken(), rotatedAt: new Date() } })
    try {
        await MaddoxCampaignMemberModel.create({ campaignId: campaign._id, userId, role: "owner", status: "joined", invitedBy: null, joinedAt: new Date() })
    } catch (error) {
        // Sem transação: desfaz a campanha para não deixar uma campanha sem dono no lobby.
        await MaddoxCampaignModel.deleteOne({ _id: campaign._id }).catch(() => undefined)
        throw error
    }
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.CRIAR, depois: { name: input.name, rigor: input.rigor, status: "lobby" } })
    await notifyCampaignChanged(String(campaign._id), [userId])
    return getCampaignDetail(String(campaign._id), userId)
}

/** Dono renomeia; o rigor só muda no lobby e antes de a entrevista de cenário começar. */
export async function updateCampaign(campaignId: string, input: UpdateMaddoxCampaignInput, userId: string): Promise<MaddoxCampaignDetailDto> {
    const { campaign } = await loadAsOwner(campaignId, userId)
    if (input.rigor !== undefined && input.rigor !== campaign.rigor && rigorLocked(campaign)) {
        throw new DomainError(409, "O grau de rigor só pode mudar no lobby, antes da entrevista de cenário.", "RIGOR_LOCKED")
    }
    const next = { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.rigor !== undefined ? { rigor: input.rigor } : {}) }
    await MaddoxCampaignModel.updateOne({ _id: campaign._id }, { $set: next })
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, antes: { name: campaign.name, rigor: campaign.rigor }, depois: next })
    await changed(campaign._id)
    return getCampaignDetail(campaignId, userId)
}

// ── Convite por link ───────────────────────────────────────────────────────────

/** Link atual (só o dono). Campanha sem token ganha um na primeira consulta. */
export async function getInviteLink(campaignId: string, userId: string): Promise<MaddoxInviteLinkDto> {
    const { campaign } = await loadAsOwner(campaignId, userId)
    const withToken = await MaddoxCampaignModel.findById(campaign._id).select("+invite.token invite.rotatedAt").lean<CampaignDoc>()
    if (withToken?.invite?.token) return { token: withToken.invite.token, rotatedAt: iso(withToken.invite.rotatedAt) }
    return rotate(campaign._id, userId, false)
}

/** Gera outro link: o anterior deixa de funcionar na hora. */
export async function rotateInvite(campaignId: string, userId: string): Promise<MaddoxInviteLinkDto> {
    const { campaign } = await loadAsOwner(campaignId, userId)
    return rotate(campaign._id, userId, true)
}

async function rotate(campaignId: Types.ObjectId, userId: string, audit: boolean): Promise<MaddoxInviteLinkDto> {
    const token = newToken()
    const rotatedAt = new Date()
    await MaddoxCampaignModel.updateOne({ _id: campaignId }, { $set: { "invite.token": token, "invite.rotatedAt": rotatedAt } })
    if (audit) await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaignId), acao: AcaoAuditoria.ATUALIZAR, depois: { invite: "novo link gerado" } })
    return { token, rotatedAt: rotatedAt.toISOString() }
}

async function campaignByToken(token: string): Promise<CampaignDoc> {
    if (!TOKEN_PATTERN.test(token)) throw new DomainError(404, INVITE_NOT_FOUND, "INVITE_NOT_FOUND")
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findOne({ "invite.token": token }).lean<CampaignDoc>()
    if (!campaign) throw new DomainError(404, INVITE_NOT_FOUND, "INVITE_NOT_FOUND")
    return campaign
}

/** Resumo mostrado a quem abre o link, antes de entrar. */
export async function previewInvite(token: string, userId: string): Promise<MaddoxInvitePreviewDto> {
    const campaign = await campaignByToken(token)
    const [members, users] = await Promise.all([memberUserIds(campaign._id), loadUsers([campaign.ownerId])])
    return {
        campaignId: String(campaign._id),
        name: campaign.name,
        rigor: campaign.rigor,
        status: campaign.status,
        coverUrl: campaign.coverUrl ?? null,
        ownerName: users.get(campaign.ownerId)?.name ?? "Usuário",
        memberCount: members.length,
        alreadyMember: members.includes(userId),
        inviteOpen: inviteOpen(campaign.status),
    }
}

/**
 * Entra pelo link. Idempotente para quem já é membro; quem saiu volta; removido pelo dono recebe 403.
 * Campanha encerrada/arquivada não aceita ninguém (409). Entradas simultâneas são resolvidas pelo
 * índice único `{ campaignId, userId }`.
 */
export async function joinByInvite(token: string, userId: string): Promise<{ campaignId: string }> {
    const campaign = await campaignByToken(token)
    if (!inviteOpen(campaign.status)) throw new DomainError(409, "Esta campanha não aceita novos jogadores.", "INVITE_CLOSED")
    const campaignId = String(campaign._id)
    const existing = await MaddoxCampaignMemberModel.findOne({ campaignId: campaign._id, userId }).lean<MemberDoc>()
    if (existing?.status === "joined") return { campaignId }
    if (existing?.status === "removed") throw new DomainError(403, "Você foi removido desta campanha pelo dono e não pode entrar de novo pelo link.", "MEMBER_REMOVED")

    if (existing) {
        await MaddoxCampaignMemberModel.updateOne({ _id: existing._id, status: existing.status }, { $set: { status: "joined", joinedAt: new Date(), invitedBy: campaign.ownerId } })
    } else {
        try {
            await MaddoxCampaignMemberModel.create({ campaignId: campaign._id, userId, role: "player", status: "joined", invitedBy: campaign.ownerId, joinedAt: new Date() })
        } catch (error) {
            if (!isDuplicateKey(error)) throw error
            const raced = await MaddoxCampaignMemberModel.findOne({ campaignId: campaign._id, userId }).lean<MemberDoc>()
            if (raced?.status !== "joined") throw new DomainError(409, "Não foi possível entrar na campanha agora. Tente de novo.", "JOIN_CONFLICT")
            return { campaignId }
        }
    }
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATRIBUIR, depois: { member: userId, status: "joined", via: "link" } })
    await changed(campaign._id)
    return { campaignId }
}

// ── Membros ────────────────────────────────────────────────────────────────────

/** O próprio membro sai (o dono não pode); o dono remove um jogador (que não volta pelo link). */
export async function removeMember(campaignId: string, memberId: string, userId: string): Promise<{ left: boolean }> {
    const { campaign } = await loadMembership(campaignId, userId)
    const target = await MaddoxCampaignMemberModel.findOne({ _id: objectId(memberId, "Jogador não encontrado"), campaignId: campaign._id, status: "joined" }).lean<MemberDoc>()
    if (!target) throw new DomainError(404, "Jogador não encontrado", "NOT_FOUND")
    const self = target.userId === userId
    if (target.role === "owner") throw new DomainError(409, self ? "O dono não pode sair da própria campanha." : "O dono não pode ser removido.", "OWNER_LOCKED")
    if (!self && campaign.ownerId !== userId) throw new DomainError(403, "Só o dono da campanha pode remover jogadores.", "FORBIDDEN")
    const status = self ? "left" : "removed"
    await MaddoxCampaignMemberModel.updateOne({ _id: target._id, status: "joined" }, { $set: { status } })
    await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: self ? AcaoAuditoria.ATUALIZAR : AcaoAuditoria.EXCLUIR, antes: { member: target.userId, status: "joined" }, depois: { member: target.userId, status } })
    await changed(campaign._id, [target.userId])
    if (campaign.status === "active") {
        // Sob demanda: `game` importa este módulo. Quem sai deixa de contar no turno dos jogadores. A saída já
        // foi gravada, auditada e avisada: uma falha ao reavaliar o turno não a desfaz (o `check` refaz depois).
        try {
            const { onMemberLeftGame } = await import("./game")
            await onMemberLeftGame(campaign._id, target._id)
        } catch (error) {
            log.warn({ err: error, campaignId: String(campaign._id), memberId: String(target._id) }, "[maddox] Falha ao reavaliar o turno após a saída do membro")
        }
    }
    return { left: self }
}

// ── Personagem (esboço) ────────────────────────────────────────────────────────

/**
 * Esboço do MEU personagem: nome e retrato. A entrevista de personagem (Maddox 2) completa o perfil;
 * aqui ela fica `pending`. Regravar atualiza o mesmo personagem (nome e retrato seguem editáveis).
 */
export async function upsertCharacterDraft(campaignId: string, input: MaddoxCharacterDraftInput, userId: string): Promise<MaddoxCampaignDetailDto> {
    const { campaign, member } = await loadMembership(campaignId, userId)
    if (!member) throw new DomainError(404, NOT_FOUND, "NOT_FOUND")
    if (!inviteOpen(campaign.status)) throw new DomainError(409, "A campanha foi encerrada: os personagens não podem mais ser alterados.", "CAMPAIGN_CLOSED")
    const portraitUrl = input.portraitUrl ? input.portraitUrl : null
    const current = member.characterId ? await MaddoxCharacterModel.findOne({ _id: member.characterId, userId }).lean<CharacterDoc>() : null

    if (current) {
        await MaddoxCharacterModel.updateOne({ _id: current._id }, { $set: { name: input.name, portraitUrl } })
        // Ficha D&D criada pela entrevista acompanha o nome e o retrato (retrato removido não apaga a foto da ficha).
        if (current.sheetId) {
            const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
            await CharacterSheet.updateOne({ _id: current.sheetId, userId }, { $set: { name: input.name, ...(portraitUrl ? { photo: portraitUrl } : {}) } })
        }
        await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.ATUALIZAR, antes: { character: current.name }, depois: { character: input.name } })
    } else {
        const created = await MaddoxCharacterModel.create({ campaignId: campaign._id, memberId: member._id, userId, name: input.name, portraitUrl, interview: { status: "pending", scriptVersion: null } })
        const linked = await MaddoxCampaignMemberModel.updateOne({ _id: member._id, characterId: null }, { $set: { characterId: created._id } })
        if (linked.modifiedCount === 0) {
            // Outra requisição criou o personagem antes: descarta este e atualiza o vencedor.
            await MaddoxCharacterModel.deleteOne({ _id: created._id })
            const winner = await MaddoxCampaignMemberModel.findById(member._id).select("characterId").lean<{ characterId: Types.ObjectId | null }>()
            if (winner?.characterId) await MaddoxCharacterModel.updateOne({ _id: winner.characterId, userId }, { $set: { name: input.name, portraitUrl } })
        } else {
            await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaign._id), acao: AcaoAuditoria.CRIAR, depois: { character: input.name } })
        }
    }
    await changed(campaign._id)
    return getCampaignDetail(campaignId, userId)
}
