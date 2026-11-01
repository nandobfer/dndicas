import { Types } from "mongoose"
import type { ZodType } from "zod"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { User } from "@/features/users/models/user"
import { MADDOX_CAMPAIGN_MEMORY_KINDS, type MaddoxCampaignMemoryKind } from "../constants"
import { MaddoxCampaignMemberModel, MaddoxCampaignMemoryModel, MaddoxCampaignMessageModel, MaddoxCharacterModel, MaddoxNpcModel, type IMaddoxCampaignMemory, type IMaddoxCharacter, type IMaddoxNpc } from "../models"
import { accentInsensitivePattern, excerptAround } from "../journal-search"
import { maddoxJournalMemoriesSchema, maddoxJournalNpcsSchema, maddoxJournalSearchSchema } from "../journal-schemas"
import type {
    MaddoxJournalMemoryDto,
    MaddoxJournalNpcDto,
    MaddoxJournalPageDto,
    MaddoxJournalPartyMemberDto,
    MaddoxJournalSearchDto,
    MaddoxJournalSearchGroup,
    MaddoxJournalSearchMessageHit,
    MaddoxJournalStateDto,
    MaddoxJournalSummaryDto,
} from "../journal-types"
import { loadMembership } from "./campaigns"

/**
 * Diário da campanha (Maddox 9): o que os jogadores sabem — histórico da mesa, NPCs, locais, missões, anotações,
 * situação atual e o grupo — e a busca por texto em tudo isso.
 *
 * Regra central: o que é só do mestre nunca sai daqui. Toda consulta de NPC e memória leva `PLAYER_VISIBLE` junto
 * do `campaignId`, os campos lidos são escolhidos (`select`) e os DTOs são montados campo a campo — `masterNotes`
 * nunca é lido nem buscado.
 */

const log = loggerFor({ module: "maddox", feature: "journal" })

const PLAYER_VISIBLE = { visibility: "players" } as const
const NPC_FIELDS = "name portraitUrl status publicDescription updatedAt"
const MEMORY_FIELDS = "kind title text tags status turnNumber updatedAt"

const ACTIVE_QUEST = { $in: ["ativa", null] }

export const MADDOX_JOURNAL_PAGE_SIZE = 30
export const MADDOX_JOURNAL_SEARCH_LIMIT = 20
const MADDOX_JOURNAL_SEARCHABLE_MESSAGES = ["narration", "declaration", "question", "answer"] as const

type NpcDoc = Pick<IMaddoxNpc, "_id" | "name" | "portraitUrl" | "status" | "publicDescription" | "updatedAt">
type MemoryDoc = Pick<IMaddoxCampaignMemory, "_id" | "kind" | "title" | "text" | "tags" | "status" | "turnNumber" | "updatedAt">

function parse<T>(schema: ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input)
    if (!parsed.success) throw new DomainError(400, parsed.error.issues[0]?.message ?? "Parâmetros inválidos", "VALIDATION_ERROR")
    return parsed.data
}

/** Só membros ativos consultam o diário (quem saiu ou nunca entrou = 404). */
async function loadJournalMembership(campaignId: string, userId: string) {
    const { campaign, member } = await loadMembership(campaignId, userId)
    if (!member) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    await dbConnect()
    return { campaign, member }
}

const loadJournalCampaign = async (campaignId: string, userId: string) => (await loadJournalMembership(campaignId, userId)).campaign

async function maddoxAvatarUrl(): Promise<string | null> {
    try {
        const { loadMaddoxSettings } = await import("./settings")
        const { settings } = await loadMaddoxSettings()
        return settings.avatar?.url ?? null
    } catch (error) {
        log.warn({ err: error }, "[maddox] Falha ao carregar o avatar do Maddox para o diário")
        return null
    }
}

const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : new Date(0).toISOString())

