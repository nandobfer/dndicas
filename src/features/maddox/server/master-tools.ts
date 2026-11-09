import { z } from "zod"
import { Types } from "mongoose"
import type { ToolSet } from "ai"
import { loggerFor } from "@/lib/logger"
import {
    MADDOX_ACTION_OPTION_GUIDE,
    MADDOX_ACTION_OPTION_TEXT_MAX,
    MADDOX_ACTION_OPTIONS_MAX,
    MADDOX_CAMPAIGN_MEMORY_KINDS,
    MADDOX_CAMPAIGN_STATE_FIELDS,
    MADDOX_CHECK_DC_MAX,
    MADDOX_CHECK_DC_MIN,
    MADDOX_CHECK_REASON_GUIDE,
    MADDOX_CHECK_RIGORS,
    MADDOX_CHECK_ROUNDS_MAX,
    MADDOX_COIN_KEYS,
    MADDOX_COMBAT_COINS_MAX,
    MADDOX_COMBAT_ITEM_QUANTITY_MAX,
    MADDOX_COMBAT_OUTCOMES,
    MADDOX_COMBAT_REWARD_KINDS,
    MADDOX_COMBAT_REWARDS_MAX,
    MADDOX_COMBAT_RIGORS,
    MADDOX_COMBAT_TARGETS_MAX,
    MADDOX_COMBAT_WAIT_ROUNDS_MAX,
    MADDOX_COMBATANT_OUTCOMES,
    MADDOX_CONDITION_LABELS,
    MADDOX_CONDITIONS,
    MADDOX_TACTICAL_COMBAT_RIGORS,
    MADDOX_CATALOG_REWARD_RIGORS,
    MADDOX_COMBATANT_SIDES,
    MADDOX_COMBATANTS_MAX,
    MADDOX_NPC_STATUSES,
    MADDOX_QUEST_STATUSES,
    MADDOX_SCENE_IMAGE_CAPTION_GUIDE,
    MADDOX_SCENE_IMAGE_CAPTION_MAX,
    MADDOX_SCENE_IMAGE_DESCRIPTION_MAX,
    MADDOX_TOOL_NAME_MAX,
    MADDOX_TOOL_TAG_MAX,
    MADDOX_TOOL_TAGS_MAX,
    MADDOX_TOOL_TEXT_MAX,
    MADDOX_VISIBILITIES,
} from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel, MaddoxCharacterModel, MaddoxNpcModel, type IMaddoxCampaign, type IMaddoxCharacter, type IMaddoxNpc } from "../models"
import { MADDOX_ABILITIES, MADDOX_ABILITY_LABELS, MADDOX_SKILLS, checkAbility, checkTitle } from "../check-modifier"
import { addDraftCheck, addDraftCombat, addDraftNpcPortrait, addDraftOpexNpcFailure, jobOpexNpcConsult, jobOpexNpcConsultCount, setJobOpexNpcConsult, setDraftActionOptions, jobDraftChecks, jobDraftCombat, jobDraftSceneImage, jobWorkspace, maddoxJobMeta, setDraftSceneImage, type MaddoxDraftCombatReward } from "./game-live"
import { catalogEntityTypeSchema } from "@/features/mcp/server/catalog-schemas"
import type { TacticalDraftCombatant } from "./tactical-combat"
import type { CampaignMemoryView } from "@/features/engramind/campaign-memory-format"

/**
 * Ferramentas de persistência do Maddox narrador (Maddox 4) — SOMENTE servidor. Definidas uma vez e expostas de
 * dois jeitos: à AI SDK (`buildMaddoxAiTools`, provedores diretos) e ao MCP do Maddox (`maddox-mcp.ts`, OpenCode).
 * A campanha vem sempre do contexto da geração, nunca do modelo.
 *
 * Textos gerados não invalidam a chamada por tamanho: acima do teto de PROTEÇÃO (`MADDOX_TOOL_TEXT_MAX`, muito acima do
 * tamanho orientado no prompt) são cortados e o retorno avisa o modelo (`truncated` com os campos), para ele consolidar.
 */

const log = loggerFor({ module: "maddox", feature: "narrator-tools" })

export interface MaddoxToolContext {
    campaignId: Types.ObjectId
    turnNumber: number
    /** Job da fila que está gerando (testes pedidos ficam nele até a narração ser gravada). */
    jobId?: string
}

export interface MaddoxMasterTool {
    name: string
    description: string
    input: z.ZodObject<z.ZodRawShape>
    readOnly: boolean
    execute: (context: MaddoxToolContext, input: never) => Promise<unknown>
}

export class MaddoxToolError extends Error {}

const clip = (value: string | undefined | null, max: number) => {
    const text = (value ?? "").trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
const preview = (value: string, max = 200) => clip(value.replace(/\s+/g, " "), max)

/** Corta no teto de proteção e anota o campo cortado (o retorno avisa o modelo). */
function fitter() {
    const cut: string[] = []
    return {
        fit(field: string, value: string | undefined | null, max = MADDOX_TOOL_TEXT_MAX) {
            const text = (value ?? "").trim()
            if (text.length > max) cut.push(field)
            return clip(text, max)
        },
        /** `{ truncated }` para o retorno quando algo foi cortado. */
        notice() {
            return cut.length ? { truncated: [...cut], note: `Texto acima do teto de ${MADDOX_TOOL_TEXT_MAX.toLocaleString("pt-BR")} caracteres foi cortado em: ${cut.join(", ")}. Consolide e grave de novo, mais conciso.` } : {}
        },
    }
}
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
    ...(npc.opex?.active ? { npcOpex: true } : {}),
    publicDescription: full ? npc.publicDescription : preview(npc.publicDescription),
    ...(full ? { masterNotes: npc.masterNotes } : {}),
})

type CampaignMemoryLike = Pick<CampaignMemoryView, "kind" | "title" | "text" | "visibility" | "tags" | "status" | "turnNumber">

const memoryDto = (memory: CampaignMemoryLike) => ({
    kind: memory.kind,
    title: memory.title,
    text: memory.text,
    visibility: memory.visibility,
    tags: memory.tags,
    status: memory.status ?? null,
    turnNumber: memory.turnNumber ?? null,
})

