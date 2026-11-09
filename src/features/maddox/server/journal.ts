import { Types } from "mongoose"
import type { ZodType } from "zod"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import type { CampaignMemoryView } from "@/features/engramind/campaign-memory-format"
import { loggerFor } from "@/lib/logger"
import { User } from "@/features/users/models/user"
import { MADDOX_CAMPAIGN_MEMORY_KINDS, type MaddoxCampaignMemoryKind, type MaddoxCampaignStateField } from "../constants"
import type { MaddoxSceneImagesSettings } from "../schemas"
import { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCharacterModel, MaddoxNpcModel, MaddoxSceneImageModel, type IMaddoxCharacter, type IMaddoxNpc, type IMaddoxSceneImage } from "../models"
import { accentInsensitivePattern, excerptAround } from "../journal-search"
import { hiddenPlayerActionsFilter } from "../player-actions-visibility"
import { maddoxJournalImagesSchema, maddoxJournalMemoriesSchema, maddoxJournalNpcsSchema, maddoxJournalSearchSchema, type MaddoxJournalImageKind } from "../journal-schemas"
import type {
    MaddoxJournalImageDto,
    MaddoxJournalMemoryDto,
    MaddoxJournalNpcDto,
    MaddoxJournalPageDto,
    MaddoxJournalPartyMemberDto,
    MaddoxJournalSearchDto,
    MaddoxJournalSearchGroup,
    MaddoxJournalSearchImageHit,
    MaddoxJournalSearchMessageHit,
    MaddoxJournalStateDto,
    MaddoxJournalSummaryDto,
} from "../journal-types"
import { loadMembership } from "./campaigns"
import { isOpexUserId } from "./opex-members"
import { MADDOX_OPEX_LABEL } from "../constants"

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
const NPC_FIELDS = "name portraitUrl status publicDescription updatedAt opex.active"

export const MADDOX_JOURNAL_PAGE_SIZE = 30
export const MADDOX_JOURNAL_SEARCH_LIMIT = 20
const MADDOX_JOURNAL_SEARCHABLE_MESSAGES = ["narration", "declaration", "question", "answer"] as const

type NpcDoc = Pick<IMaddoxNpc, "_id" | "name" | "portraitUrl" | "status" | "publicDescription" | "updatedAt" | "opex">
type MemoryDoc = Pick<CampaignMemoryView, "id" | "kind" | "title" | "text" | "tags" | "status" | "turnNumber" | "updatedAt">

/**
 * Memórias da campanha (anotações do Diário): só no Engramind, SEMPRE só o canal dos jogadores (o do mestre
 * nunca é lido aqui), com o token de app. Import sob demanda (a camada da rede fica fora do caminho quente).
 */
const campaignMemories = () => import("@/features/engramind/server/campaign-memories")

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
    return { id: String(npc._id), name: npc.name, portraitUrl: npc.portraitUrl ?? null, status: npc.status ?? "active", publicDescription: npc.publicDescription ?? "", updatedAt: iso(npc.updatedAt), ...(npc.opex?.active ? { opex: true } : {}) }
}

function memoryDto(memory: MemoryDoc): MaddoxJournalMemoryDto {
    return {
        id: memory.id,
        kind: memory.kind,
        title: memory.title,
        text: memory.text ?? "",
        tags: memory.tags ?? [],
        status: memory.kind === "missao" ? (memory.status ?? "ativa") : null,
        turnNumber: memory.turnNumber ?? null,
        updatedAt: memory.updatedAt,
    }
}

/**
 * Só os campos que o Maddox regravou desde que o estado passou a ser público (`publicFields`, Maddox 9); o que foi gravado
 * antes era rascunho interno do mestre e pode ter segredo, então fica vazio até ser regravado.
 */
