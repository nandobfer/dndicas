import { z } from "zod"
import { Types } from "mongoose"
import type { ToolSet } from "ai"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_MEMORY_KINDS, MADDOX_NPC_STATUSES, MADDOX_QUEST_STATUSES, MADDOX_VISIBILITIES } from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignMemoryModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel, type IMaddoxCampaign, type IMaddoxCampaignMemory, type IMaddoxNpc } from "../models"

/**
 * Ferramentas de persistência do Maddox narrador (Maddox 4) — SOMENTE servidor. Definidas uma vez e expostas de
 * dois jeitos: à AI SDK (`buildMaddoxAiTools`, provedores diretos) e ao MCP do Maddox (`maddox-mcp.ts`, OpenCode).
 * A campanha vem sempre do contexto da geração, nunca do modelo.
 *
 * Textos gerados não invalidam a chamada por tamanho: são cortados no código onde há teto (memória do projeto).
 */

const log = loggerFor({ module: "maddox", feature: "narrator-tools" })

export interface MaddoxToolContext {
    campaignId: Types.ObjectId
    turnNumber: number
}

export interface MaddoxMasterTool {
    name: string
    description: string
    input: z.ZodObject<z.ZodRawShape>
    readOnly: boolean
    execute: (context: MaddoxToolContext, input: never) => Promise<unknown>
}

export class MaddoxToolError extends Error {}

const NAME_MAX = 120
const SHORT_MAX = 2_000
const TEXT_MAX = 8_000
const TAGS_MAX = 12