/** Erros da rede de memórias viram mensagem para o narrador (a narração segue). */
function memoryToolError(error: unknown): never {
    if (error instanceof MaddoxToolError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new MaddoxToolError(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENGRAMIND_UNAVAILABLE" ? "A rede de memórias está indisponível agora; siga sem consultar." : message)
}

type SaveNpcInput = { name: string; newName?: string; publicDescription?: string; masterNotes?: string; visibility?: (typeof MADDOX_VISIBILITIES)[number]; status?: (typeof MADDOX_NPC_STATUSES)[number] }

async function saveNpc(context: MaddoxToolContext, input: SaveNpcInput): Promise<{ saved: true; created: boolean; name: string; truncated?: string[]; note?: string }> {
    const fit = fitter()
    const name = clip(input.name, MADDOX_TOOL_NAME_MAX)
    const nameKey = keyOf(name)
    if (!nameKey) throw new MaddoxToolError("Informe o nome do NPC.")
    const set: Record<string, unknown> = {}
    if (input.publicDescription !== undefined) set.publicDescription = fit.fit("publicDescription", input.publicDescription)
    if (input.masterNotes !== undefined) set.masterNotes = fit.fit("masterNotes", input.masterNotes)
    if (input.visibility) set.visibility = input.visibility
    if (input.status) set.status = input.status
    const existing = await MaddoxNpcModel.findOne({ campaignId: context.campaignId, nameKey }).select("_id name").lean<{ _id: Types.ObjectId; name: string }>()
    if (existing) {
        // A grafia gravada é a canônica: só muda com `newName` explícito.
        const newName = input.newName?.trim() ? clip(input.newName, MADDOX_TOOL_NAME_MAX) : null
        if (newName && keyOf(newName) !== nameKey) {
            const taken = await MaddoxNpcModel.exists({ campaignId: context.campaignId, nameKey: keyOf(newName), _id: { $ne: existing._id } })
            if (taken) throw new MaddoxToolError(`Já existe um NPC chamado "${newName}" nesta campanha.`)
        }
        if (newName) Object.assign(set, { name: newName, nameKey: keyOf(newName) })
        await MaddoxNpcModel.updateOne({ _id: existing._id }, { $set: set })
        return { saved: true, created: false, name: newName ?? existing.name, ...fit.notice() }
    }
    await MaddoxNpcModel.create({ campaignId: context.campaignId, name, nameKey, ...set })
    return { saved: true, created: true, name, ...fit.notice() }
}

/**
 * Retrato pedido em `save_npc { gerarRetrato }` (Maddox 10): só na narração, com a situação "Retrato de NPC" ativa e a
 * chave da campanha ligada, para NPC que os jogadores conhecem e ainda sem retrato. Fica no job e só é pedido depois que a
 * narração é gravada. O NPC é salvo de qualquer jeito: o retorno explica por que o retrato não foi pedido.
 */
async function requestNpcPortraitDraft(context: MaddoxToolContext, name: string): Promise<string> {
    const meta = context.jobId ? maddoxJobMeta(String(context.campaignId), context.jobId) : null
    if (!meta || meta.kind !== "narration") return "não pedido: retratos só são pedidos na narração do turno do mestre."
    const npc = await MaddoxNpcModel.findOne({ campaignId: context.campaignId, nameKey: keyOf(name) }).select("_id visibility portraitUrl").lean<Pick<IMaddoxNpc, "_id" | "visibility" | "portraitUrl">>()
    if (!npc) return "não pedido: NPC não encontrado."
    if (npc.visibility !== "players") return "não pedido: só NPCs que os jogadores já conhecem ganham retrato."
    if (npc.portraitUrl) return "não pedido: este NPC já tem retrato."
    const { checkSceneImageRequest, loadSceneImageEnvironment } = await import("./scene-images")
    const decision = await checkSceneImageRequest({ campaignId: context.campaignId, source: "npc-portrait", turnNumber: context.turnNumber, situation: "npc-portrait" }, await loadSceneImageEnvironment())
    if (!decision.ok) return `não pedido: ${decision.reason}`
    if (!addDraftNpcPortrait(String(context.campaignId), context.jobId!, String(npc._id))) return "não pedido: esta narração já terminou."
    return "pedido: o retrato é pintado depois que a narração for gravada."
}

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
            "Atualiza o estado atual da história (checkpoint): cena, local, situação imediata e a decisão aguardada dos jogadores. Envie só os campos que mudaram; use ao fim de cada narração em que a situação mudou. Os jogadores leem este estado no Diário da campanha: nunca grave segredos do mestre aqui (use save_npc ou save_memory com visibility master).",
        readOnly: false,
        input: z.object({
            scene: optionalText.describe("Cena atual, em uma ou duas frases"),
            location: optionalText.describe("Onde o grupo está"),
            situation: optionalText.describe("Situação imediata: participantes, condição, último acontecimento"),
            pendingDecision: optionalText.describe("Pergunta ou decisão aguardada dos jogadores"),
        }),
        async execute(context, input) {
            const fit = fitter()
            const set: Record<string, unknown> = { "state.updatedTurn": context.turnNumber, "state.updatedAt": new Date() }
            const written = MADDOX_CAMPAIGN_STATE_FIELDS.filter((field) => input[field] !== undefined)
            for (const field of written) set[`state.${field}`] = fit.fit(field, input[field]!)
            // Regravado com o aviso de que é público: passa a aparecer no Diário da campanha (Maddox 9).
            await MaddoxCampaignModel.updateOne({ _id: context.campaignId }, { $set: set, ...(written.length ? { $addToSet: { "state.publicFields": { $each: written } } } : {}) }, { timestamps: false })
            const campaign = await MaddoxCampaignModel.findById(context.campaignId).select("state").lean<Pick<IMaddoxCampaign, "state">>()
            return { saved: true, state: stateShape(campaign), ...fit.notice() }
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
            "Cria ou atualiza um NPC pelo nome (sem duplicar; acento e caixa não importam e a grafia gravada é mantida). `publicDescription` é o que os jogadores conhecem; `masterNotes` é segredo do mestre (intenções, segredos, planos). Envie só os campos que mudaram. Para renomear, envie `newName`.",
        readOnly: false,
        input: z.object({
            name: z.string().min(1).describe("Nome do NPC"),
            newName: z.string().optional().describe("Só para renomear um NPC que já existe"),
            publicDescription: optionalText.describe("Aparência, papel e o que os jogadores sabem"),
            masterNotes: optionalText.describe("Conhecimento exclusivo do mestre"),
            visibility: z.enum(MADDOX_VISIBILITIES).optional().describe("players = os jogadores já conhecem; master = só o mestre"),
            status: z.enum(MADDOX_NPC_STATUSES).optional(),
            gerarRetrato: z.boolean().optional().describe("true = NPC importante que os jogadores conhecem: ganha um retrato (uma vez), se a situação \"Retrato de NPC\" estiver ativa"),
        }),
        async execute(context, input) {
            const saved = await saveNpc(context, input)
            // NPC Opex que morre deixa de ser Opex sozinho (DND-27).
            if (input.status === "dead") {
                const npc = await MaddoxNpcModel.findOne({ campaignId: context.campaignId, nameKey: keyOf(saved.name) }).select("_id").lean<{ _id: Types.ObjectId }>()
                if (npc) {
                    const { retireOpexNpcIfDead } = await import("./opex-npcs")
                    if (await retireOpexNpcIfDead(context.campaignId, npc._id)) Object.assign(saved, { npcOpex: "deixou de ser NPC Opex (morreu)" })
                }
            }
            if (!input.gerarRetrato) return saved
            return { ...saved, retrato: await requestNpcPortraitDraft(context, saved.name) }
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
            const limit = input.limit ?? 20
            const memories = await import("@/features/engramind/server/campaign-memories")
            const campaignId = String(context.campaignId)
            try {
                const found = query
                    ? await memories.searchCampaignMemories(campaignId, { query, kind: input.kind, limit, scope: "all", reader: "maddox" })
                    : (await memories.listCampaignMemories(campaignId, { kind: input.kind, limit, scope: "all", reader: "maddox" })).items
                return { memories: found.map(memoryDto) }
            } catch (error) {
                memoryToolError(error)
            }
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
            const fit = fitter()
            const title = clip(input.title, MADDOX_TOOL_NAME_MAX)
            if (!keyOf(title)) throw new MaddoxToolError("Informe o título da memória.")
            const tags = input.tags?.map((tag) => clip(tag, MADDOX_TOOL_TAG_MAX)).filter(Boolean).slice(0, MADDOX_TOOL_TAGS_MAX)
            const { saveCampaignMemory } = await import("@/features/engramind/server/campaign-memories")
            try {
                const result = await saveCampaignMemory(String(context.campaignId), {
                    kind: input.kind,
                    title,
                    text: fit.fit("text", input.text),
                    turnNumber: context.turnNumber,
                    ...(input.visibility ? { visibility: input.visibility } : {}),
                    ...(tags ? { tags } : {}),
                    ...(input.kind === "missao" && input.status ? { status: input.status } : {}),
                })
                return { ...result, kind: input.kind, title, ...fit.notice() }
            } catch (error) {
                memoryToolError(error)
            }
        },
    }),
    define({
        name: "resolve_reminder",
        description:
            "Decide uma lembrança injetada por um jogador nesta narração (DND-25): `guardar: true` grava-a como memória da campanha (informe `tipo`, `titulo`, `texto` consolidado e `visibility`: players = os jogadores sabem; master = só o mestre); `guardar: false` = vale só para esta narração. Chame uma vez para cada lembrança listada na tarefa, pelo id entre colchetes.",
        readOnly: false,
        input: z.object({
            lembranca: z.string().min(1).describe("Id da lembrança (entre colchetes na tarefa)"),
            guardar: z.boolean(),
            tipo: z.enum(MADDOX_CAMPAIGN_MEMORY_KINDS).optional(),
            titulo: z.string().optional(),
            texto: z.string().optional(),
            visibility: z.enum(MADDOX_VISIBILITIES).optional(),
        }),
        async execute(context, input) {
            const { decideReminder } = await import("./reminders")
            const fit = fitter()
            const result = decideReminder(context.campaignId, context.jobId, {
                ...input,
                ...(input.titulo !== undefined ? { titulo: clip(input.titulo, MADDOX_TOOL_NAME_MAX) } : {}),
                ...(input.texto !== undefined ? { texto: fit.fit("texto", input.texto) } : {}),
            })
            if (typeof result === "string") throw new MaddoxToolError(result)
            return { ...result, ...fit.notice() }
        },
    }),
    define({
        name: "update_character_state",
        description:
            "Atualiza a condição atual de um personagem jogador na história (ferimentos, cansaço, recursos e equipamentos que mudaram, onde está). Substitui a condição anterior; o perfil da entrevista não muda. Todos os jogadores leem esta condição no Diário da campanha: nunca grave segredos do mestre aqui.",
        readOnly: false,
        input: z.object({ characterName: z.string().min(1), currentState: z.string().describe("Condição atual consolidada") }),
        async execute(context, input) {
            const characters = await MaddoxCharacterModel.find({ campaignId: context.campaignId, status: "active" }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>()
            const target = characters.find((character) => keyOf(character.name) === keyOf(input.characterName))
            if (!target) throw new MaddoxToolError(`Nenhum personagem jogador chamado "${input.characterName}". Personagens: ${characters.map((character) => character.name).join(", ") || "nenhum"}.`)
            const fit = fitter()
            await MaddoxCharacterModel.updateOne({ _id: target._id }, { $set: { currentState: fit.fit("currentState", input.currentState), currentStatePublic: true } })
            return { saved: true, characterName: target.name, ...fit.notice() }
        },
    }),
    define({
        name: "request_check",
        description: [
            "Pede um teste de perícia, atributo ou resistência para UM personagem jogador. Use quando o resultado de uma tentativa for incerto e relevante.",
            "O jogador rola o d20 com os modificadores da ficha dele; o resultado chega na próxima mensagem. Depois de pedir,",
            "narre até o momento da tentativa e PARE: não decida o resultado nem pergunte o que os jogadores fazem. Um teste por personagem a cada narração.",
        ].join(" "),
        readOnly: false,
        input: z.object({
            personagem: z.string().min(1).describe("Nome do personagem jogador que faz o teste"),
            tipo: z.enum(["pericia", "atributo", "resistencia"]).describe("pericia = teste de perícia; atributo = teste de atributo puro; resistencia = teste de resistência"),
            pericia: z.enum(MADDOX_SKILLS as [string, ...string[]]).optional().describe("Obrigatória quando tipo = pericia"),
            atributo: z.enum(MADDOX_ABILITIES.map((ability) => MADDOX_ABILITY_LABELS[ability]) as [string, ...string[]]).optional().describe("Obrigatório quando tipo = atributo ou resistencia"),
            cd: z.number().int().min(MADDOX_CHECK_DC_MIN).max(MADDOX_CHECK_DC_MAX).describe("Classe de dificuldade (CD) do teste, pelas regras do D&D"),
            modo: z.enum(["normal", "vantagem", "desvantagem"]).optional().describe("Vantagem ou desvantagem quando a situação der"),
            motivo: z.string().min(1).describe(`O que o personagem tenta, curto (até uns ${MADDOX_CHECK_REASON_GUIDE} caracteres) e sem revelar segredos (os jogadores leem)`),
        }),
        async execute(context, input) {
            const campaign = await MaddoxCampaignModel.findById(context.campaignId).select("rigor").lean<Pick<IMaddoxCampaign, "rigor">>()
            if (!campaign || !MADDOX_CHECK_RIGORS.includes(campaign.rigor)) throw new MaddoxToolError("Esta campanha é narrativa: não peça testes nem dados, resolva pela história.")
            const meta = context.jobId ? maddoxJobMeta(String(context.campaignId), context.jobId) : null
            if (!meta || meta.kind !== "narration") throw new MaddoxToolError("Testes só são pedidos na narração do turno do mestre. Responda à pergunta sem pedir teste.")
            const { findActiveTactical } = await import("./tactical-combat")
            const inTactical = MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor) && Boolean(await findActiveTactical(context.campaignId))
            if (meta.round >= (inTactical ? MADDOX_COMBAT_WAIT_ROUNDS_MAX : MADDOX_CHECK_ROUNDS_MAX) - 1) throw new MaddoxToolError("Limite de testes deste turno atingido: conclua a narração resolvendo a situação sem novos testes.")
            const kind = input.tipo === "pericia" ? "skill" : input.tipo === "resistencia" ? "save" : "ability"
            const skill = kind === "skill" ? ((input.pericia ?? null) as (typeof MADDOX_SKILLS)[number] | null) : null
            if (kind === "skill" && !skill) throw new MaddoxToolError(`Informe a perícia do teste. Perícias: ${MADDOX_SKILLS.join(", ")}.`)
            const labelled = MADDOX_ABILITIES.find((ability) => MADDOX_ABILITY_LABELS[ability] === input.atributo) ?? null
            if (kind !== "skill" && !labelled) throw new MaddoxToolError("Informe o atributo do teste (Força, Destreza, Constituição, Inteligência, Sabedoria ou Carisma).")
            const ability = checkAbility(kind, labelled, skill)!

            const characters = await MaddoxCharacterModel.find({ campaignId: context.campaignId, status: "active" }).select("name memberId userId sheetId interview").lean<IMaddoxCharacter[]>()
            const target = characters.find((character) => keyOf(character.name) === keyOf(input.personagem))
            if (!target) throw new MaddoxToolError(`Nenhum personagem jogador chamado "${input.personagem}". Personagens: ${characters.map((character) => character.name).join(", ") || "nenhum"}.`)
            const member = await MaddoxCampaignMemberModel.findOne({ _id: target.memberId, campaignId: context.campaignId, status: "joined" }).select("_id userId").lean<{ _id: Types.ObjectId; userId: string }>()
            if (!member || target.interview?.status !== "done") throw new MaddoxToolError(`${target.name} não está jogando agora: não peça teste para esse personagem.`)
            if (!target.sheetId) throw new MaddoxToolError(`${target.name} não tem ficha D&D: resolva a tentativa pela narração.`)
            if (jobDraftChecks(String(context.campaignId), context.jobId!).some((check) => check.memberId === String(member._id))) throw new MaddoxToolError(`Já existe um teste pedido para ${target.name} nesta narração: um teste por personagem.`)

            const mode = input.modo === "vantagem" ? "advantage" : input.modo === "desvantagem" ? "disadvantage" : "normal"
            // Só o teto de PROTEÇÃO corta o motivo (avisado no retorno); o tamanho curto é orientação da descrição.
            const fit = fitter()
            const added = addDraftCheck(String(context.campaignId), context.jobId!, {
                memberId: String(member._id),
                userId: member.userId,
                characterId: String(target._id),
                characterName: target.name,
                sheetId: String(target.sheetId),
                kind,
                ability,
                skill,
                dc: input.cd,
                mode,
                reason: fit.fit("motivo", input.motivo),
            })
            if (!added) throw new MaddoxToolError("Esta narração já terminou.")
            const title = checkTitle({ kind, ability, skill })
            return {
                requested: true,
                check: `${title} para ${target.name}, CD ${input.cd}${mode === "normal" ? "" : mode === "advantage" ? ", com vantagem" : ", com desvantagem"}`,
                note: "Narre até o momento da tentativa e pare, sem decidir o resultado nem perguntar o que os jogadores fazem. O resultado da rolagem chega na próxima mensagem.",
                ...fit.notice(),
            }
        },
    }),
]