function npcDto(npc: NpcDoc): MaddoxJournalNpcDto {
    return { id: String(npc._id), name: npc.name, portraitUrl: npc.portraitUrl ?? null, status: npc.status ?? "active", publicDescription: npc.publicDescription ?? "", updatedAt: iso(npc.updatedAt) }
}

function memoryDto(memory: MemoryDoc): MaddoxJournalMemoryDto {
    return {
        id: String(memory._id),
        kind: memory.kind,
        title: memory.title,
        text: memory.text ?? "",
        tags: memory.tags ?? [],
        status: memory.kind === "missao" ? (memory.status ?? "ativa") : null,
        turnNumber: memory.turnNumber ?? null,
        updatedAt: iso(memory.updatedAt),
    }
}

function stateDto(state: Partial<MaddoxJournalStateDto> | null | undefined): MaddoxJournalStateDto {
    return { scene: state?.scene ?? "", location: state?.location ?? "", situation: state?.situation ?? "", pendingDecision: state?.pendingDecision ?? "", updatedTurn: state?.updatedTurn ?? null }
}

function page<T extends { _id: Types.ObjectId }, D>(docs: T[], map: (doc: T) => D): MaddoxJournalPageDto<D> {
    const hasMore = docs.length > MADDOX_JOURNAL_PAGE_SIZE
    const items = docs.slice(0, MADDOX_JOURNAL_PAGE_SIZE)
    return { items: items.map(map), nextCursor: hasMore ? String(items.at(-1)!._id) : null }
}

// ── Resumo ─────────────────────────────────────────────────────────────────────

export async function getJournalSummary(campaignId: string, userId: string): Promise<MaddoxJournalSummaryDto> {
    const { campaign, member } = await loadJournalMembership(campaignId, userId)
    const [npcs, party, byKind, activeQuests, avatarUrl] = await Promise.all([
        MaddoxNpcModel.countDocuments({ campaignId: campaign._id, ...PLAYER_VISIBLE }),
        MaddoxCampaignMemberModel.countDocuments({ campaignId: campaign._id, status: "joined", characterId: { $ne: null } }),
        MaddoxCampaignMemoryModel.aggregate<{ _id: MaddoxCampaignMemoryKind; count: number }>([{ $match: { campaignId: campaign._id, ...PLAYER_VISIBLE } }, { $group: { _id: "$kind", count: { $sum: 1 } } }]),
        MaddoxCampaignMemoryModel.find({ campaignId: campaign._id, ...PLAYER_VISIBLE, kind: "missao", status: ACTIVE_QUEST } as Record<string, unknown>)
            .sort({ updatedAt: -1 })
            .limit(10)
            .select(MEMORY_FIELDS)
            .lean<MemoryDoc[]>(),
        maddoxAvatarUrl(),
    ])
    const memories = Object.fromEntries(MADDOX_CAMPAIGN_MEMORY_KINDS.map((kind) => [kind, 0])) as Record<MaddoxCampaignMemoryKind, number>
    for (const item of byKind) if (item._id in memories) memories[item._id] = item.count
    return {
        campaignId: String(campaign._id),
        name: campaign.name,
        rigor: campaign.rigor,
        status: campaign.status,
        turnNumber: campaign.turn?.number ?? 0,
        myMemberId: String(member._id),
        maddoxAvatarUrl: avatarUrl,
        setting: campaign.setting ?? "",
        openingSituation: campaign.openingSituation ?? "",
        state: stateDto(campaign.state),
        activeQuests: activeQuests.map(memoryDto),
        counts: { npcs, party, memories },
    }
}

// ── Listas ─────────────────────────────────────────────────────────────────────

const cursorFilter = (cursor: string | undefined) => (cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {})

