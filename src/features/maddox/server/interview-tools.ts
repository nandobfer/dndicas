import { z } from "zod"
import { Types } from "mongoose"
import type { ToolSet } from "ai"
import { loggerFor } from "@/lib/logger"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import {
    MADDOX_ABILITY_BONUS_MAX,
    MADDOX_CATALOG_ORIGIN_RIGORS,
    MADDOX_CATALOG_TOOL_NAMES,
    MADDOX_INTERVIEW_TOOL_NAMES,
    MADDOX_SHEET_RIGORS,
    MADDOX_TOOL_TEXT_MAX,
    MADDOX_WORLD_CATALOG_RIGORS,
    MADDOX_WORLD_OPTIONS_MAX,
    type MaddoxRigorLevel,
    type MaddoxScriptKind,
} from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { MaddoxCampaignModel, MaddoxInterviewModel, type IMaddoxAbilityBonus, type IMaddoxAbilityScoresCard, type IMaddoxInterview } from "../models"
import { ABILITY_BY_LABEL, ABILITY_KEYS, ABILITY_LABEL_LIST, abilityMethodLabel, finalScores, rolledScores, scoresLine, validateBonus, type AbilityScores } from "../interview-scores"
import { MADDOX_ABILITY_LABELS } from "../check-modifier"
import { latestAbilityCard, latestHitPointsCard } from "./interview-cards"
import { BUILD_TOOL_DESCRIPTIONS, MaddoxBuildToolError, catalogNames, emptyBuild, findCatalogEntity, getCharacterBuild, loadBuildCatalog, updateBuildInput, updateCharacterBuild, type UpdateBuildInput } from "./character-build"
import { worldCatalogLines, worldCatalogOf, type WorldCatalog, type WorldCatalogRef } from "../world-catalog"

/**
 * Ferramentas do entrevistador (Maddox 5) — SOMENTE servidor. Atributos do personagem pelo card: abrir/reabrir
 * (`request_ability_scores`), consultar (`get_ability_scores`) e aplicar o bônus do antecedente
 * (`apply_ability_bonus`). Definidas uma vez e expostas à AI SDK (provedores diretos) e ao MCP do Maddox (OpenCode).
 * Só valem enquanto a geração que as recebeu estiver rodando (a trava `generating.token` da entrevista).
 *
 * O card pedido numa fala fica num rascunho em memória (a instância é única) até a fala ser gravada: se a geração
 * falhar, o pedido some com ela.
 */

const log = loggerFor({ module: "maddox", feature: "interview-tools" })

export interface InterviewToolContext {
    interviewId: Types.ObjectId
    /** Trava da geração em andamento (`generating.token`). */
    lockToken: string
}

export interface InterviewToolDraft {
    card: { reason: string | null; prefill: IMaddoxAbilityScoresCard["prefill"]; bonus: IMaddoxAbilityBonus | null } | null
    /** O Maddox pediu nova rolagem: as rolagens gravadas são apagadas quando a fala for gravada. */
    resetRolls: boolean
    /** Card de PV pedido nesta fala (personagem acima do nível 1). */
    hitPoints?: { reason: string | null; level: number; hitDie: string } | null
}

const drafts = ((globalThis as unknown as { __maddoxInterviewDrafts?: Map<string, InterviewToolDraft> }).__maddoxInterviewDrafts ??= new Map())

function draftOf(lockToken: string): InterviewToolDraft {
    let draft = drafts.get(lockToken)
    if (!draft) {
        draft = { card: null, resetRolls: false, hitPoints: null }
        drafts.set(lockToken, draft)
    }
    return draft
}

/** Retira (e apaga) o rascunho da geração. */
export function takeInterviewDraft(lockToken: string): InterviewToolDraft | null {
    const draft = drafts.get(lockToken) ?? null
    drafts.delete(lockToken)
    return draft
}

export class MaddoxInterviewToolError extends Error {}

export interface MaddoxInterviewTool {
    name: string
    description: string
    input: z.ZodObject<z.ZodRawShape>
    readOnly: boolean
    /** Entrevista em que a ferramenta vale: personagem (graus com ficha) ou cenário (Fiel ao D&D). */
    scope: MaddoxScriptKind
    execute: (context: InterviewToolContext, input: never) => Promise<unknown>
}

export { abilityCardAwaitingFirstSubmit, latestAbilityCard, submittedAbilityCard } from "./interview-cards"