// ── Combate narrativo (Maddox 6) ───────────────────────────────────────────────

/** Ferramentas do combate (narrativo no Maddox 6; também as do combate tático no Maddox 7). */
export const MADDOX_COMBAT_TOOL_NAMES = ["get_combat", "start_combat", "update_combat", "end_combat"] as const
/** Ferramentas da vez dos adversários no combate tático (Rigoroso e Fiel ao D&D). */
export const MADDOX_TACTICAL_TOOL_NAMES = ["monster_action", "apply_effect", "request_damage_roll", "offer_reaction"] as const

/** Garante grau e geração certos e devolve o estado efetivo do combate (gravado + rascunho deste job). */
async function combatContext(context: MaddoxToolContext) {
    const campaign = await MaddoxCampaignModel.findById(context.campaignId).select("rigor").lean<Pick<IMaddoxCampaign, "rigor">>()
    const tactical = Boolean(campaign && MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor))
    if (!campaign || (!MADDOX_COMBAT_RIGORS.includes(campaign.rigor) && !tactical))
        throw new MaddoxToolError("Esta campanha não registra combate por ferramentas: narre o combate normalmente, sem abrir nem encerrar registro.")
    const meta = context.jobId ? maddoxJobMeta(String(context.campaignId), context.jobId) : null
    if (!meta || meta.kind !== "narration") throw new MaddoxToolError("O combate só começa ou termina na narração do turno do mestre. Responda à pergunta sem mexer no combate.")
    const { findActiveCombat, replayCombat } = await import("./combat")
    const active = await findActiveCombat(context.campaignId)
    return { rigor: campaign.rigor, tactical, state: replayCombat(active, jobDraftCombat(String(context.campaignId), context.jobId!)) }
}

const customStatsInput = z
    .object({
        ca: z.number().int().min(1).max(40),
        pv: z.number().int().min(1).max(2000),
        iniciativa: z.number().int().min(-10).max(20).optional(),
        destreza: z.number().int().min(1).max(30).optional(),
        salvaguardas: z.object(Object.fromEntries(MADDOX_ABILITIES.map((ability) => [ability, z.number().int().min(-10).max(25).optional()])) as Record<string, z.ZodOptional<z.ZodNumber>>).optional(),
        resistencias: z.array(z.string()).max(15).optional(),
        imunidades: z.array(z.string()).max(15).optional(),
        vulnerabilidades: z.array(z.string()).max(15).optional(),
        ataquesMultiplos: z.number().int().min(1).max(5).optional(),
        acoes: z
            .array(
                z.object({
                    nome: z.string().min(1),
                    tipo: z.enum(["ataque", "salvaguarda", "outro"]),
                    bonus: z.number().int().min(-5).max(25).optional(),
                    cd: z.number().int().min(5).max(30).optional(),
                    atributo: z.string().optional(),
                    dano: z.string().optional().describe("Dados de dano (\"1d6+2\")"),
                    tipoDano: z.string().optional(),
                    metadeNoSucesso: z.boolean().optional(),
                    distancia: z.boolean().optional(),
                    recarga: z.string().optional(),
                    economia: z.enum(["acao", "bonus", "reacao"]).optional(),
                }),
            )
            .min(1)
            .max(10),
    })
    .describe("Bloco de estatísticas próprio (só no Rigoroso, quando o monstro não está no catálogo)")

const tacticalCombatantFields = {
    monstro: z.string().optional().describe("Combate tático: nome ou id do monstro no catálogo de Monstros do DnDicas (obrigatório no Fiel ao D&D; confirme com search_catalog)"),
    estatisticas: customStatsInput.optional(),
}

