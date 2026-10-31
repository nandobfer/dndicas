import { z } from "zod"
import { Types } from "mongoose"
import type { ToolSet } from "ai"
import { loggerFor } from "@/lib/logger"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import { MADDOX_ABILITY_BONUS_MAX, MADDOX_INTERVIEW_TOOL_NAMES, MADDOX_SHEET_RIGORS, MADDOX_TOOL_TEXT_MAX } from "../constants"
import { MaddoxCampaignModel, MaddoxInterviewModel, type IMaddoxAbilityBonus, type IMaddoxAbilityScoresCard, type IMaddoxInterview, type IMaddoxInterviewMessage } from "../models"
import { ABILITY_BY_LABEL, ABILITY_KEYS, ABILITY_LABEL_LIST, abilityMethodLabel, finalScores, rolledScores, scoresLine, validateBonus, type AbilityScores } from "../interview-scores"
import { MADDOX_ABILITY_LABELS } from "../check-modifier"

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
}

const drafts = ((globalThis as unknown as { __maddoxInterviewDrafts?: Map<string, InterviewToolDraft> }).__maddoxInterviewDrafts ??= new Map())

function draftOf(lockToken: string): InterviewToolDraft {
    let draft = drafts.get(lockToken)
    if (!draft) {
        draft = { card: null, resetRolls: false }
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
    execute: (context: InterviewToolContext, input: never) => Promise<unknown>
}

/** Último card que vale (o mais novo que não foi substituído). */
export function latestAbilityCard(messages: readonly IMaddoxInterviewMessage[]): { message: IMaddoxInterviewMessage; card: IMaddoxAbilityScoresCard } | null {
    for (let index = messages.length - 1; index >= 0; index--) {
        const card = messages[index]!.abilityScores
        if (card && card.status !== "superseded") return { message: messages[index]!, card }
    }
    return null
}

/** Card enviado mais recente (o que entra na ficha). */
export function submittedAbilityCard(messages: readonly IMaddoxInterviewMessage[]): IMaddoxAbilityScoresCard | null {
    const latest = latestAbilityCard(messages)
    return latest?.card.status === "submitted" && latest.card.base ? latest.card : null
}

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

async function loadActive(context: InterviewToolContext): Promise<IMaddoxInterview> {
    const doc = await MaddoxInterviewModel.findOne({ _id: context.interviewId, "generating.token": context.lockToken }).lean<IMaddoxInterview>()
    if (!doc) throw new MaddoxInterviewToolError("Esta resposta da entrevista já terminou: as ferramentas só funcionam durante a geração.")
    if (doc.kind !== "character") throw new MaddoxInterviewToolError("Os atributos só existem na entrevista de personagem.")
    const campaign = await MaddoxCampaignModel.findById(doc.campaignId).select("rigor").lean<{ rigor: (typeof MADDOX_SHEET_RIGORS)[number] }>()
    if (!campaign || !MADDOX_SHEET_RIGORS.includes(campaign.rigor)) throw new MaddoxInterviewToolError("Este grau de rigor não usa atributos: o personagem é só narrativo.")
    return doc
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Antecedente do catálogo pelo nome (ou nome original), sem acento e sem caixa. */
async function findBackground(name: string): Promise<{ name: string; suggested: AttributeType[] } | null> {
    const { BackgroundModel } = await import("@/features/backgrounds/models/background")
    const pattern = new RegExp(`^${escapeRegex(name.trim())}$`, "i")
    const found = await BackgroundModel.findOne({ $or: [{ name: name.trim() }, { originalName: name.trim() }, { name: pattern }, { originalName: pattern }] })
        .collation({ locale: "pt", strength: 1 })
        .select("name suggestedAttributes")
        .lean<{ name: string; suggestedAttributes?: string[] }>()
    if (!found) return null
    return { name: found.name, suggested: (found.suggestedAttributes ?? []).map((label) => ABILITY_BY_LABEL[label]).filter((key): key is AttributeType => Boolean(key)) }
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
        description: `Aplica o bônus do antecedente aos atributos enviados: exatamente 3 pontos, no máximo +${MADDOX_ABILITY_BONUS_MAX} por atributo (+2/+1 ou +1/+1/+1), só nos atributos sugeridos pelo antecedente quando ele existe no catálogo. Ex.: { "antecedente": "Criminoso", "bonus": { "Destreza": 2, "Inteligência": 1 } }. Aplicar de novo substitui o bônus anterior.`,
        input: z.object({
            antecedente: z.string().min(1).describe("Nome do antecedente (origem) combinado"),
            bonus: z.object(bonusShape).describe("Pontos por atributo (nome em português)"),
        }),
        readOnly: false,
        execute: async (context, input: { antecedente: string; bonus: Record<string, number | undefined> }) => {
            const doc = await loadActive(context)
            const latest = latestAbilityCard(doc.messages)
            if (latest?.card.status !== "submitted" || !latest.card.base) throw new MaddoxInterviewToolError("O jogador ainda não enviou os atributos pelo card: o bônus é aplicado depois do envio.")
            const parts = Object.fromEntries(Object.entries(input.bonus).filter(([, value]) => typeof value === "number").map(([label, value]) => [ABILITY_BY_LABEL[label], value])) as Partial<Record<AttributeType, number>>
            const background = await findBackground(input.antecedente)
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
                sugeridos: background?.suggested.map((key) => MADDOX_ABILITY_LABELS[key]) ?? [],
                final: scoresLine(latest.card.base, parts),
            }
        },
    },
]

export function findInterviewTool(name: string): MaddoxInterviewTool | undefined {
    return MADDOX_INTERVIEW_TOOLS.find((tool) => tool.name === name)
}

/** Executa uma ferramenta validando a entrada; falha vira `MaddoxInterviewToolError` com mensagem em pt-BR. */
export async function runInterviewTool(tool: MaddoxInterviewTool, context: InterviewToolContext, rawInput: unknown): Promise<unknown> {
    const parsed = tool.input.safeParse(rawInput ?? {})
    if (!parsed.success) throw new MaddoxInterviewToolError(`Entrada inválida para ${tool.name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "entrada"}: ${issue.message}`).join("; ")}`)
    try {
        const output = await tool.execute(context, parsed.data as never)
        if (!tool.readOnly) log.info({ tool: tool.name, interviewId: String(context.interviewId) }, "[maddox] entrevistador usou a ferramenta de atributos")
        return output
    } catch (error) {
        if (error instanceof MaddoxInterviewToolError) throw error
        log.warn({ tool: tool.name, interviewId: String(context.interviewId), err: error instanceof Error ? error.message : String(error) }, "[maddox] ferramenta da entrevista falhou")
        throw new MaddoxInterviewToolError("Não foi possível concluir a operação agora. Siga a entrevista sem ela.")
    }
}

/** Ferramentas no formato da AI SDK (a SDK `ai` entra sob demanda). */
export async function buildInterviewAiTools(context: InterviewToolContext): Promise<ToolSet> {
    const { dynamicTool } = await import("ai")
    const tools: ToolSet = {}
    for (const def of MADDOX_INTERVIEW_TOOLS) {
        tools[def.name] = dynamicTool({ description: def.description, inputSchema: def.input, execute: async (input: unknown) => runInterviewTool(def, context, input) })
    }
    return tools
}