/** NPCs que os jogadores conhecem, do mais recente para o mais antigo (cursor = `_id`). */
export async function listJournalNpcs(campaignId: string, input: unknown, userId: string): Promise<MaddoxJournalPageDto<MaddoxJournalNpcDto>> {
    const query = parse(maddoxJournalNpcsSchema, input)
    const campaign = await loadJournalCampaign(campaignId, userId)
    const docs = await MaddoxNpcModel.find({ campaignId: campaign._id, ...PLAYER_VISIBLE, ...cursorFilter(query.cursor) })
        .sort({ _id: -1 })
        .limit(MADDOX_JOURNAL_PAGE_SIZE + 1)
        .select(NPC_FIELDS)
        .lean<NpcDoc[]>()
    return page(docs, npcDto)
}

/** Memórias públicas de um tipo (locais, missões, eventos…), da mais recente para a mais antiga. */
export async function listJournalMemories(campaignId: string, input: unknown, userId: string): Promise<MaddoxJournalPageDto<MaddoxJournalMemoryDto>> {
    const query = parse(maddoxJournalMemoriesSchema, input)
    const campaign = await loadJournalCampaign(campaignId, userId)
    // Missão sem situação gravada conta como ativa (a gravação do Maddox já nasce `ativa`).
    const status = query.kind === "missao" && query.status ? { status: query.status === "ativa" ? ACTIVE_QUEST : query.status } : {}
    const filter: Record<string, unknown> = { campaignId: campaign._id, ...PLAYER_VISIBLE, kind: query.kind, ...status, ...cursorFilter(query.cursor) }
    const docs = await MaddoxCampaignMemoryModel.find(filter)
        .sort({ _id: -1 })
        .limit(MADDOX_JOURNAL_PAGE_SIZE + 1)
        .select(MEMORY_FIELDS)
        .lean<MemoryDoc[]>()
    return page(docs, memoryDto)
}

type PartyCharacter = Pick<IMaddoxCharacter, "_id" | "name" | "portraitUrl" | "profile" | "currentState">

async function partyMembers(campaignId: Types.ObjectId): Promise<MaddoxJournalPartyMemberDto[]> {
    const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined", characterId: { $ne: null } })
        .sort({ joinedAt: 1, createdAt: 1 })
        .select("userId characterId")
        .lean<{ _id: Types.ObjectId; userId: string; characterId: Types.ObjectId }[]>()
    if (members.length === 0) return []
    const userIds = members.map((member) => member.userId).filter((id) => Types.ObjectId.isValid(id))
    const [characters, users] = await Promise.all([
        MaddoxCharacterModel.find({ _id: { $in: members.map((member) => member.characterId) } })
            .select("name portraitUrl profile currentState")
            .lean<PartyCharacter[]>(),
        userIds.length ? User.find({ _id: { $in: userIds } }).select("name username").lean<{ _id: Types.ObjectId; name?: string; username?: string }[]>() : Promise.resolve([]),
    ])
    const byId = new Map(characters.map((character) => [String(character._id), character]))
    const names = new Map(users.map((user) => [String(user._id), user.name?.trim() || user.username || "Usuário"]))
    return members.flatMap((member) => {
        const character = byId.get(String(member.characterId))
        if (!character) return []
        const profile = character.profile instanceof Map ? Object.fromEntries(character.profile) : { ...(character.profile ?? {}) }
        return [
            {
                memberId: String(member._id),
                playerName: names.get(member.userId) ?? "Usuário",
                characterId: String(character._id),
                characterName: character.name,
                portraitUrl: character.portraitUrl ?? null,
                profile,
                currentState: character.currentState ?? "",
            },
        ]
    })
}

/** Personagens do grupo: perfil da entrevista e condição atual (a ficha D&D de cada um continua só do dono dela). */
export async function listJournalParty(campaignId: string, userId: string): Promise<MaddoxJournalPartyMemberDto[]> {
    const campaign = await loadJournalCampaign(campaignId, userId)
    return partyMembers(campaign._id)
}

// ── Busca ──────────────────────────────────────────────────────────────────────

function group<T>(items: T[]): MaddoxJournalSearchGroup<T> {
    return { items: items.slice(0, MADDOX_JOURNAL_SEARCH_LIMIT), hasMore: items.length > MADDOX_JOURNAL_SEARCH_LIMIT }
}