/** Bloco de estatísticas de cada adversário do combate tático: catálogo (restritivo) ou próprio (só no Rigoroso, explícito). */
async function tacticalDrafts(rigor: IMaddoxCampaign["rigor"], items: readonly (z.infer<typeof combatantInput> & { monstro?: string; estatisticas?: z.infer<typeof customStatsInput> })[], fit: ReturnType<typeof fitter>): Promise<TacticalDraftCombatant[]> {
    const { findCatalogMonster, monsterStatsFromCatalog, monsterStatsFromCustom } = await import("./combat-monsters")
    const drafts: TacticalDraftCombatant[] = []
    for (const item of items) {
        const base = toDraftCombatant(item, fit)
        if (item.monstro?.trim()) {
            const { doc, suggestions } = await findCatalogMonster(item.monstro)
            if (!doc) {
                const options = suggestions.length ? ` Parecidos no catálogo: ${suggestions.join(", ")}.` : " Use search_catalog (tipo Monstro) para achar o nome."
                throw new MaddoxToolError(`"${item.monstro}" não está no catálogo de Monstros.${options}${rigor === "rigoroso" ? " No Rigoroso, um adversário fora do catálogo entra só com `estatisticas` próprias (sem `monstro`)." : ""}`)
            }
            drafts.push({ ...base, stats: monsterStatsFromCatalog(doc) })
            continue
        }
        if (rigor === "fiel-dnd") throw new MaddoxToolError(`No Fiel ao D&D todo adversário vem do catálogo de Monstros: informe \`monstro\` para "${item.nome}" (confirme o nome com search_catalog, tipo Monstro).`)
        if (!item.estatisticas) throw new MaddoxToolError(`Informe \`monstro\` (catálogo) ou \`estatisticas\` (bloco próprio) para "${item.nome}": o combate tático precisa de CA, PV e ações.`)
        drafts.push({ ...base, stats: monsterStatsFromCustom(item.estatisticas as Parameters<typeof monsterStatsFromCustom>[0]) })
    }
    return drafts
}

/** O que a cópia de trabalho do combate tático deste job deixou pendente (salvaguardas, reações, rolagens). */
const tacticalWaitsInJob = (context: MaddoxToolContext) => {
    const workspace = context.jobId ? jobWorkspace<{ messages: { kind?: string }[] }>(String(context.campaignId), context.jobId) : null
    return (workspace?.messages ?? []).filter((message) => message.kind === "combat-roll" || message.kind === "combat-reaction").length
}

const combatantInput = z.object({
    nome: z.string().min(1).describe("Nome como os jogadores o conhecem (nome próprio ou \"Bandido de capuz\")"),
    lado: z.enum(MADDOX_COMBATANT_SIDES).optional().describe("inimigo (padrão) ou aliado dos personagens"),
    quantidade: z.number().int().min(1).max(999).optional().describe("Para grupos iguais (\"3 lobos\")"),
    descricao: optionalText.describe("Aparência e papel na luta, curto"),
    condicao: optionalText.describe("Condição atual (\"ileso\", \"ferido no ombro\", \"recuando\")"),
    registrarNpc: z.boolean().optional().describe("true só para personagens com nome próprio que devem virar NPC da campanha"),
})

const tacticalCombatantInput = combatantInput.extend(tacticalCombatantFields)

const toDraftCombatant = (input: z.infer<typeof combatantInput>, fit: ReturnType<typeof fitter>) => ({
    name: clip(input.nome, MADDOX_TOOL_NAME_MAX),
    side: input.lado ?? ("inimigo" as const),
    quantity: input.quantidade ?? 1,
    description: fit.fit("descricao", input.descricao),
    condition: fit.fit("condicao", input.condicao),
    registerNpc: Boolean(input.registrarNpc),
})

/** Recusa nomes repetidos na mesma lista (o desfecho e as atualizações casam pelo nome). */
function assertUniqueCombatants(items: readonly { nome: string }[], existing: readonly string[] = []) {
    const seen = new Set(existing.map(keyOf))
    for (const item of items) {
        const key = keyOf(item.nome)
        if (seen.has(key)) throw new MaddoxToolError(`"${item.nome}" aparece mais de uma vez no combate: use um nome por participante (grupos iguais = um item com \`quantidade\`, ex.: "Lobo" com quantidade 2; ou nomes distintos como "Lobo alfa" e "Lobo cinzento").`)
        seen.add(key)
    }
}

