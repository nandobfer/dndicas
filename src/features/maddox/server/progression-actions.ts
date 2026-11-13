import { Types } from "mongoose"
import { normalizeCatalogName } from "../catalog-markup"
import { MADDOX_CHAPTER_SUMMARY_MAX, MADDOX_CHAPTER_TITLE_MAX, MADDOX_LEVEL_UP_REASON_MAX, MADDOX_PROGRESSION_TOOL_NAMES, type MaddoxMilestoneTrigger } from "../constants"
import { MaddoxCampaignModel, type IMaddoxCampaign } from "../models"
import { jobDraftCombat, jobDraftProgression, maddoxJobMeta, type MaddoxDraftProgression } from "./game-live"
import { evaluateLevelMilestone } from "./level-milestone"
import { checkDeclaration, partyOf, progressionModeOf, ProgressionRefusal, tacticalCombatActive } from "./level-ups"
import { questionRun } from "./question-runs"

/**
 * Ferramentas de progressão do narrador (DND-56): a regra de cada uma, conferida no servidor (o MCP expõe todas as
 * ferramentas, então o modo da geração é conferido aqui, não só na lista oferecida). Gravam no job; a gravação de fato
 * acontece depois da fala (`commitProgression`). Recusas lançam `ProgressionRefusal` com o motivo em pt-BR.
 */

export interface ProgressionToolContext {
    campaignId: Types.ObjectId
    turnNumber: number
    jobId?: string
}