/**
 * Busca por texto (sem acento e sem caixa, também por pedaço de palavra) no que os jogadores sabem: NPCs (nome e
 * descrição pública), memórias públicas (título, texto e tags), falas da mesa, personagens do grupo e situação atual.
 */
export async function searchJournal(campaignId: string, input: unknown, userId: string): Promise<MaddoxJournalSearchDto> {
    const { q } = parse(maddoxJournalSearchSchema, input)
    const campaign = await loadJournalCampaign(campaignId, userId)
    const pattern = accentInsensitivePattern(q)
    const match = { $regex: pattern, $options: "i" }
    const regex = new RegExp(pattern, "i")
    const take = MADDOX_JOURNAL_SEARCH_LIMIT + 1

    const [npcs, memories, messages, party] = await Promise.all([
        MaddoxNpcModel.find({ campaignId: campaign._id, ...PLAYER_VISIBLE, $or: [{ name: match }, { publicDescription: match }] })
            .sort({ name: 1 })
            .limit(take)
            .select(NPC_FIELDS)
            .lean<NpcDoc[]>(),
        MaddoxCampaignMemoryModel.find({ campaignId: campaign._id, ...PLAYER_VISIBLE, $or: [{ title: match }, { text: match }, { tags: match }] })
            .sort({ updatedAt: -1 })
            .limit(take)
            .select(MEMORY_FIELDS)
            .lean<MemoryDoc[]>(),
        MaddoxCampaignMessageModel.find({ campaignId: campaign._id, kind: { $in: MADDOX_JOURNAL_SEARCHABLE_MESSAGES }, error: null, content: match })
            .sort({ _id: -1 })
            .limit(take)
            .select("kind turnNumber characterName content createdAt")
            .lean<{ _id: Types.ObjectId; kind: MaddoxJournalSearchMessageHit["kind"]; turnNumber: number; characterName: string | null; content: string; createdAt: Date }[]>(),
        partyMembers(campaign._id),
    ])

    const partyHits = party.flatMap((member) => {
        const texts = [member.characterName, member.currentState, ...Object.values(member.profile)]
        const hit = texts.find((text) => regex.test(text))
        return hit === undefined ? [] : [{ memberId: member.memberId, characterName: member.characterName, portraitUrl: member.portraitUrl, excerpt: excerptAround(hit === member.characterName ? member.currentState || hit : hit, q) }]
    })
    const state = stateDto(campaign.state)
    const stateHit = [state.scene, state.location, state.situation, state.pendingDecision].find((text) => text && regex.test(text))

    return {
        query: q,
        npcs: group(
            npcs.map((npc) => ({
                id: String(npc._id),
                name: npc.name,
                portraitUrl: npc.portraitUrl ?? null,
                status: npc.status ?? "active",
                excerpt: excerptAround(regex.test(npc.publicDescription ?? "") ? npc.publicDescription : npc.publicDescription || npc.name, q),
            })),
        ),
        memories: group(
            memories.map((memory) => {
                const source = regex.test(memory.text ?? "") ? memory.text : regex.test(memory.title) ? memory.text || memory.title : (memory.tags ?? []).find((tag) => regex.test(tag)) ?? memory.text
                return { id: String(memory._id), kind: memory.kind, title: memory.title, status: memory.kind === "missao" ? (memory.status ?? "ativa") : null, excerpt: excerptAround(source ?? "", q) }
            }),
        ),
        messages: group(
            messages.map((message) => ({
                id: String(message._id),
                kind: message.kind,
                turnNumber: message.turnNumber,
                characterName: message.kind === "narration" || message.kind === "answer" ? null : (message.characterName ?? null),
                excerpt: excerptAround(message.content, q),
                createdAt: iso(message.createdAt),
            })),
        ),
        party: group(partyHits),
        state: stateHit ? { excerpt: excerptAround(stateHit, q) } : null,
    }
}