async function playerCharacters(campaignId: Types.ObjectId) {
    return MaddoxCharacterModel.find({ campaignId, status: "active" }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>()
}

function findCharacter(characters: readonly { _id: Types.ObjectId; name: string }[], name: string) {
    const target = characters.find((character) => keyOf(character.name) === keyOf(name))
    if (!target) throw new MaddoxToolError(`Nenhum personagem jogador chamado "${name}". Personagens: ${characters.map((character) => character.name).join(", ") || "nenhum"}.`)
    return target
}

const coinsInput = z
    .object(Object.fromEntries(MADDOX_COIN_KEYS.map((key) => [key, z.number().int().min(0).max(MADDOX_COMBAT_COINS_MAX).optional()])) as Record<(typeof MADDOX_COIN_KEYS)[number], z.ZodOptional<z.ZodNumber>>)
    .describe("po = ouro, pp = prata, pe = electrum, pc = cobre, pl = platina")

export const MADDOX_COMBAT_TOOLS: readonly MaddoxMasterTool[] = [
    define({
        name: "get_combat",
        description: "Lê o combate em andamento (título, adversários e aliados com a condição de cada um), contando o que já foi pedido nesta narração.",
        readOnly: true,
        input: z.object({}),
        async execute(context) {
            const { state, tactical } = await combatContext(context)
            if (tactical) {
                const { tacticalView } = await import("./tactical-master")
                const view = await tacticalView(context.campaignId, context.jobId)
                if (view) return { active: true, ...view }
            }
            return state.active ? { active: true, title: state.title, combatants: state.combatants } : { active: false, note: "Nenhum combate em andamento." }
        },
    }),
    define({
        name: "start_combat",
        description: [
            "Registra o INÍCIO de um combate: chame quando a hostilidade de fato começa (um ataque, uma emboscada), não diante de uma ameaça.",
            "Informe um título curto, o local e os adversários (e aliados, se houver). Os personagens dos jogadores não entram na lista.",
            "Narrativo, Flexível e Equilibrado: depois narre a luta de forma cinemática, sem iniciativa nem turnos mecânicos.",
            "Rigoroso e Fiel ao D&D (combate tático): cada adversário precisa do bloco de estatísticas — `monstro` do catálogo (obrigatório no Fiel) ou `estatisticas` próprias (só no Rigoroso);",
            "os jogadores rolam a iniciativa e o combate segue por turnos. Um combate por vez.",
        ].join(" "),
        readOnly: false,
        input: z.object({
            titulo: z.string().min(1).describe("Título curto do encontro (\"Emboscada na ponte de Varn\")"),
            local: optionalText.describe("Onde a luta acontece"),
            adversarios: z.array(tacticalCombatantInput).min(1).max(MADDOX_COMBATANTS_MAX),
            surpresa: z.enum(["personagens", "adversarios"]).optional().describe("Combate tático: quem foi surpreendido (rola a iniciativa com desvantagem)"),
        }),
        async execute(context, input) {
            const { state, tactical, rigor } = await combatContext(context)
            if (state.active) throw new MaddoxToolError(`Já há um combate em andamento ("${state.title}"): use update_combat para mudanças ou end_combat para encerrá-lo.`)
            assertUniqueCombatants(input.adversarios)
            const fit = fitter()
            const combatants = input.adversarios.map((item) => toDraftCombatant(item, fit))
            const tacticalPlan = tactical ? { surprise: input.surpresa ?? null, combatants: await tacticalDrafts(rigor, input.adversarios, fit) } : undefined
            const added = addDraftCombat(String(context.campaignId), context.jobId!, { type: "start", title: clip(input.titulo, MADDOX_TOOL_NAME_MAX), location: clip(input.local, MADDOX_TOOL_NAME_MAX), combatants, ...(tacticalPlan ? { tactical: tacticalPlan } : {}) })
            if (!added) throw new MaddoxToolError("Esta narração já terminou.")
            if (tactical) {
                return {
                    started: true,
                    title: clip(input.titulo, MADDOX_TOOL_NAME_MAX),
                    adversarios: tacticalPlan!.combatants.map((item) => ({ nome: item.name, quantidade: item.quantity, ca: item.stats.ac, pv: item.stats.hpMax, acoes: item.stats.actions.map((action) => action.name) })),
                    note: "Combate tático: narre o começo da luta até o momento em que todos sacam as armas e PARE. Os jogadores rolam a iniciativa; a ordem e a vez de cada um chegam na próxima mensagem. Não conduza ataques ainda.",
                    ...fit.notice(),
                }
            }
            return { started: true, title: clip(input.titulo, MADDOX_TOOL_NAME_MAX), note: "Narre a luta de forma cinemática. Encerre com end_combat quando houver vitória, derrota, fuga, rendição ou trégua.", ...fit.notice() }
        },
    }),
    define({
        name: "update_combat",
        description: "Atualiza o combate em andamento: condição dos adversários e aliados (ferido, recuando, caído) ou reforços que entram na luta. Envie só quem mudou.",
        readOnly: false,
        input: z.object({ adversarios: z.array(tacticalCombatantInput).min(1).max(MADDOX_COMBATANTS_MAX) }),
        async execute(context, input) {
            const { state, tactical, rigor } = await combatContext(context)
            if (!state.active) throw new MaddoxToolError("Nenhum combate em andamento: use start_combat quando a luta começar.")
            // Mesma pessoa duas vezes na lista = recusa; quem já está na luta é atualizado, quem é novo entra uma vez só.
            assertUniqueCombatants(input.adversarios)
            const fit = fitter()
            const combatants = input.adversarios.map((item) => {
                const draft = toDraftCombatant(item, fit)
                return {
                    name: draft.name,
                    ...(item.lado ? { side: draft.side } : {}),
                    ...(item.quantidade ? { quantity: draft.quantity } : {}),
                    ...(item.descricao !== undefined ? { description: draft.description } : {}),
                    ...(item.condicao !== undefined ? { condition: draft.condition } : {}),
                    registerNpc: draft.registerNpc,
                }
            })
            // Combate tático: quem é novo (reforço) precisa do bloco de estatísticas e rola a iniciativa ao entrar.
            const known = state.combatants.map((item) => keyOf(item.name))
            const fresh = input.adversarios.filter((item) => !known.includes(keyOf(item.nome)) && !known.some((name) => name.startsWith(`${keyOf(item.nome)} `)))
            const reinforcements = tactical && fresh.length ? await tacticalDrafts(rigor, fresh, fit) : undefined
            if (!addDraftCombat(String(context.campaignId), context.jobId!, { type: "update", combatants, ...(reinforcements ? { tactical: reinforcements } : {}) })) throw new MaddoxToolError("Esta narração já terminou.")
            return { saved: true, ...(reinforcements ? { reforcos: reinforcements.map((item) => item.name), nota: "Os reforços entram na ordem de iniciativa (rolada pelo servidor) a partir da próxima vez." } : {}), ...fit.notice() }
        },
    }),
    define({
        name: "end_combat",
        description: [
            "Registra o FIM do combate em andamento: o resultado para o grupo, um resumo público do desfecho, o desfecho de cada adversário",
            "(morto, derrotado, capturado, rendeu-se, fugiu, poupado, ileso), as recompensas obtidas (moedas, itens ou outra coisa, com quem recebeu),",
            "a condição de cada personagem depois da luta e a cena final descrita visualmente (para uma ilustração; sem segredos).",
            "Chame na narração em que a luta termina e narre o desfecho.",
        ].join(" "),
        readOnly: false,
        input: z.object({
            resultado: z.enum(MADDOX_COMBAT_OUTCOMES).describe("vitoria, derrota, fuga, tregua ou interrompido"),
            resumo: z.string().min(1).describe("O que aconteceu e como terminou (os jogadores leem)"),
            notasMestre: optionalText.describe("Consequências secretas, só para o mestre"),
            adversarios: z.array(z.object({ nome: z.string().min(1), desfecho: z.enum(MADDOX_COMBATANT_OUTCOMES) })).max(MADDOX_COMBATANTS_MAX).optional(),
            recompensas: z
                .array(
                    z.object({
                        tipo: z.enum(MADDOX_COMBAT_REWARD_KINDS).describe("moedas, item ou outro (informação, favor, reputação)"),
                        descricao: optionalText.describe("Descrição curta (obrigatória para outro)"),
                        personagem: optionalText.describe("Personagem jogador que recebe (vazio = o grupo)"),
                        moedas: coinsInput.optional(),
                        item: optionalText.describe("Nome do item (de preferência o nome do catálogo do DnDicas; no Fiel ao D&D, obrigatoriamente do catálogo)"),
                        quantidade: z.number().int().min(1).max(MADDOX_COMBAT_ITEM_QUANTITY_MAX).optional(),
                    }),
                )
                .max(MADDOX_COMBAT_REWARDS_MAX)
                .optional(),
            estadoPersonagens: z.array(z.object({ personagem: z.string().min(1), condicao: z.string().min(1) })).optional().describe("Condição de cada personagem jogador depois da luta"),
            cenaFinal: z.string().min(1).describe("A cena final descrita visualmente, em poucas frases (luz, lugar, quem está de pé)"),
        }),
        async execute(context, input) {
            const { state, tactical, rigor } = await combatContext(context)
            if (!state.active) throw new MaddoxToolError("Nenhum combate em andamento para encerrar.")
            void tactical
            if (jobDraftChecks(String(context.campaignId), context.jobId!).length > 0) throw new MaddoxToolError("Há teste pedido nesta narração: resolva os testes antes de encerrar o combate.")
            if (tacticalWaitsInJob(context) > 0) throw new MaddoxToolError("Há salvaguarda, reação ou rolagem esperando nesta narração: resolva antes de encerrar o combate.")
            const known = state.combatants.map((item) => item.name)
            for (const item of input.adversarios ?? []) {
                if (!known.some((name) => keyOf(name) === keyOf(item.nome))) throw new MaddoxToolError(`"${item.nome}" não está neste combate. Participantes: ${known.join(", ") || "nenhum"}.`)
            }
            const characters = await playerCharacters(context.campaignId)
            const fit = fitter()
            // Fiel ao D&D: recompensa em item só do catálogo (restritivo: nada é gravado e o retorno sugere parecidos).
            if (MADDOX_CATALOG_REWARD_RIGORS.includes(rigor)) {
                const { findCatalogEntity, similarCatalogNames } = await import("./character-build")
                for (const item of input.recompensas ?? []) {
                    if (item.tipo !== "item" || !item.item?.trim()) continue
                    if (await findCatalogEntity("item", item.item)) continue
                    const similar = await similarCatalogNames("item", item.item)
                    throw new MaddoxToolError(`No Fiel ao D&D toda recompensa em item vem do catálogo: "${item.item.trim()}" não está nele.${similar.length ? ` Parecidos no catálogo: ${similar.join(", ")}.` : ""} Confirme o nome com search_catalog (tipo Item) e chame end_combat de novo.`)
                }
            }
            const rewards: MaddoxDraftCombatReward[] = []
            for (const item of input.recompensas ?? []) {
                const target = item.personagem?.trim() ? findCharacter(characters, item.personagem) : null
                const coins = item.moedas ? Object.fromEntries(MADDOX_COIN_KEYS.filter((key) => (item.moedas?.[key] ?? 0) > 0).map((key) => [key, item.moedas![key]!])) : null
                if (item.tipo === "moedas" && (!coins || !Object.keys(coins).length)) throw new MaddoxToolError("Recompensa em moedas sem valor: informe `moedas` (po, pp, pe, pc ou pl).")
                if (item.tipo === "item" && !item.item?.trim()) throw new MaddoxToolError("Recompensa do tipo item sem `item`: informe o nome do item.")
                if (item.tipo === "outro" && !item.descricao?.trim()) throw new MaddoxToolError("Recompensa do tipo outro sem `descricao`.")
                rewards.push({
                    kind: item.tipo,
                    description: fit.fit("recompensas.descricao", item.descricao ?? item.item ?? ""),
                    characterId: target ? String(target._id) : null,
                    characterName: target?.name ?? null,
                    coins: item.tipo === "moedas" ? coins : null,
                    item: item.tipo === "item" ? { ref: clip(item.item, MADDOX_TOOL_NAME_MAX), quantity: item.quantidade ?? 1 } : null,
                })
            }
            const characterStates = (input.estadoPersonagens ?? []).map((item) => {
                const target = findCharacter(characters, item.personagem)
                return { characterId: String(target._id), characterName: target.name, condition: fit.fit("estadoPersonagens.condicao", item.condicao) }
            })
            const added = addDraftCombat(String(context.campaignId), context.jobId!, {
                type: "end",
                outcome: input.resultado,
                summary: fit.fit("resumo", input.resumo),
                masterNotes: fit.fit("notasMestre", input.notasMestre),
                combatants: (input.adversarios ?? []).map((item) => ({ name: item.nome, outcome: item.desfecho })),
                rewards,
                characterStates,
                finalScene: fit.fit("cenaFinal", input.cenaFinal),
            })
            if (!added) throw new MaddoxToolError("Esta narração já terminou.")
            return { ended: true, title: state.title, rewards: rewards.length, note: "Narre o desfecho e termine num ponto de decisão.", ...fit.notice() }
        },
    }),
]

// ── Combate tático (Maddox 7) ──────────────────────────────────────────────────

/** Só nas narrações dos graus táticos; erro do combate vira mensagem em pt-BR para o modelo. */
async function tacticalTool<T>(context: MaddoxToolContext, run: (tactical: typeof import("./tactical-master")) => Promise<T>): Promise<T> {
    const campaign = await MaddoxCampaignModel.findById(context.campaignId).select("rigor").lean<Pick<IMaddoxCampaign, "rigor">>()
    if (!campaign || !MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor)) throw new MaddoxToolError("Esta campanha não usa combate tático: narre o combate sem rolagens dos adversários.")
    if (!context.jobId) throw new MaddoxToolError("A vez dos adversários só acontece na narração do turno do mestre.")
    const tactical = await import("./tactical-master")
    try {
        return await run(tactical)
    } catch (error) {
        if (error instanceof tactical.TacticalToolError) throw new MaddoxToolError(error.message)
        throw error
    }
}

const conditionNames = MADDOX_CONDITIONS.map((key) => MADDOX_CONDITION_LABELS[key]).join(", ")