function stateDto(state: (Partial<MaddoxJournalStateDto> & { publicFields?: readonly string[] | null }) | null | undefined): MaddoxJournalStateDto {
    const visible = new Set(state?.publicFields ?? [])
    const field = (key: MaddoxCampaignStateField) => (visible.has(key) ? (state?.[key] ?? "") : "")
    return { scene: field("scene"), location: field("location"), situation: field("situation"), pendingDecision: field("pendingDecision"), updatedTurn: visible.size ? (state?.updatedTurn ?? null) : null }
}

function page<T extends { _id: Types.ObjectId }, D>(docs: T[], map: (doc: T) => D): MaddoxJournalPageDto<D> {
    const hasMore = docs.length > MADDOX_JOURNAL_PAGE_SIZE
    const items = docs.slice(0, MADDOX_JOURNAL_PAGE_SIZE)
    return { items: items.map(map), nextCursor: hasMore ? String(items.at(-1)!._id) : null }
}

// ── Resumo ─────────────────────────────────────────────────────────────────────

export async function getJournalSummary(campaignId: string, userId: string): Promise<MaddoxJournalSummaryDto> {
    const { campaign, member } = await loadJournalMembership(campaignId, userId)
    const memoryPart = campaignMemories()
        .then(async (service) => {
            const id = String(campaign._id)
            const [counts, quests] = await Promise.all([service.countPlayerMemories(id), service.activeQuests(id, "players", "app", 10)])
            return { counts, quests, unavailable: false }
        })
        .catch((error: unknown) => {
            log.warn({ campaignId, err: error instanceof Error ? error.message : String(error) }, "[maddox] anotações do Diário indisponíveis")
            return { counts: null, quests: [] as MemoryDoc[], unavailable: true }
        })
    const [npcs, party, memoryState, avatarUrl, images] = await Promise.all([
        MaddoxNpcModel.countDocuments({ campaignId: campaign._id, ...PLAYER_VISIBLE }),
        MaddoxCampaignMemberModel.countDocuments({ campaignId: campaign._id, status: "joined", characterId: { $ne: null } }),
        memoryPart,
        maddoxAvatarUrl(),
        visibleImagesFilter(campaign._id, "todas").then((filter) => MaddoxSceneImageModel.countDocuments(filter)),
    ])
    const memories = Object.fromEntries(MADDOX_CAMPAIGN_MEMORY_KINDS.map((kind) => [kind, memoryState.counts?.[kind] ?? 0])) as Record<MaddoxCampaignMemoryKind, number>
    const activeQuests = memoryState.quests
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
        counts: { npcs, party, images, memories },
        memoriesUnavailable: memoryState.unavailable,
        canManageOpexNpcs: await (await import("./opex-npcs")).canManageOpexNpcsAs(campaign.ownerId, userId),
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
    // Da alteração mais recente (a ordem da rede), com o cursor da rede; situação da missão pela tag `status:`.
    const { listCampaignMemories } = await campaignMemories()
    const result = await listCampaignMemories(String(campaign._id), { scope: "players", reader: "app", kind: query.kind, status: query.status, limit: MADDOX_JOURNAL_PAGE_SIZE, cursor: query.cursor })
    return { items: result.items.map(memoryDto), nextCursor: result.nextCursor }
}

type PartyCharacter = Pick<IMaddoxCharacter, "_id" | "name" | "portraitUrl" | "profile" | "currentState" | "currentStatePublic">

async function partyMembers(campaignId: Types.ObjectId): Promise<MaddoxJournalPartyMemberDto[]> {
    const members = await MaddoxCampaignMemberModel.find({ campaignId, status: "joined", characterId: { $ne: null } })
        .sort({ joinedAt: 1, createdAt: 1 })
        .select("userId characterId")
        .lean<{ _id: Types.ObjectId; userId: string; characterId: Types.ObjectId }[]>()
    if (members.length === 0) return []
    const userIds = members.map((member) => member.userId).filter((id) => Types.ObjectId.isValid(id))
    const [characters, users] = await Promise.all([
        MaddoxCharacterModel.find({ _id: { $in: members.map((member) => member.characterId) } })
            .select("name portraitUrl profile currentState currentStatePublic")
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
                playerName: isOpexUserId(member.userId) ? MADDOX_OPEX_LABEL : (names.get(member.userId) ?? "Usuário"),
                ...(isOpexUserId(member.userId) ? { opex: true } : {}),
                characterId: String(character._id),
                characterName: character.name,
                portraitUrl: character.portraitUrl ?? null,
                profile,
                // Condição antiga (antes do Maddox 9, rascunho interno do mestre) só aparece depois de regravada.
                currentState: character.currentStatePublic ? (character.currentState ?? "") : "",
            },
        ]
    })
}