const clip = (value: string, max: number) => {
    const text = value.trim()
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

async function loadCampaign(context: ProgressionToolContext): Promise<IMaddoxCampaign> {
    const campaign = await MaddoxCampaignModel.findById(context.campaignId).lean<IMaddoxCampaign>()
    if (!campaign) throw new ProgressionRefusal("Campanha não encontrada.")
    return campaign
}

function draftOf(context: ProgressionToolContext): MaddoxDraftProgression {
    const draft = context.jobId ? jobDraftProgression(String(context.campaignId), context.jobId) : null
    if (!draft) throw new ProgressionRefusal("Esta narração já terminou.")
    return draft
}

function requireNarration(context: ProgressionToolContext, what: string) {
    const meta = context.jobId ? maddoxJobMeta(String(context.campaignId), context.jobId) : null
    if (!meta || meta.kind !== "narration" || questionRun(context.jobId)) throw new ProgressionRefusal(`${what} só na narração do turno do mestre.`)
}

/** O fim do combate tático foi pedido nesta geração (a declaração sai depois dele). */
const endingCombatInJob = (context: ProgressionToolContext) => Boolean(context.jobId && jobDraftCombat(String(context.campaignId), context.jobId).some((event) => event.type === "end"))

const milestoneNote = (reason: string) => ({
    atingido: true,
    motivo: reason,
    instrucao: `O marco de subida de nível foi atingido. Declare a subida com ${MADDOX_PROGRESSION_TOOL_NAMES.declare} nesta narração (o motivo acima serve) e narre o momento num trecho curto. Se não declarar agora, a orientação volta na próxima narração.`,
})

/**
 * Decisão do marco num acontecimento-chave da geração (fim de combate, missão concluída, capítulo). Positiva vira
 * orientação no retorno da ferramenta e fica no job. Devolve o trecho para o retorno (ou `null`).
 */
export async function milestoneOnEvent(context: ProgressionToolContext, trigger: MaddoxMilestoneTrigger, detail: string, combatId?: Types.ObjectId | null): Promise<Record<string, unknown> | null> {
    const draft = context.jobId ? jobDraftProgression(String(context.campaignId), context.jobId) : null
    if (!draft) return null
    if (combatId) draft.evaluatedCombats.push(String(combatId))
    if (draft.evaluated.includes(`${trigger}:${detail}`)) return null
    draft.evaluated.push(`${trigger}:${detail}`)
    const campaign = await MaddoxCampaignModel.findById(context.campaignId).lean<IMaddoxCampaign>()
    if (!campaign || progressionModeOf(campaign) !== "marco") return null
    const decision = await evaluateLevelMilestone(campaign, trigger, detail)
    if (!decision) return null
    if (!decision.reached) return { marcoDeNivel: { atingido: false, motivo: decision.reason } }
    draft.milestone = { trigger, reason: decision.reason }
    return { marcoDeNivel: milestoneNote(decision.reason) }
}

/** "Avaliar marco de nível" (só no "Pergunte ao mestre"): positiva aciona a subida do grupo. */
export async function evaluateMilestoneForQuestion(context: ProgressionToolContext): Promise<Record<string, unknown>> {
    const run = questionRun(context.jobId)
    if (!run) throw new ProgressionRefusal("A avaliação do marco de nível só acontece no \"Pergunte ao mestre\".")
    const campaign = await loadCampaign(context)
    const mode = progressionModeOf(campaign)
    if (!mode) throw new ProgressionRefusal("Este grau de rigor não tem nível de personagem.")
    if (mode !== "marco") throw new ProgressionRefusal("Esta campanha usa o modo Experiência: cada personagem sobe ao atingir a XP do próximo nível.")
    if (await tacticalCombatActive(campaign._id)) throw new ProgressionRefusal("A subida de nível só é avaliada depois do combate.")
    const draft = draftOf(context)
    const decision = await evaluateLevelMilestone(campaign, "question", "")
    if (!decision) throw new ProgressionRefusal("Não consegui avaliar o marco agora. Tente perguntar de novo em instantes.")
    if (!decision.reached) return { atingido: false, motivo: decision.reason, instrucao: "Explique o motivo ao jogador, em tom de mestre." }
    try {
        const check = await checkDeclaration(campaign)
        draft.declare = { reason: decision.reason, offMilestone: false, trigger: "question" }
        return { atingido: true, motivo: decision.reason, nivel: check.target, instrucao: `A subida do grupo para o nível ${check.target} foi acionada: anuncie-a na resposta (o card "Subida de nível" aparece logo abaixo).` }
    } catch (error) {
        if (error instanceof ProgressionRefusal) return { atingido: true, motivo: decision.reason, subida: error.message }
        throw error
    }
}

/** "Declarar subida de nível" (modo Marco): sempre o grupo inteiro, para (maior nível + 1). */
export async function draftDeclaration(context: ProgressionToolContext, reason: string): Promise<Record<string, unknown>> {
    requireNarration(context, "A subida de nível é declarada")
    const campaign = await loadCampaign(context)
    const draft = draftOf(context)
    if (draft.declare) throw new ProgressionRefusal("A subida de nível já foi declarada nesta narração.")
    const { target } = await checkDeclaration(campaign, { inCombatAllowed: endingCombatInJob(context) })
    const pending = campaign.progression?.pendingMilestone ?? null
    const milestone = draft.milestone ?? (pending ? { trigger: pending.trigger, reason: pending.reason } : null)
    draft.declare = { reason: clip(reason, MADDOX_LEVEL_UP_REASON_MAX), offMilestone: !milestone, trigger: milestone?.trigger ?? "manual" }
    return { declarado: true, nivel: target, foraDeMarco: !milestone, nota: "Narre o momento da subida num trecho curto: o card \"Subida de nível\" aparece no chat e cada jogador escolhe no wizard (os Personagens Opex decidem sozinhos)." }
}

/** "Encerrar capítulo" (todos os graus): registra no Diário; no modo Marco, roda a decisão do marco. */
export async function draftChapter(context: ProgressionToolContext, title: string, summary: string): Promise<Record<string, unknown>> {
    requireNarration(context, "O capítulo é encerrado")
    const draft = draftOf(context)
    if (draft.chapter) throw new ProgressionRefusal("Um capítulo já foi encerrado nesta narração.")
    const cleanTitle = clip(title, MADDOX_CHAPTER_TITLE_MAX)
    if (!cleanTitle) throw new ProgressionRefusal("Informe o título do capítulo.")
    draft.chapter = { title: cleanTitle, summary: clip(summary, MADDOX_CHAPTER_SUMMARY_MAX) }
    const milestone = await milestoneOnEvent(context, "chapter-end", cleanTitle)
    return { encerrado: true, titulo: cleanTitle, ...(milestone ?? {}) }
}

/** "Conceder experiência" (modo Experiência): personagens, valor e motivo, sem teto. */
export async function draftGrant(context: ProgressionToolContext, names: readonly string[], amount: number, reason: string): Promise<Record<string, unknown>> {
    requireNarration(context, "A experiência é concedida")
    const campaign = await loadCampaign(context)
    const mode = progressionModeOf(campaign)
    if (!mode) throw new ProgressionRefusal("Este grau de rigor não tem experiência nem nível.")
    if (mode !== "experiencia") throw new ProgressionRefusal(`Esta campanha usa o modo Marco: não há XP. Para subir o grupo, use ${MADDOX_PROGRESSION_TOOL_NAMES.declare}.`)
    const draft = draftOf(context)
    const party = (await partyOf(campaign._id)).filter((member) => member.ready)
    const wanted = names.map((name) => normalizeCatalogName(name))
    const everyone = wanted.some((name) => name === "grupo" || name === "todos")
    const chosen = everyone ? party : party.filter((member) => wanted.includes(normalizeCatalogName(member.characterName)))
    const unknown = everyone ? [] : names.filter((name) => !party.some((member) => normalizeCatalogName(member.characterName) === normalizeCatalogName(name)))
    if (!chosen.length) throw new ProgressionRefusal(`Nenhum personagem encontrado. Personagens com ficha: ${party.map((member) => member.characterName).join(", ") || "nenhum"}.`)
    if (unknown.length) throw new ProgressionRefusal(`Personagem não encontrado: ${unknown.join(", ")}. Personagens com ficha: ${party.map((member) => member.characterName).join(", ")}.`)
    draft.grants.push({ entries: chosen.map((member) => ({ characterId: String(member.characterId), amount })), reason: clip(reason, MADDOX_LEVEL_UP_REASON_MAX) })
    return { concedido: true, valor: amount, personagens: chosen.map((member) => member.characterName), nota: "O card de XP aparece no chat depois da narração; quem atingir o limiar do próximo nível sobe (fora de combate tático)." }
}