export const MADDOX_TACTICAL_TOOLS: readonly MaddoxMasterTool[] = [
    define({
        name: "monster_action",
        description: [
            "Combate tático: um adversário age na vez dele usando uma ação do PRÓPRIO bloco (veja get_combat). O SERVIDOR rola o ataque contra a CA do alvo e o dano,",
            "ou o dano e as salvaguardas (os jogadores rolam as deles), e aplica o resultado. Nunca invente números: narre o que o retorno disser.",
            "Conduza os adversários na ordem de \"agemAgora\"; Ataques Múltiplos = chame de novo com o mesmo adversário. `reacao: true` = ataque de oportunidade (fora da vez).",
            "Se o retorno disser que alguém pode reagir ou precisa rolar, narre até ali e PARE.",
        ].join(" "),
        readOnly: false,
        input: z.object({
            combatente: z.string().min(1).describe("Nome do adversário (como em get_combat)"),
            acao: z.string().min(1).describe("Nome da ação do bloco"),
            alvos: z.array(z.string().min(1)).max(MADDOX_COMBAT_TARGETS_MAX).describe("Alvo(s): um para ataque; vários para área"),
            modo: z.enum(["normal", "vantagem", "desvantagem"]).optional().describe("Vantagem ou desvantagem pela situação (as das condições o servidor já aplica)"),
            reacao: z.boolean().optional().describe("Ataque de oportunidade ou outra reação, fora da vez do adversário"),
        }),
        async execute(context, input) {
            return tacticalTool(context, (tactical) => tactical.monsterAction(context.campaignId, context.jobId!, context.turnNumber, input))
        },
    }),
    define({
        name: "apply_effect",
        description: `Combate tático: aplica um efeito que você adjudicou (ambiente, magia utilitária, ação livre aceita, fim de uma condição). Condição (${conditionNames}) com duração em rodadas, ou dano/cura em DADOS que o servidor rola. Dano causado por um personagem jogador usa request_damage_roll (o jogador rola).`,
        readOnly: false,
        input: z.object({
            alvo: z.string().min(1),
            condicao: z.string().optional().describe("Condição a aplicar (ou remover com `remover: true`)"),
            remover: z.boolean().optional(),
            duracaoRodadas: z.number().int().min(1).max(100).optional(),
            dano: z.string().optional().describe("Dados de dano (\"2d6\")"),
            tipoDano: z.string().optional(),
            cura: z.string().optional().describe("Dados de cura (\"1d8+3\")"),
            descricao: z.string().min(1).describe("O que causa o efeito (os jogadores leem)"),
        }),
        async execute(context, input) {
            return tacticalTool(context, (tactical) => tactical.applyEffect(context.campaignId, context.jobId!, context.turnNumber, input))
        },
    }),
    define({
        name: "request_damage_roll",
        description: "Combate tático: pede ao JOGADOR a rolagem de dano de uma ação livre que você aceitou (os dados pelas regras). O resultado entra no alvo e chega na próxima mensagem; narre até o golpe e PARE.",
        readOnly: false,
        input: z.object({
            personagem: z.string().min(1),
            dados: z.string().min(1).describe("Dados de dano (\"1d8+3\")"),
            tipoDano: z.string().optional(),
            alvo: z.string().min(1).describe("Adversário que recebe o dano"),
            motivo: z.string().min(1).describe("O que o personagem fez, curto (os jogadores leem)"),
        }),
        async execute(context, input) {
            return tacticalTool(context, (tactical) => tactical.requestDamageRoll(context.campaignId, context.jobId!, context.turnNumber, input))
        },
    }),
    define({
        name: "offer_reaction",
        description:
            "Combate tático: abre a janela de reação dos personagens quando o gatilho acontece — um adversário sai do alcance deles (ataque de oportunidade), conjura uma magia (Contramágica) ou dispara uma ação preparada. Narre até o gatilho e PARE; a escolha chega na próxima mensagem. (Ataques que atingem um personagem já abrem a reação sozinhos.)",
        readOnly: false,
        input: z.object({
            personagens: z.array(z.string().min(1)).min(1).max(MADDOX_COMBAT_TARGETS_MAX),
            gatilho: z.enum(["saiu-do-alcance", "conjura-magia", "preparada", "outro"]),
            descricao: z.string().min(1).describe("O que está acontecendo (os jogadores leem)"),
            fonte: z.string().optional().describe("Adversário que provocou o gatilho (obrigatório em saiu-do-alcance)"),
        }),
        async execute(context, input) {
            return tacticalTool(context, (tactical) => tactical.offerReaction(context.campaignId, context.jobId!, context.turnNumber, input))
        },
    }),
]

// ── Imagens nas cenas (Maddox 10) ──────────────────────────────────────────────

export const MADDOX_SCENE_IMAGE_TOOL_NAME = "request_scene_image"

const keyList = (values: readonly string[]) => values.join(", ") || "nenhum"

/**
 * Ferramenta da imagem da cena: o Maddox pede quando a narração é uma das situações ativas. O servidor confere situação,
 * chave da campanha, Gerador e frequência (recusa com o motivo, sem gravar) e quem aparece (nome desconhecido = erro com as
 * opções). O pedido fica no job e só vira imagem depois que a narração é gravada.
 */
export const MADDOX_SCENE_IMAGE_TOOLS: readonly MaddoxMasterTool[] = [
    define({
        name: MADDOX_SCENE_IMAGE_TOOL_NAME,
        description: [
            'Pede uma ILUSTRAÇÃO da cena desta narração, quando ela for uma das situações de imagem ativas (lista nas instruções, seção "Imagens da cena").',
            "Uma por narração. Descreva o que os jogadores VEEM (lugar, luz, clima, quem aparece, posições, ação), sem segredos do mestre.",
            "Informe quem aparece (personagens e NPCs pelo nome exato; entidades do catálogo por tipo e id): a aparência cadastrada deles entra como referência.",
            "Na descricaoVisual, a aparência dos personagens segue o perfil e a ficha: não invente cor de cabelo, olhos ou pele que não esteja registrada.",
            "Fim de batalha gera imagem sozinho (pela cenaFinal do end_combat) e retrato de NPC é pelo save_npc { gerarRetrato }.",
        ].join(" "),
        readOnly: false,
        input: z.object({
            situacao: z.string().min(1).describe("Chave da situação ativa (ex.: new-location, climax ou o id de uma personalizada)"),
            descricaoVisual: z.string().min(1).describe("A cena em detalhe para o ilustrador, em português, só o que os jogadores veem"),
            legenda: z.string().optional().describe(`Uma frase curta para os jogadores (até uns ${MADDOX_SCENE_IMAGE_CAPTION_GUIDE} caracteres)`),
            personagens: z.array(z.string().min(1)).max(10).optional().describe("Nomes exatos dos personagens jogadores que aparecem"),
            npcs: z.array(z.string().min(1)).max(10).optional().describe("Nomes exatos dos NPCs (conhecidos pelos jogadores) que aparecem"),
            catalogo: z
                .array(z.object({ tipo: catalogEntityTypeSchema, id: z.string().trim().min(1).max(200) }))
                .max(6)
                .optional()
                .describe("Entidades do catálogo que aparecem (monstros, itens…), por tipo e id de search_catalog"),
        }),
        async execute(context, input) {
            const meta = context.jobId ? maddoxJobMeta(String(context.campaignId), context.jobId) : null
            if (!meta || meta.kind !== "narration") throw new MaddoxToolError("Imagens só são pedidas na narração do turno do mestre.")
            if (jobDraftSceneImage(String(context.campaignId), context.jobId!)) throw new MaddoxToolError("Já existe uma imagem pedida nesta narração: uma por narração.")
            if (input.situacao === "combat-end") throw new MaddoxToolError("O fim de batalha gera imagem sozinho pela cenaFinal do end_combat: não peça por aqui.")
            if (input.situacao === "npc-portrait") throw new MaddoxToolError("Retrato de NPC é pedido pelo save_npc com gerarRetrato: true.")
            const { checkSceneImageRequest, loadSceneImageEnvironment } = await import("./scene-images")
            const decision = await checkSceneImageRequest({ campaignId: context.campaignId, source: "tool", turnNumber: context.turnNumber, situation: input.situacao }, await loadSceneImageEnvironment())
            if (!decision.ok) throw new MaddoxToolError(`Imagem não pedida: ${decision.reason} Continue a narração sem ela.`)

            const characters = await MaddoxCharacterModel.find({ campaignId: context.campaignId, status: "active", "interview.status": "done" }).select("name").lean<{ name: string }[]>()
            const knownCharacters = new Map(characters.map((item) => [keyOf(item.name), item.name]))
            const missingCharacters = (input.personagens ?? []).filter((name) => !knownCharacters.has(keyOf(name)))
            if (missingCharacters.length) throw new MaddoxToolError(`Personagem desconhecido: ${missingCharacters.join(", ")}. Personagens: ${keyList(characters.map((item) => item.name))}.`)
            const npcs = await MaddoxNpcModel.find({ campaignId: context.campaignId, visibility: "players" }).select("name").lean<{ name: string }[]>()
            const knownNpcs = new Map(npcs.map((item) => [keyOf(item.name), item.name]))
            const missingNpcs = (input.npcs ?? []).filter((name) => !knownNpcs.has(keyOf(name)))
            if (missingNpcs.length) throw new MaddoxToolError(`NPC desconhecido dos jogadores: ${missingNpcs.join(", ")}. NPCs conhecidos: ${keyList(npcs.map((item) => item.name))}. Registre com save_npc (visibility players) antes, se for o caso.`)
            const catalog = input.catalogo ?? []
            if (catalog.length) {
                const { getCatalogEntity } = await import("@/features/mcp/server/catalog-entity-service")
                for (const ref of catalog) {
                    if (!(await getCatalogEntity({ type: ref.tipo, id: ref.id }))) throw new MaddoxToolError(`${ref.tipo} "${ref.id}" não está no catálogo. Confirme o id com search_catalog.`)
                }
            }
            const fit = fitter()
            const stored = setDraftSceneImage(String(context.campaignId), context.jobId!, {
                situation: input.situacao,
                description: fit.fit("descricaoVisual", input.descricaoVisual, MADDOX_SCENE_IMAGE_DESCRIPTION_MAX),
                caption: fit.fit("legenda", input.legenda, MADDOX_SCENE_IMAGE_CAPTION_MAX),
                characters: [...new Set((input.personagens ?? []).map((name) => knownCharacters.get(keyOf(name))!))],
                npcs: [...new Set((input.npcs ?? []).map((name) => knownNpcs.get(keyOf(name))!))],
                catalog: catalog.map((ref) => ({ type: ref.tipo, id: ref.id })),
            })
            if (!stored) throw new MaddoxToolError("Esta narração já terminou.")
            return { requested: true, note: "A imagem é pintada depois que a narração for gravada. Continue a narração normalmente, sem citar a imagem.", ...fit.notice() }
        },
    }),
]