/** Personagens do grupo: perfil da entrevista e condição atual (a ficha D&D de cada um continua só do dono dela). */
// ── Imagens (DND-22) ───────────────────────────────────────────────────────────

/** Origens das imagens de cena (as que ficam numa mensagem da mesa); o retrato é `npc-portrait`. */
const SCENE_IMAGE_SOURCES = ["tool", "combat-end", "manual"] as const
type ImageDoc = Pick<IMaddoxSceneImage, "_id" | "url" | "caption" | "situation" | "source" | "turnNumber" | "messageId" | "npcId" | "createdAt">
const IMAGE_FIELDS = "url caption situation source turnNumber messageId npcId createdAt"

/**
 * Imagens prontas que os jogadores veem: as cenas (as mensagens da mesa são públicas) e os retratos só de NPCs públicos —
 * o retrato de um NPC secreto, ou que voltou a ser secreto, não aparece.
 */
async function visibleImagesFilter(campaignId: Types.ObjectId, kind: MaddoxJournalImageKind): Promise<Record<string, unknown>> {
    const base = { campaignId, status: "done", url: { $nin: [null, ""] } }
    const scenes = { source: { $in: SCENE_IMAGE_SOURCES } }
    if (kind === "cenas") return { ...base, ...scenes }
    const publicNpcIds = await MaddoxNpcModel.find({ campaignId, ...PLAYER_VISIBLE }).distinct("_id")
    const portraits = { source: "npc-portrait", npcId: { $in: publicNpcIds } }
    return kind === "retratos" ? { ...base, ...portraits } : { ...base, $or: [scenes, portraits] }
}

async function sceneImageSettings(): Promise<MaddoxSceneImagesSettings | null> {
    try {
        const { loadMaddoxSettings } = await import("./settings")
        return (await loadMaddoxSettings()).settings.sceneImages ?? null
    } catch (error) {
        log.warn({ err: error }, "[maddox] Falha ao carregar as situações das imagens para o diário")
        return null
    }
}