const clip = (value: string | undefined | null, max: number) => {
    const text = (value ?? "").trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
const preview = (value: string, max = 200) => clip(value.replace(/\s+/g, " "), max)
const keyOf = (value: string) => normalizeCatalogName(value)

function define<S extends z.ZodRawShape>(def: { name: string; description: string; readOnly: boolean; input: z.ZodObject<S>; execute: (context: MaddoxToolContext, input: z.infer<z.ZodObject<S>>) => Promise<unknown> }): MaddoxMasterTool {
    return def as unknown as MaddoxMasterTool
}

const optionalText = z.string().optional()

const stateShape = (campaign: Pick<IMaddoxCampaign, "state"> | null) => ({
    scene: campaign?.state?.scene ?? "",
    location: campaign?.state?.location ?? "",
    situation: campaign?.state?.situation ?? "",
    pendingDecision: campaign?.state?.pendingDecision ?? "",
    updatedTurn: campaign?.state?.updatedTurn ?? null,
})

const npcDto = (npc: IMaddoxNpc, full: boolean) => ({
    name: npc.name,
    status: npc.status,
    visibility: npc.visibility,
    publicDescription: full ? npc.publicDescription : preview(npc.publicDescription),
    ...(full ? { masterNotes: npc.masterNotes } : {}),
})

const memoryDto = (memory: IMaddoxCampaignMemory) => ({
    kind: memory.kind,
    title: memory.title,
    text: memory.text,
    visibility: memory.visibility,
    tags: memory.tags,
    status: memory.status ?? null,
    turnNumber: memory.turnNumber ?? null,
})

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const MADDOX_MASTER_TOOLS: readonly MaddoxMasterTool[] = [
    define({
        name: "get_campaign_state",
        description: "Lê o estado atual da história (cena, local, situação, decisão aguardada) e a condição atual de cada personagem jogador.",
        readOnly: true,
        input: z.object({}),
        async execute(context) {
            const [campaign, characters] = await Promise.all([
                MaddoxCampaignModel.findById(context.campaignId).select("state").lean<Pick<IMaddoxCampaign, "state">>(),
                MaddoxCharacterModel.find({ campaignId: context.campaignId, status: "active" }).select("name currentState").lean<{ name: string; currentState?: string }[]>(),
            ])
            return { state: stateShape(campaign), characters: characters.map((character) => ({ name: character.name, currentState: character.currentState ?? "" })) }
        },
    }),
    define({
        name: "update_campaign_state",
        description:
            "Atualiza o estado atual da história (checkpoint): cena, local, situação imediata e a decisão aguardada dos jogadores. Envie só os campos que mudaram; use ao fim de cada narração em que a situação mudou.",
        readOnly: false,
        input: z.object({
            scene: optionalText.describe("Cena atual, em uma ou duas frases"),
            location: optionalText.describe("Onde o grupo está"),
            situation: optionalText.describe("Situação imediata: participantes, condição, último acontecimento"),
            pendingDecision: optionalText.describe("Pergunta ou decisão aguardada dos jogadores"),
        }),
        async execute(context, input) {
            const set: Record<string, unknown> = { "state.updatedTurn": context.turnNumber, "state.updatedAt": new Date() }
            for (const field of ["scene", "location", "situation", "pendingDecision"] as const) if (input[field] !== undefined) set[`state.${field}`] = clip(input[field], TEXT_MAX)
            await MaddoxCampaignModel.updateOne({ _id: context.campaignId }, { $set: set }, { timestamps: false })
            const campaign = await MaddoxCampaignModel.findById(context.campaignId).select("state").lean<Pick<IMaddoxCampaign, "state">>()
            return { saved: true, state: stateShape(campaign) }
        },
    }),
    define({
        name: "list_npcs",
        description: "Lista os NPCs da campanha (nome, situação, visibilidade e um resumo da descrição pública).",
        readOnly: true,
        input: z.object({ status: z.enum(MADDOX_NPC_STATUSES).optional().describe("Filtra pela situação") }),
        async execute(context, input) {
            const npcs = await MaddoxNpcModel.find({ campaignId: context.campaignId, ...(input.status ? { status: input.status } : {}) })
                .sort({ updatedAt: -1 })
                .limit(100)
                .lean<IMaddoxNpc[]>()
            return { npcs: npcs.map((npc) => npcDto(npc, false)) }
        },
    }),
    define({
        name: "get_npc",
        description: "Lê um NPC pelo nome, com a descrição pública e as notas exclusivas do mestre.",
        readOnly: true,
        input: z.object({ name: z.string().min(1).describe("Nome do NPC") }),
        async execute(context, input) {
            const npc = await MaddoxNpcModel.findOne({ campaignId: context.campaignId, nameKey: keyOf(input.name) }).lean<IMaddoxNpc>()
            if (!npc) return { found: false, message: `Nenhum NPC chamado "${input.name}" nesta campanha.` }
            return { found: true, npc: npcDto(npc, true) }
        },
    }),
    define({
        name: "save_npc",
        description:
            "Cria ou atualiza um NPC pelo nome (sem duplicar). `publicDescription` é o que os jogadores conhecem; `masterNotes` é segredo do mestre (intenções, segredos, planos). Envie só os campos que mudaram.",
        readOnly: false,
        input: z.object({
            name: z.string().min(1).describe("Nome do NPC"),
            publicDescription: optionalText.describe("Aparência, papel e o que os jogadores sabem"),
            masterNotes: optionalText.describe("Conhecimento exclusivo do mestre"),
            visibility: z.enum(MADDOX_VISIBILITIES).optional().describe("players = os jogadores já conhecem; master = só o mestre"),
            status: z.enum(MADDOX_NPC_STATUSES).optional(),
        }),
        async execute(context, input) {
            const name = clip(input.name, NAME_MAX)
            const nameKey = keyOf(name)
            if (!nameKey) throw new MaddoxToolError("Informe o nome do NPC.")
            const set: Record<string, unknown> = {}
            if (input.publicDescription !== undefined) set.publicDescription = clip(input.publicDescription, TEXT_MAX)
            if (input.masterNotes !== undefined) set.masterNotes = clip(input.masterNotes, TEXT_MAX)
            if (input.visibility) set.visibility = input.visibility
            if (input.status) set.status = input.status
            const existing = await MaddoxNpcModel.findOne({ campaignId: context.campaignId, nameKey }).select("_id").lean()
            if (existing) {
                await MaddoxNpcModel.updateOne({ _id: existing._id }, { $set: { ...set, name } })
                return { saved: true, created: false, name }
            }
            await MaddoxNpcModel.create({ campaignId: context.campaignId, name, nameKey, ...set })
            return { saved: true, created: true, name }
        },
    }),
    define({
        name: "search_memories",
        description:
            "Busca as memórias da campanha: fatos, eventos (marcos da cronologia), locais, missões e relações. Sem `query`, lista as mais recentes do tipo.",
        readOnly: true,
        input: z.object({
            query: optionalText.describe("Palavras do título ou do texto"),
            kind: z.enum(MADDOX_CAMPAIGN_MEMORY_KINDS).optional(),
            limit: z.number().int().min(1).max(50).optional(),
        }),
        async execute(context, input) {
            const query = input.query?.trim()
            const filter = {
                campaignId: context.campaignId,
                ...(input.kind ? { kind: input.kind } : {}),
                ...(query ? { $or: [{ title: { $regex: escapeRegex(query), $options: "i" } }, { text: { $regex: escapeRegex(query), $options: "i" } }, { tags: { $regex: escapeRegex(query), $options: "i" } }] } : {}),
            }
            const memories = await MaddoxCampaignMemoryModel.find(filter)
                .sort({ updatedAt: -1 })
                .limit(input.limit ?? 20)
                .lean<IMaddoxCampaignMemory[]>()
            return { memories: memories.map(memoryDto) }
        },
    }),
    define({
        name: "save_memory",
        description: [
            "Cria ou atualiza uma memória da campanha pelo tipo + título (sem duplicar). Tipos:",
            "`local` (lugar: ambientação, pontos de interesse, habitantes, mudanças), `missao` (objetivo, pistas, pendências; informe `status`),",
            "`evento` (marco da história: contexto, ações, resultado e consequências — não um diário de turnos), `relacao` (relações entre personagens e facções),",
            "`fato` (fato durável do mundo) e `outro`. `visibility`: players = os jogadores sabem; master = segredo do mestre.",
        ].join(" "),
        readOnly: false,
        input: z.object({
            kind: z.enum(MADDOX_CAMPAIGN_MEMORY_KINDS),
            title: z.string().min(1).describe("Título curto e estável (ex.: nome do lugar ou da missão)"),
            text: z.string().min(1).describe("Conteúdo consolidado (substitui o anterior)"),
            visibility: z.enum(MADDOX_VISIBILITIES).optional(),
            tags: z.array(z.string()).optional(),
            status: z.enum(MADDOX_QUEST_STATUSES).optional().describe("Só para `missao`"),
        }),
        async execute(context, input) {
            const title = clip(input.title, NAME_MAX)
            const titleKey = keyOf(title)
            if (!titleKey) throw new MaddoxToolError("Informe o título da memória.")
            const set: Record<string, unknown> = { title, text: clip(input.text, TEXT_MAX), turnNumber: context.turnNumber }
            if (input.visibility) set.visibility = input.visibility
            if (input.tags) set.tags = input.tags.map((tag) => clip(tag, 60)).filter(Boolean).slice(0, TAGS_MAX)
            if (input.kind === "missao" && input.status) set.status = input.status
            const existing = await MaddoxCampaignMemoryModel.findOne({ campaignId: context.campaignId, kind: input.kind, titleKey }).select("_id").lean()
            if (existing) {
                await MaddoxCampaignMemoryModel.updateOne({ _id: existing._id }, { $set: set })
                return { saved: true, created: false, kind: input.kind, title }
            }
            await MaddoxCampaignMemoryModel.create({
                campaignId: context.campaignId,
                kind: input.kind,
                titleKey,
                origin: "agent",
                createdBy: "maddox",
                ...set,
                ...(input.kind === "missao" ? { status: input.status ?? "ativa" } : {}),
            })
            return { saved: true, created: true, kind: input.kind, title }
        },
    }),
    define({
        name: "update_character_state",
        description:
            "Atualiza a condição atual de um personagem jogador na história (ferimentos, cansaço, recursos e equipamentos que mudaram, onde está). Substitui a condição anterior; o perfil da entrevista não muda.",
        readOnly: false,
        input: z.object({ characterName: z.string().min(1), currentState: z.string().describe("Condição atual consolidada") }),
        async execute(context, input) {
            const characters = await MaddoxCharacterModel.find({ campaignId: context.campaignId, status: "active" }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>()
            const target = characters.find((character) => keyOf(character.name) === keyOf(input.characterName))
            if (!target) throw new MaddoxToolError(`Nenhum personagem jogador chamado "${input.characterName}". Personagens: ${characters.map((character) => character.name).join(", ") || "nenhum"}.`)
            await MaddoxCharacterModel.updateOne({ _id: target._id }, { $set: { currentState: clip(input.currentState, SHORT_MAX * 2) } })
            return { saved: true, characterName: target.name }
        },
    }),
]

export function findMaddoxTool(name: string): MaddoxMasterTool | undefined {
    return MADDOX_MASTER_TOOLS.find((tool) => tool.name === name)
}

/** Executa uma ferramenta validando a entrada; falha vira `MaddoxToolError` com mensagem em pt-BR. */
export async function runMaddoxTool(tool: MaddoxMasterTool, context: MaddoxToolContext, rawInput: unknown): Promise<unknown> {
    const parsed = tool.input.safeParse(rawInput ?? {})
    if (!parsed.success) throw new MaddoxToolError(`Entrada inválida para ${tool.name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "entrada"}: ${issue.message}`).join("; ")}`)
    try {
        const output = await tool.execute(context, parsed.data as never)
        if (!tool.readOnly) log.info({ tool: tool.name, campaignId: String(context.campaignId), turnNumber: context.turnNumber }, "[maddox] narrador gravou o estado")
        return output
    } catch (error) {
        if (error instanceof MaddoxToolError) throw error
        log.warn({ tool: tool.name, campaignId: String(context.campaignId), err: error instanceof Error ? error.message : String(error) }, "[maddox] ferramenta do narrador falhou")
        throw new MaddoxToolError("Não foi possível concluir a operação agora. Continue a narração sem ela.")
    }
}

/** Ferramentas no formato da AI SDK (a SDK `ai` entra sob demanda). */
export async function buildMaddoxAiTools(context: MaddoxToolContext): Promise<ToolSet> {
    const { dynamicTool } = await import("ai")
    const tools: ToolSet = {}
    for (const def of MADDOX_MASTER_TOOLS) {
        tools[def.name] = dynamicTool({
            description: def.description,
            inputSchema: def.input,
            execute: async (input: unknown) => runMaddoxTool(def, context, input),
        })
    }
    return tools
}