export const MADDOX_ACTION_OPTIONS_TOOL_NAME = "suggest_actions"

/**
 * Sugestões de ação (DND-30): ao terminar a narração no ponto de decisão, o Maddox sugere algumas ações curtas para cada
 * personagem; cada jogador vê as do próprio personagem abaixo da narração e pode declarar uma com um clique. Só na narração
 * do turno do mestre e fora do combate tático (lá a vez é pelos botões). O pedido fica no job e é gravado com a narração.
 * Texto longo é cortado no teto de proteção (nunca recusa por tamanho); chamar de novo substitui a lista do personagem.
 */
export const MADDOX_ACTION_OPTIONS_TOOLS: readonly MaddoxMasterTool[] = [
    define({
        name: MADDOX_ACTION_OPTIONS_TOOL_NAME,
        description: [
            "Sugere ações para os jogadores declararem no próximo turno, mostradas como atalhos abaixo desta narração (cada jogador vê só as do próprio personagem).",
            `Chame no fim da narração, quando ela terminar num ponto de decisão: 2 a ${MADDOX_ACTION_OPTIONS_MAX} ações curtas (até uns ${MADDOX_ACTION_OPTION_GUIDE} caracteres), plausíveis, variadas e coerentes com a cena, escritas em primeira pessoa como o jogador declararia ("Examino a porta em busca de armadilhas").`,
            "Uma entrada por personagem (nome exato). Não cite as sugestões na narração. Chamar de novo substitui as sugestões do personagem.",
        ].join(" "),
        readOnly: false,
        input: z.object({
            opcoes: z
                .array(
                    z.object({
                        personagem: z.string().min(1).describe("Nome exato do personagem jogador"),
                        acoes: z.array(z.string()).min(1).describe(`De 2 a ${MADDOX_ACTION_OPTIONS_MAX} ações curtas para esse personagem declarar`),
                    }),
                )
                .min(1)
                .max(10)
                .describe("Sugestões por personagem"),
        }),
        async execute(context, input) {
            const meta = context.jobId ? maddoxJobMeta(String(context.campaignId), context.jobId) : null
            if (!meta || meta.kind !== "narration") throw new MaddoxToolError("Sugestões de ação só são dadas na narração do turno do mestre.")
            const campaign = await MaddoxCampaignModel.findById(context.campaignId).select("rigor").lean<Pick<IMaddoxCampaign, "rigor">>()
            if (campaign && MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor)) {
                const { findActiveTactical } = await import("./tactical-combat")
                if (await findActiveTactical(context.campaignId)) throw new MaddoxToolError("No combate tático a vez é pelos botões de ação: não sugira ações agora.")
            }
            const characters = await MaddoxCharacterModel.find({ campaignId: context.campaignId, status: "active", "interview.status": "done" }).select("name memberId").lean<Pick<IMaddoxCharacter, "_id" | "name" | "memberId">[]>()
            const byKey = new Map(characters.map((item) => [keyOf(item.name), item]))
            const missing = input.opcoes.map((entry) => entry.personagem).filter((name) => !byKey.has(keyOf(name)))
            if (missing.length) throw new MaddoxToolError(`Personagem desconhecido: ${missing.join(", ")}. Personagens: ${keyList(characters.map((item) => item.name))}.`)
            const cut: string[] = []
            const saved: { personagem: string; acoes: number }[] = []
            for (const entry of input.opcoes) {
                const character = byKey.get(keyOf(entry.personagem))!
                const seen = new Set<string>()
                const options: string[] = []
                for (const raw of entry.acoes) {
                    const text = raw.trim().replace(/\s+/g, " ")
                    if (!text) continue
                    if (text.length > MADDOX_ACTION_OPTION_TEXT_MAX && !cut.includes(character.name)) cut.push(character.name)
                    const option = clip(text, MADDOX_ACTION_OPTION_TEXT_MAX)
                    const key = option.toLocaleLowerCase("pt-BR")
                    if (seen.has(key)) continue
                    seen.add(key)
                    options.push(option)
                    if (options.length >= MADDOX_ACTION_OPTIONS_MAX) break
                }
                if (!options.length) continue
                const stored = setDraftActionOptions(String(context.campaignId), context.jobId!, { memberId: String(character.memberId), characterId: String(character._id), characterName: character.name, options })
                if (!stored) throw new MaddoxToolError("Esta narração já terminou.")
                saved.push({ personagem: character.name, acoes: options.length })
            }
            if (!saved.length) throw new MaddoxToolError("Nenhuma ação sugerida: envie ao menos uma ação com texto para cada personagem.")
            return {
                saved,
                note: `No máximo ${MADDOX_ACTION_OPTIONS_MAX} ações por personagem (as repetidas saem). Continue sem citar as sugestões na narração.`,
                ...(cut.length ? { truncated: cut, aviso: `Ações acima de ${MADDOX_ACTION_OPTION_TEXT_MAX} caracteres foram cortadas (${cut.join(", ")}): prefira ações curtas.` } : {}),
            }
        },
    }),
]


// ── NPCs Opex (DND-27) ─────────────────────────────────────────────────────────

export const MADDOX_OPEX_NPC_CONSULT_TOOL_NAME = "consultar_npc_opex"
export const MADDOX_OPEX_NPC_TOOL_NAMES = ["promover_npc_opex", "desfazer_npc_opex", "gravar_memoria_npc_opex", MADDOX_OPEX_NPC_CONSULT_TOOL_NAME] as const

/** Recusas do domínio (`DomainError`) viram mensagem para o narrador. */
async function opexNpcCall<T>(work: () => Promise<T>): Promise<T> {
    try {
        return await work()
    } catch (error) {
        const { DomainError } = await import("@/lib/api/route")
        if (error instanceof DomainError) throw new MaddoxToolError(error.message)
        throw error
    }
}

/** NPC Opex vivo pelo nome (recusa inexistente, que não é Opex e morto). */
async function loadOpexNpc(context: MaddoxToolContext, name: string): Promise<IMaddoxNpc> {
    const npc = await MaddoxNpcModel.findOne({ campaignId: context.campaignId, nameKey: keyOf(clip(name, MADDOX_TOOL_NAME_MAX)) }).lean<IMaddoxNpc>()
    if (!npc) {
        const opex = await MaddoxNpcModel.find({ campaignId: context.campaignId, "opex.active": true }).select("name").lean<{ name: string }[]>()
        throw new MaddoxToolError(`Nenhum NPC chamado "${name}" nesta campanha. NPCs Opex: ${keyList(opex.map((item) => item.name))}.`)
    }
    if (!npc.opex?.active) throw new MaddoxToolError(`${npc.name} não é NPC Opex: decida você o que ele fala e faz.`)
    if (npc.status === "dead") throw new MaddoxToolError(`${npc.name} está morto.`)
    return npc
}

export interface OpexNpcConsultResult {
    npc: string
    fala?: string
    acao?: string
    falhou?: true
    nota: string
}

const opexNpcFallbackNote = (name: string) => `O NPC Opex não respondeu: decida você o que ${name} fala e faz nesta narração.`

/**
 * Ferramentas dos NPCs Opex: promover e desfazer (o Maddox julga a importância do NPC), gravar memória fora de cena (sem
 * acionar o agente) e consultar o agente do NPC (só nas narrações: nas respostas a perguntas o Maddox decide sozinho).
 */