async function npcNames(campaignId: Types.ObjectId, images: readonly ImageDoc[]): Promise<Map<string, string>> {
    const ids = [...new Set(images.filter((image) => image.npcId).map((image) => String(image.npcId)))]
    if (!ids.length) return new Map()
    const npcs = await MaddoxNpcModel.find({ campaignId, ...PLAYER_VISIBLE, _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
        .select("name")
        .lean<{ _id: Types.ObjectId; name: string }[]>()
    return new Map(npcs.map((npc) => [String(npc._id), npc.name]))
}

/** Imagens prontas da campanha, da mais recente para a mais antiga (cursor = `_id`), com filtro cenas/retratos. */
export async function listJournalImages(campaignId: string, input: unknown, userId: string): Promise<MaddoxJournalPageDto<MaddoxJournalImageDto>> {
    const query = parse(maddoxJournalImagesSchema, input)
    const campaign = await loadJournalCampaign(campaignId, userId)
    const filter = await visibleImagesFilter(campaign._id, query.kind ?? "todas")
    const docs = await MaddoxSceneImageModel.find({ ...filter, ...cursorFilter(query.cursor) })
        .sort({ _id: -1 })
        .limit(MADDOX_JOURNAL_PAGE_SIZE + 1)
        .select(IMAGE_FIELDS)
        .lean<ImageDoc[]>()
    const [settings, names] = await Promise.all([docs.length ? sceneImageSettings() : Promise.resolve(null), npcNames(campaign._id, docs)])
    const { situationLabel } = await import("./scene-images")
    return page(docs, (image) => ({
        id: String(image._id),
        url: image.url ?? "",
        caption: image.caption ?? "",
        situationLabel: situationLabel(settings, image.situation),
        source: image.source,
        turnNumber: image.turnNumber ?? 0,
        messageId: image.messageId ? String(image.messageId) : null,
        npc: image.npcId && names.has(String(image.npcId)) ? { id: String(image.npcId), name: names.get(String(image.npcId))! } : null,
        createdAt: iso(image.createdAt),
    }))
}

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
 * descrição pública), memórias públicas (título, texto e tags), falas da mesa, personagens do grupo, situação atual e a
 * legenda das imagens (DND-22).
 */
export async function searchJournal(campaignId: string, input: unknown, userId: string): Promise<MaddoxJournalSearchDto> {
    const { q } = parse(maddoxJournalSearchSchema, input)
    const { campaign, member } = await loadJournalMembership(campaignId, userId)
    // Declarações dos outros ocultas no chat (DND-36): o texto delas também não entra na busca.
    const hiddenActions = campaign.hidePlayerActions ? hiddenPlayerActionsFilter(member._id) : {}
    const pattern = accentInsensitivePattern(q)
    const match = { $regex: pattern, $options: "i" }
    const regex = new RegExp(pattern, "i")
    const take = MADDOX_JOURNAL_SEARCH_LIMIT + 1

    const [npcs, memoryHits, messages, party, images] = await Promise.all([
        MaddoxNpcModel.find({ campaignId: campaign._id, ...PLAYER_VISIBLE, $or: [{ name: match }, { publicDescription: match }] })
            .sort({ name: 1 })
            .limit(take)
            .select(NPC_FIELDS)
            .lean<NpcDoc[]>(),
        campaignMemories()
            .then(({ searchCampaignMemories }) => searchCampaignMemories(String(campaign._id), { query: q, scope: "players", reader: "app", limit: take }))
            .then((items): { items: MemoryDoc[]; unavailable: boolean } => ({ items, unavailable: false }))
            .catch((): { items: MemoryDoc[]; unavailable: boolean } => ({ items: [], unavailable: true })),
        MaddoxCampaignMessageModel.find({ campaignId: campaign._id, kind: { $in: MADDOX_JOURNAL_SEARCHABLE_MESSAGES }, error: null, content: match, ...hiddenActions })
            .sort({ _id: -1 })
            .limit(take)
            .select("kind turnNumber characterName content createdAt")
            .lean<{ _id: Types.ObjectId; kind: MaddoxJournalSearchMessageHit["kind"]; turnNumber: number; characterName: string | null; content: string; createdAt: Date }[]>(),
        partyMembers(campaign._id),
        visibleImagesFilter(campaign._id, "todas").then((filter) =>
            MaddoxSceneImageModel.find({ ...filter, caption: match })
                .sort({ _id: -1 })
                .limit(take)
                .select(IMAGE_FIELDS)
                .lean<ImageDoc[]>(),
        ),
    ])
    const memories = memoryHits.items
    const imageNpcNames = await npcNames(campaign._id, images)
    const imageHits: MaddoxJournalSearchImageHit[] = images.map((image) => ({
        id: String(image._id),
        url: image.url ?? "",
        turnNumber: image.turnNumber ?? 0,
        npcName: image.npcId ? (imageNpcNames.get(String(image.npcId)) ?? null) : null,
        excerpt: excerptAround(image.caption ?? "", q),
    }))

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
                return { id: memory.id, kind: memory.kind, title: memory.title, status: memory.kind === "missao" ? (memory.status ?? "ativa") : null, excerpt: excerptAround(source ?? "", q) }
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
        images: group(imageHits),
        state: stateHit ? { excerpt: excerptAround(stateHit, q) } : null,
        memoriesUnavailable: memoryHits.unavailable,
    }
}