const rollsState = (doc: Pick<IMaddoxInterview, "abilityRolls">) => (doc.abilityRolls ? { scores: doc.abilityRolls.rolls.map((roll) => roll.score), sixth: doc.abilityRolls.sixth, invalid: doc.abilityRolls.invalid } : null)

/** Situação dos atributos para o prompt de cada turno. */
export function abilityStatusText(doc: Pick<IMaddoxInterview, "messages" | "abilityRolls">): string {
    const latest = latestAbilityCard(doc.messages)
    if (!latest) return "Card de atributos ainda não aberto: abra com `request_ability_scores` quando chegar a hora dos atributos."
    const { card } = latest
    if (card.status === "pending") {
        const rolled = rolledScores(rollsState(doc))
        return `Card de atributos aberto, aguardando o jogador${rolled.length ? ` (rolagens feitas: ${rolled.join(", ")})` : ""}.`
    }
    const base = card.base as AbilityScores
    const bonus = card.bonus ? ` Bônus do antecedente (${card.bonus.background}) aplicado.` : " Bônus do antecedente ainda não aplicado."
    return `Atributos enviados (${abilityMethodLabel(card.method!)}): ${scoresLine(base, card.bonus?.parts)}.${bonus}`
}

async function loadActive(context: InterviewToolContext): Promise<IMaddoxInterview & { rigor: MaddoxRigorLevel; startingLevel: number | null }> {
    const doc = await MaddoxInterviewModel.findOne({ _id: context.interviewId, "generating.token": context.lockToken }).lean<IMaddoxInterview>()
    if (!doc) throw new MaddoxInterviewToolError("Esta resposta da entrevista já terminou: as ferramentas só funcionam durante a geração.")
    if (doc.kind !== "character") throw new MaddoxInterviewToolError("Os atributos só existem na entrevista de personagem.")
    const campaign = await MaddoxCampaignModel.findById(doc.campaignId).select("rigor startingLevel").lean<{ rigor: (typeof MADDOX_SHEET_RIGORS)[number]; startingLevel?: number | null }>()
    if (!campaign || !MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new MaddoxInterviewToolError("Este grau de rigor não usa atributos: o personagem é só narrativo.")
    return { ...doc, rigor: campaign.rigor, startingLevel: campaign.startingLevel ?? null }
}

interface CatalogOrigin {
    name: string
    originalName?: string
    suggestedAttributes?: string[]
}

/** Origens ATIVAS do catálogo (são poucas: só nome, nome original e atributos sugeridos). */
async function activeOrigins(): Promise<CatalogOrigin[]> {
    const { BackgroundModel } = await import("@/features/backgrounds/models/background")
    return BackgroundModel.find({ status: "active" }).select("name originalName suggestedAttributes").sort({ name: 1 }).lean<CatalogOrigin[]>()
}

/** Antecedente do catálogo pelo nome ou nome original, ignorando acento, caixa e espaços. Só origens ativas. */
export async function findBackground(name: string): Promise<{ name: string; suggested: AttributeType[] } | null> {
    const wanted = normalizeCatalogName(name)
    if (!wanted) return null
    const found = (await activeOrigins()).find((origin) => normalizeCatalogName(origin.name) === wanted || (origin.originalName && normalizeCatalogName(origin.originalName) === wanted))
    if (!found) return null
    return { name: found.name, suggested: (found.suggestedAttributes ?? []).map((label) => ABILITY_BY_LABEL[label]).filter((key): key is AttributeType => Boolean(key)) }
}

/** Erro de origem fora do catálogo nos graus estritos, com as origens disponíveis. */
export async function originNotInCatalogMessage(name: string): Promise<string> {
    const names = (await activeOrigins()).map((origin) => origin.name)
    return `O antecedente “${name.trim()}” não está no catálogo do DnDicas. Origens disponíveis: ${names.join(", ") || "nenhuma"}. Escolha uma delas com o jogador (consulte ${MADDOX_CATALOG_TOOL_NAMES.search}) e aplique o bônus de novo.`
}

const bonusShape = Object.fromEntries(ABILITY_LABEL_LIST.map((label) => [label, z.number().int().min(1).max(MADDOX_ABILITY_BONUS_MAX).optional()]))

export const MADDOX_INTERVIEW_TOOLS: readonly MaddoxInterviewTool[] = [
    {
        name: MADDOX_INTERVIEW_TOOL_NAMES.request,
        description:
            "Abre o card de atributos do personagem para o jogador, abaixo desta fala: ele escolhe conjunto padrão, compra de pontos ou rolagem (rolada pelo próprio jogador no card) e envia. Chame quando chegar a hora dos atributos ou para reabrir (o card vem com os valores atuais). Nunca peça números digitados nem role por conta própria. `novaRolagem: true` apaga as rolagens já feitas (só se for refazer a rolagem).",
        input: z.object({
            motivo: z.string().optional().describe("Frase curta mostrada no card (opcional)"),
            novaRolagem: z.boolean().optional().describe("Apaga as rolagens de 4d6 já feitas"),
        }),
        readOnly: false,
        scope: "character",
        execute: async (context, input: { motivo?: string; novaRolagem?: boolean }) => {
            const doc = await loadActive(context)
            const draft = draftOf(context.lockToken)
            if (input.novaRolagem) {
                draft.resetRolls = true
                log.info({ interviewId: String(context.interviewId) }, "[maddox] entrevistador pediu nova rolagem dos atributos")
            }
            const latest = latestAbilityCard(doc.messages)
            if (draft.card || latest?.card.status === "pending") {
                return { alreadyOpen: true, rollsReset: draft.resetRolls, note: "O card de atributos já está aberto para o jogador: aguarde o envio." }
            }
            const reason = (input.motivo ?? "").trim()
            const truncated = reason.length > MADDOX_TOOL_TEXT_MAX
            const prefill = latest?.card.status === "submitted" && latest.card.base && latest.card.method ? { method: latest.card.method, base: latest.card.base } : null
            draft.card = { reason: reason ? reason.slice(0, MADDOX_TOOL_TEXT_MAX) : null, prefill, bonus: latest?.card.bonus ?? null }
            return {
                opened: true,
                reopened: Boolean(prefill),
                rollsReset: draft.resetRolls,
                note: "O card aparece abaixo desta fala. Explique os três métodos em poucas linhas e aguarde o envio; não peça números digitados.",
                ...(truncated ? { truncated: ["motivo"] } : {}),
            }
        },
    },
    {
        name: MADDOX_INTERVIEW_TOOL_NAMES.get,
        description: "Consulta os atributos do personagem: situação do card, método, valores-base, bônus do antecedente, valores finais e rolagens. Use antes da síntese.",
        input: z.object({}),
        readOnly: true,
        scope: "character",
        execute: async (context) => {
            const doc = await loadActive(context)
            const latest = latestAbilityCard(doc.messages)
            const card = latest?.card ?? null
            const rolls = rollsState(doc)
            const label = (scores: AbilityScores | null) => (scores ? Object.fromEntries(ABILITY_KEYS.map((key) => [MADDOX_ABILITY_LABELS[key], scores[key]])) : null)
            return {
                status: card?.status ?? (drafts.get(context.lockToken)?.card ? "pending" : "none"),
                method: card?.method ? abilityMethodLabel(card.method) : null,
                base: label(card?.base ?? null),
                bonus: card?.bonus ? { antecedente: card.bonus.background, pontos: Object.fromEntries(Object.entries(card.bonus.parts).map(([key, value]) => [MADDOX_ABILITY_LABELS[key as AttributeType], value])) } : null,
                final: card?.base ? label(finalScores(card.base, card.bonus?.parts)) : null,
                rolagens: rolledScores(rolls),
                rolagemInvalida: rolls?.invalid ?? false,
            }
        },
    },
    {
        name: MADDOX_INTERVIEW_TOOL_NAMES.bonus,
        description: `Aplica o bônus do antecedente aos atributos enviados: exatamente 3 pontos, no máximo +${MADDOX_ABILITY_BONUS_MAX} por atributo (+2/+1 ou +1/+1/+1), só nos atributos sugeridos pelo antecedente. Confira a origem antes com ${MADDOX_CATALOG_TOOL_NAMES.search} (tipo Origem): nos graus Rigoroso e Fiel ao D&D ela precisa existir no catálogo; no Equilibrado, uma origem própria aceita os pontos livres. Ex.: { "antecedente": "Criminoso", "bonus": { "Destreza": 2, "Inteligência": 1 } }. Aplicar de novo substitui o bônus anterior.`,
        input: z.object({
            antecedente: z.string().min(1).describe("Nome do antecedente (origem) combinado"),
            bonus: z.object(bonusShape).describe("Pontos por atributo (nome em português)"),
        }),
        readOnly: false,
        scope: "character",
        execute: async (context, input: { antecedente: string; bonus: Record<string, number | undefined> }) => {
            const doc = await loadActive(context)
            const latest = latestAbilityCard(doc.messages)
            if (latest?.card.status !== "submitted" || !latest.card.base) throw new MaddoxInterviewToolError("O jogador ainda não enviou os atributos pelo card: o bônus é aplicado depois do envio.")
            const parts = Object.fromEntries(Object.entries(input.bonus).filter(([, value]) => typeof value === "number").map(([label, value]) => [ABILITY_BY_LABEL[label], value])) as Partial<Record<AttributeType, number>>
            const background = await findBackground(input.antecedente)
            // Graus estritos: origem fora do catálogo é recusada sem gravar (nunca cai na regra livre).
            if (!background && MADDOX_CATALOG_ORIGIN_RIGORS.includes(doc.rigor)) throw new MaddoxInterviewToolError(await originNotInCatalogMessage(input.antecedente))
            const error = validateBonus(parts, background?.suggested ?? [])
            if (error) throw new MaddoxInterviewToolError(error)
            const bonus: IMaddoxAbilityBonus = { background: background?.name ?? input.antecedente.trim().slice(0, 200), parts }
            const saved = await MaddoxInterviewModel.updateOne(
                { _id: context.interviewId, "generating.token": context.lockToken, messages: { $elemMatch: { id: latest.message.id, "abilityScores.status": "submitted" } } },
                { $set: { "messages.$.abilityScores.bonus": bonus } },
            )
            if (saved.matchedCount === 0) throw new MaddoxInterviewToolError("Os atributos mudaram durante esta resposta. Consulte de novo com get_ability_scores.")
            return {
                applied: true,
                antecedente: bonus.background,
                catalogo: Boolean(background),
                ...(background ? {} : { nota: "Origem própria (fora do catálogo): os pontos são livres." }),
                sugeridos: background?.suggested.map((key) => MADDOX_ABILITY_LABELS[key]) ?? [],
                final: scoresLine(latest.card.base, parts),
            }
        },
    },
    {
        name: MADDOX_INTERVIEW_TOOL_NAMES.build,
        description: BUILD_TOOL_DESCRIPTIONS.update,
        input: updateBuildInput,
        readOnly: false,
        scope: "character",
        execute: async (context, input: UpdateBuildInput) => {
            try {
                return await updateCharacterBuild(context, input)
            } catch (error) {
                if (error instanceof MaddoxBuildToolError) throw new MaddoxInterviewToolError(error.message)
                throw error
            }
        },
    },
    {
        name: MADDOX_INTERVIEW_TOOL_NAMES.getBuild,
        description: BUILD_TOOL_DESCRIPTIONS.get,
        input: z.object({}),
        readOnly: true,
        scope: "character",
        execute: async (context) => {
            try {
                return await getCharacterBuild(context)
            } catch (error) {
                if (error instanceof MaddoxBuildToolError) throw new MaddoxInterviewToolError(error.message)
                throw error
            }
        },
    },
    {
        name: MADDOX_INTERVIEW_TOOL_NAMES.hitPoints,
        description:
            "Abre, abaixo desta fala, o card de pontos de vida por nível (personagem acima do nível 1), como o assistente de subir de nível da ficha: em cada nível do 2 em diante o jogador escolhe a média ou rola o dado de vida no card. Chame depois de gravar classe e nível. Reabrir mantém as rolagens já feitas.",
        input: z.object({ motivo: z.string().optional().describe("Frase curta mostrada no card (opcional)") }),
        readOnly: false,
        scope: "character",
        execute: async (context, input: { motivo?: string }) => {
            const doc = await loadActive(context)
            const level = doc.startingLevel ?? doc.build?.level ?? null
            if (!level || level <= 1) throw new MaddoxInterviewToolError("O card de PV só existe acima do nível 1 (no nível 1 os PV são automáticos: máximo do dado + CON).")
            const catalog = await loadBuildCatalog(doc.build ?? emptyBuild())
            if (!catalog.cls) throw new MaddoxInterviewToolError("Grave antes uma classe do catálogo (o dado de vida vem dela).")
            const draft = draftOf(context.lockToken)
            const latest = latestHitPointsCard(doc.messages)
            if (draft.hitPoints || (latest?.card.status === "pending" && latest.card.level === level && latest.card.hitDie === catalog.cls.hitDice)) {
                return { alreadyOpen: true, note: "O card de PV já está aberto para o jogador: aguarde o envio." }
            }
            const reason = (input.motivo ?? "").trim()
            draft.hitPoints = { reason: reason ? reason.slice(0, MADDOX_TOOL_TEXT_MAX) : null, level, hitDie: catalog.cls.hitDice }
            return { opened: true, niveis: `2 a ${level}`, dadoDeVida: catalog.cls.hitDice, note: "O card aparece abaixo desta fala. Explique em poucas linhas (média ou rolar em cada nível) e aguarde o envio." }
        },
    },
]

// ── Povos e classes do mundo (Maddox 8, cenário do Fiel ao D&D) ─────────────────────

/** Entrevista de cenário ativa (trava da geração) num grau com mundo restrito ao catálogo. */
async function loadScenarioActive(context: InterviewToolContext): Promise<IMaddoxInterview & { rigor: MaddoxRigorLevel }> {
    const doc = await MaddoxInterviewModel.findOne({ _id: context.interviewId, "generating.token": context.lockToken }).lean<IMaddoxInterview>()
    if (!doc) throw new MaddoxInterviewToolError("Esta resposta da entrevista já terminou: as ferramentas só funcionam durante a geração.")
    if (doc.kind !== "scenario") throw new MaddoxInterviewToolError("Os povos e as classes do mundo são definidos só na entrevista de cenário.")
    const campaign = await MaddoxCampaignModel.findById(doc.campaignId).select("rigor").lean<{ rigor: MaddoxRigorLevel }>()
    if (!campaign || !MADDOX_WORLD_CATALOG_RIGORS.includes(campaign.rigor)) throw new MaddoxInterviewToolError("Neste grau de rigor o mundo é livre: não há lista de povos e classes para gravar.")
    return { ...doc, rigor: campaign.rigor }
}

/** Situação dos povos e classes do mundo para o prompt de cada turno. */
export function worldStatusText(world: Partial<WorldCatalog> | null | undefined): string {
    const current = worldCatalogOf(world)
    const lines = worldCatalogLines(current)
    if (!current.races.length && !current.classes.length) lines.push(`- Nada gravado ainda: combine com a pessoa e grave com \`${MADDOX_INTERVIEW_TOOL_NAMES.world}\` (lista vazia = todo o catálogo).`)
    return lines.join("\n")
}

const worldList = z.array(z.string().trim().min(1).max(200)).max(MADDOX_WORLD_OPTIONS_MAX)

/** Resolve cada nome (ou id) no catálogo; um único nome fora dele recusa a lista inteira. */
async function resolveWorldList(kind: "race" | "class", values: readonly string[], errors: string[]): Promise<WorldCatalogRef[]> {
    const refs: WorldCatalogRef[] = []
    const missing: string[] = []
    for (const value of values) {
        const found = await findCatalogEntity(kind, value)
        if (!found) missing.push(value.trim())
        else if (!refs.some((ref) => ref.id === String(found._id))) refs.push({ id: String(found._id), name: found.name })
    }
    if (missing.length) {
        const label = kind === "race" ? "Povos (raças)" : "Classes"
        errors.push(`${label} fora do catálogo do DnDicas: ${missing.map((name) => `“${name}”`).join(", ")}. Opções: ${(await catalogNames(kind, MADDOX_WORLD_OPTIONS_MAX)).join(", ")}.`)
    }
    return refs
}

export const MADDOX_WORLD_TOOLS: readonly MaddoxInterviewTool[] = [
    {
        name: MADDOX_INTERVIEW_TOOL_NAMES.world,
        description: `Grava os povos (raças) e as classes que existem no mundo da campanha (Fiel ao D&D). Só entidades do catálogo do DnDicas: confirme os nomes com ${MADDOX_CATALOG_TOOL_NAMES.search} (tipos Raça e Classe). Cada lista enviada substitui a anterior; lista vazia = todo o catálogo vale. Um nome fora do catálogo recusa a chamada inteira (nada é gravado) e o retorno lista as opções.`,
        input: z.object({
            racas: worldList.optional().describe("Povos (raças) do mundo, pelo nome do catálogo ou id"),
            classes: worldList.optional().describe("Classes do mundo, pelo nome do catálogo ou id"),
        }),
        readOnly: false,
        scope: "scenario",
        execute: async (context, input: { racas?: string[]; classes?: string[] }) => {
            const doc = await loadScenarioActive(context)
            if (input.racas === undefined && input.classes === undefined) throw new MaddoxInterviewToolError("Envie `racas`, `classes` ou as duas listas.")
            const current = worldCatalogOf(doc.world)
            const errors: string[] = []
            const races = input.racas === undefined ? current.races : await resolveWorldList("race", input.racas, errors)
            const classes = input.classes === undefined ? current.classes : await resolveWorldList("class", input.classes, errors)
            if (errors.length) throw new MaddoxInterviewToolError(`Nada foi gravado. ${errors.join(" ")}`)
            const next: WorldCatalog = { races, classes }
            const saved = await MaddoxInterviewModel.updateOne({ _id: context.interviewId, "generating.token": context.lockToken }, { $set: { world: next } })
            if (saved.matchedCount === 0) throw new MaddoxInterviewToolError("Esta resposta da entrevista já terminou: as ferramentas só funcionam durante a geração.")
            return { saved: true, povos: races.map((item) => item.name), classes: classes.map((item) => item.name), situacao: worldStatusText(next) }
        },
    },
    {
        name: MADDOX_INTERVIEW_TOOL_NAMES.getWorld,
        description: "Consulta os povos (raças) e as classes gravados para o mundo da campanha (Fiel ao D&D). Lista vazia = todo o catálogo vale.",
        input: z.object({}),
        readOnly: true,
        scope: "scenario",
        execute: async (context) => {
            const doc = await loadScenarioActive(context)
            const world = worldCatalogOf(doc.world)
            return { povos: world.races.map((item) => item.name), classes: world.classes.map((item) => item.name), situacao: worldStatusText(world) }
        },
    },
]

/** Todas as ferramentas do entrevistador (personagem e cenário). */
export const MADDOX_ALL_INTERVIEW_TOOLS: readonly MaddoxInterviewTool[] = [...MADDOX_INTERVIEW_TOOLS, ...MADDOX_WORLD_TOOLS]

export function findInterviewTool(name: string): MaddoxInterviewTool | undefined {
    return MADDOX_ALL_INTERVIEW_TOOLS.find((tool) => tool.name === name)
}

/** Executa uma ferramenta validando a entrada; falha vira `MaddoxInterviewToolError` com mensagem em pt-BR. */
export async function runInterviewTool(tool: MaddoxInterviewTool, context: InterviewToolContext, rawInput: unknown): Promise<unknown> {
    const parsed = tool.input.safeParse(rawInput ?? {})
    if (!parsed.success) throw new MaddoxInterviewToolError(`Entrada inválida para ${tool.name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "entrada"}: ${issue.message}`).join("; ")}`)
    try {
        const output = await tool.execute(context, parsed.data as never)
        if (!tool.readOnly) log.info({ tool: tool.name, interviewId: String(context.interviewId) }, "[maddox] entrevistador usou uma ferramenta da entrevista")
        return output
    } catch (error) {
        if (error instanceof MaddoxInterviewToolError) throw error
        log.warn({ tool: tool.name, interviewId: String(context.interviewId), err: error instanceof Error ? error.message : String(error) }, "[maddox] ferramenta da entrevista falhou")
        throw new MaddoxInterviewToolError("Não foi possível concluir a operação agora. Siga a entrevista sem ela.")
    }
}

/** Ferramentas no formato da AI SDK (a SDK `ai` entra sob demanda). */
export async function buildInterviewAiTools(context: InterviewToolContext, kind: MaddoxScriptKind = "character"): Promise<ToolSet> {
    const { dynamicTool } = await import("ai")
    const tools: ToolSet = {}
    for (const def of MADDOX_ALL_INTERVIEW_TOOLS.filter((tool) => tool.scope === kind)) {
        tools[def.name] = dynamicTool({ description: def.description, inputSchema: def.input, execute: async (input: unknown) => runInterviewTool(def, context, input) })
    }
    // Consulta ao catálogo (só leitura): confirma raça, classe, origem etc. antes de sugerir ou aplicar o bônus.
    const { buildCatalogAiTools } = await import("./catalog-tools")
    return { ...tools, ...(await buildCatalogAiTools()) }
}