export const MADDOX_OPEX_NPC_TOOLS: readonly MaddoxMasterTool[] = [
    define({
        name: "promover_npc_opex",
        description: [
            "Promove um NPC já registrado (save_npc) a NPC Opex: ele ganha um agente de IA próprio, com memória própria, que decide o que fala e faz nas narrações em que aparece e na vez dele no combate tático.",
            "Use só para NPCs importantes ou recorrentes para a campanha (um aliado central, o vilão principal). Vale também para NPCs que os jogadores ainda não conhecem.",
            "Recusa NPC inexistente, morto, campanha encerrada e o limite de NPCs Opex da configuração. Não cite a promoção na narração.",
        ].join(" "),
        readOnly: false,
        input: z.object({ npc: z.string().min(1).describe("Nome do NPC") }),
        async execute(context, input) {
            const { promoteOpexNpc } = await import("./opex-npcs")
            const { MADDOX_OPEX_NPC_SYSTEM_ACTOR } = await import("../constants")
            const result = await opexNpcCall(() => promoteOpexNpc(context.campaignId, { name: input.npc }, MADDOX_OPEX_NPC_SYSTEM_ACTOR))
            if (result.alreadyOpex) return { npc: result.npc.name, jaOpex: true, nota: `${result.npc.name} já é NPC Opex: nada mudou.` }
            return {
                npc: result.npc.name,
                promovido: true,
                nota: `${result.npc.name} agora é NPC Opex: nas próximas narrações em que ele aparecer, consulte-o com ${MADDOX_OPEX_NPC_CONSULT_TOOL_NAME} antes de narrar o que ele fala e faz.`,
            }
        },
    }),
    define({
        name: "desfazer_npc_opex",
        description: "Desfaz um NPC Opex: o agente dele é desligado, as memórias individuais são arquivadas (voltam numa nova promoção) e você volta a narrá-lo sozinho. NPC Opex que morre deixa de ser Opex sozinho.",
        readOnly: false,
        input: z.object({ npc: z.string().min(1).describe("Nome do NPC") }),
        async execute(context, input) {
            const { retireOpexNpc } = await import("./opex-npcs")
            const { MADDOX_OPEX_NPC_SYSTEM_ACTOR } = await import("../constants")
            const result = await opexNpcCall(() => retireOpexNpc(context.campaignId, { name: input.npc }, "maddox", MADDOX_OPEX_NPC_SYSTEM_ACTOR))
            if (result.notOpex) return { npc: result.npc.name, naoOpex: true, nota: `${result.npc.name} não é NPC Opex: nada mudou.` }
            return { npc: result.npc.name, desfeito: true, nota: `${result.npc.name} deixou de ser NPC Opex: você volta a narrá-lo sozinho.` }
        },
    }),
    define({
        name: "gravar_memoria_npc_opex",
        description:
            "Grava uma memória no canal individual de um NPC Opex SEM acionar o agente dele: algo que ele soube ou viveu fora de cena (ex.: \"seus espiões contaram que o grupo chegou a Vallaki\"). Vale na próxima consulta. O mesmo título atualiza a memória, sem duplicar.",
        readOnly: false,
        input: z.object({
            npc: z.string().min(1).describe("Nome do NPC Opex"),
            titulo: z.string().min(1).describe("Título curto e estável do assunto"),
            texto: z.string().min(1).describe("O que o NPC passa a saber, do ponto de vista dele"),
        }),
        async execute(context, input) {
            const npc = await loadOpexNpc(context, input.npc)
            const fit = fitter()
            const { saveOpexNpcMemories } = await import("@/features/engramind/server/opex-npcs")
            const { MADDOX_OPEX_MEMORY_TITLE_MAX } = await import("../constants")
            const result = await saveOpexNpcMemories({ campaignId: String(context.campaignId), npcId: String(npc._id), npcName: npc.name }, [{ title: clip(input.titulo, MADDOX_OPEX_MEMORY_TITLE_MAX), text: fit.fit("texto", input.texto) }], "Maddox")
            if (!result.saved && !result.pending) return { npc: npc.name, gravada: false, nota: "A rede de memórias não está configurada: a memória não foi gravada. Siga sem ela." }
            return { npc: npc.name, gravada: true, ...(result.pending ? { nota: "A rede de memórias está fora: a memória fica na fila e entra quando ela voltar." } : {}), ...fit.notice() }
        },
    }),
    define({
        name: MADDOX_OPEX_NPC_CONSULT_TOOL_NAME,
        description: [
            "Consulta o agente de um NPC Opex: ele decide o que o NPC fala e faz nesta cena. Chame ANTES de narrar a fala ou a ação de um NPC Opex que aparece ou interage com os personagens, e narre a partir da decisão (você resolve os resultados).",
            "Em `situacao`, conte o que o NPC percebe da cena agora (sem segredos que ele não saberia). Só nas narrações.",
        ].join(" "),
        readOnly: false,
        input: z.object({
            npc: z.string().min(1).describe("Nome do NPC Opex"),
            situacao: z.string().min(1).describe("O contexto da cena que o NPC percebe agora"),
            pergunta: z.string().optional().describe("Pergunta direta ao NPC (opcional)"),
        }),
        async execute(context, input): Promise<OpexNpcConsultResult> {
            const meta = context.jobId ? maddoxJobMeta(String(context.campaignId), context.jobId) : null
            if (!meta || meta.kind !== "narration") throw new MaddoxToolError("Nas respostas a perguntas, decida você mesmo pelo NPC.")
            const npc = await loadOpexNpc(context, input.npc)
            const campaignId = String(context.campaignId)
            const npcId = String(npc._id)
            const cached = jobOpexNpcConsult<OpexNpcConsultResult>(campaignId, context.jobId!, npcId)
            if (cached) return cached
            const { MADDOX_OPEX_NPC_CONSULTS_PER_NARRATION } = await import("../constants")
            if (jobOpexNpcConsultCount(campaignId, context.jobId!) >= MADDOX_OPEX_NPC_CONSULTS_PER_NARRATION) {
                throw new MaddoxToolError(`Limite de ${MADDOX_OPEX_NPC_CONSULTS_PER_NARRATION} consultas a NPCs Opex por narração atingido: decida você o que ${npc.name} fala e faz.`)
            }
            const campaign = await MaddoxCampaignModel.findById(context.campaignId).select("name rigor setting openingSituation state").lean<IMaddoxCampaign>()
            if (!campaign) throw new MaddoxToolError("Campanha não encontrada.")
            let result: OpexNpcConsultResult
            try {
                const { decideOpexNpcScene } = await import("./opex-player")
                const decision = await decideOpexNpcScene(campaign, npc, { situation: clip(input.situacao, MADDOX_TOOL_TEXT_MAX), question: input.pergunta ? clip(input.pergunta, MADDOX_TOOL_TEXT_MAX) : null })
                result = { npc: npc.name, fala: decision.fala.trim(), acao: decision.acao.trim(), nota: `Narre a partir desta decisão de ${npc.name}: ele diz e tenta exatamente isso; você resolve os resultados.` }
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                log.warn({ campaignId, npcId, err: reason }, "[maddox] o agente do NPC Opex não respondeu")
                addDraftOpexNpcFailure(campaignId, context.jobId!, { npcId, npcName: npc.name, error: reason.slice(0, 500) })
                result = { npc: npc.name, falhou: true, nota: opexNpcFallbackNote(npc.name) }
            }
            setJobOpexNpcConsult(campaignId, context.jobId!, npcId, result)
            return result
        },
    }),
]

/** Todas as ferramentas do narrador (persistência, testes, combate, a vez dos adversários, a imagem da cena e as sugestões de ação). */
export const MADDOX_NARRATOR_TOOLS: readonly MaddoxMasterTool[] = [...MADDOX_MASTER_TOOLS, ...MADDOX_COMBAT_TOOLS, ...MADDOX_TACTICAL_TOOLS, ...MADDOX_SCENE_IMAGE_TOOLS, ...MADDOX_ACTION_OPTIONS_TOOLS, ...MADDOX_OPEX_NPC_TOOLS]

export function findMaddoxTool(name: string): MaddoxMasterTool | undefined {
    return MADDOX_NARRATOR_TOOLS.find((tool) => tool.name === name)
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

/** Ferramenta dos testes (Maddox 5): só oferecida à AI SDK nas narrações dos graus com ficha. */
export const MADDOX_CHECK_TOOL_NAME = "request_check"

/**
 * Ferramentas no formato da AI SDK (a SDK `ai` entra sob demanda). `checks: false` tira o `request_check`; `combat: false`
 * tira as do combate (Maddox 6); `tactical: false` tira as da vez dos adversários (Maddox 7); `sceneImages: false` tira a da
 * imagem da cena (Maddox 10); `actionOptions: false` tira a das sugestões de ação (DND-30); `opexNpcs: false` tira a consulta
 * aos NPCs Opex (DND-27; respostas a perguntas).
 */
export async function buildMaddoxAiTools(context: MaddoxToolContext, options: { checks?: boolean; combat?: boolean; tactical?: boolean; sceneImages?: boolean; actionOptions?: boolean; opexNpcs?: boolean } = {}): Promise<ToolSet> {
    const { dynamicTool } = await import("ai")
    const tools: ToolSet = {}
    for (const def of MADDOX_NARRATOR_TOOLS) {
        if (def.name === MADDOX_CHECK_TOOL_NAME && !options.checks) continue
        if ((MADDOX_COMBAT_TOOL_NAMES as readonly string[]).includes(def.name) && !options.combat) continue
        if ((MADDOX_TACTICAL_TOOL_NAMES as readonly string[]).includes(def.name) && !options.tactical) continue
        if (def.name === MADDOX_SCENE_IMAGE_TOOL_NAME && !options.sceneImages) continue
        if (def.name === MADDOX_ACTION_OPTIONS_TOOL_NAME && !options.actionOptions) continue
        if (def.name === MADDOX_OPEX_NPC_CONSULT_TOOL_NAME && !options.opexNpcs) continue
        tools[def.name] = dynamicTool({
            description: def.description,
            inputSchema: def.input,
            execute: async (input: unknown) => runMaddoxTool(def, context, input),
        })
    }
    // Consulta ao catálogo (só leitura), em todos os graus.
    const { buildCatalogAiTools } = await import("./catalog-tools")
    return { ...tools, ...(await buildCatalogAiTools()) }
}
