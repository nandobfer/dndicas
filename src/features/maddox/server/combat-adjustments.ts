import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { findCombatOption } from "../combat-options"
import { combatAdjustResponseSchema } from "../combat-prep-schemas"
import type { CombatPrepAdjustment, CombatPrepChange } from "../combat-types"
import type { MaddoxCombatAdjustmentInput } from "../combat-schemas"
import { MaddoxCampaignModel, MaddoxCombatPrepModel, type IMaddoxCampaign, type IMaddoxCombatPrep } from "../models"
import { interpretPrep, loadPrepSheet, mergeOverlay, optionLine, applyInterpretation, orderedChanges, trackCombatPrepWork, CATALOG_REFUSAL_PREFIX } from "./combat-prep"
import { createCatalogReadLog } from "./catalog-reads"
import { isOpexUserId } from "./opex-members"

/**
 * Pedido de ajuste de uma opção no combate (DND-41) — SOMENTE servidor. Só o dono do personagem, só na própria vez, sem
 * gastar Ação nem Ação bônus. O pedido entra em `adjustments` da preparação e vira um job na fila serial da campanha (dois
 * pedidos seguidos são tratados em ordem, e o segundo vê o resultado do primeiro). Aceito: a opção é corrigida (e a ficha,
 * com auditoria e tempo real); recusado: nada muda. Sempre com o motivo.
 */

const log = loggerFor({ module: "maddox", feature: "combat-adjustments" })

const REFUSED_BY_SCREEN = "Esse pedido não tem base nas regras nem na ficha do personagem: a opção continua como está."
/** Motivo técnico (só o dono vê) quando o Maddox recusa duas vezes sem ler o catálogo (DND-49, F1). */
const REFUSED_WITHOUT_CATALOG = "O Maddox recusou o pedido sem consultar o catálogo do DnDicas (duas tentativas); o pedido não foi examinado."

export async function requestCombatAdjustment(campaignId: string, input: MaddoxCombatAdjustmentInput, userId: string) {
    const { loadMyCombatTurn } = await import("./tactical-actions")
    const { campaign, combat, actor } = await loadMyCombatTurn(campaignId, userId)
    if (isOpexUserId(actor.state.userId)) throw new DomainError(409, "Personagens Opex não pedem ajuste.", "OPEX_NOT_ALLOWED")
    const prep = await MaddoxCombatPrepModel.findOne({ combatId: combat._id, actorKey: actor.key }).lean<IMaddoxCombatPrep>()
    if (!prep || (prep.status !== "ready" && prep.status !== "skipped")) throw new DomainError(409, "A mesa deste personagem ainda não foi preparada.", "PREP_NOT_READY")
    const { loadCharacterOptions } = await import("./tactical-options")
    const view = (await loadCharacterOptions([actor.state], campaign._id, combat._id)).get(actor.key)
    const option = view ? findCombatOption(view.options, input.economy, input.optionId) : null
    if (!option) throw new DomainError(409, "Esta opção não existe mais. Escolha outra na lista.", "OPTION_UNAVAILABLE")
    if (option.id === "free") throw new DomainError(409, "\"Outra ação\" não tem o que ajustar: descreva a ação ao confirmar.", "OPTION_NOT_ADJUSTABLE")
    const adjustment: CombatPrepAdjustment = {
        id: randomUUID(),
        economy: input.economy,
        optionId: option.id,
        optionLabel: option.label,
        text: input.text,
        status: "pending",
        reason: null,
        error: null,
        changes: [],
        requestedAt: new Date(),
        decidedAt: null,
    }
    await MaddoxCombatPrepModel.updateOne({ _id: prep._id }, { $push: { adjustments: adjustment } })
    log.info({ campaignId, character: actor.name, option: option.id }, "[maddox] pedido de ajuste de opção no combate")
    const { enqueueMaddoxJob } = await import("./game-live")
    trackCombatPrepWork(enqueueMaddoxJob(campaignId, "combat-adjust", async (job) => runAdjustment(campaign._id, prep._id, adjustment.id, userId, job.jobId)))
    const { publishGameChanged, getGameState } = await import("./game")
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

async function decide(prepId: Types.ObjectId, adjustmentId: string, set: Partial<CombatPrepAdjustment>) {
    const fields = Object.fromEntries(Object.entries({ ...set, decidedAt: new Date() }).map(([key, value]) => [`adjustments.$.${key}`, value]))
    await MaddoxCombatPrepModel.updateOne({ _id: prepId, "adjustments.id": adjustmentId }, { $set: fields })
}

async function runAdjustment(campaignId: Types.ObjectId, prepId: Types.ObjectId, adjustmentId: string, requestedBy: string, jobId: string): Promise<void> {
    const prep = await MaddoxCombatPrepModel.findById(prepId).lean<IMaddoxCombatPrep>()
    const adjustment = prep?.adjustments.find((item) => item.id === adjustmentId)
    if (!prep || !adjustment || adjustment.status !== "pending") return
    const { publishGameChanged } = await import("./game")
    try {
        const campaign = await MaddoxCampaignModel.findById(campaignId).lean<IMaddoxCampaign>()
        const { findActiveTactical } = await import("./tactical-combat")
        const combat = await findActiveTactical(campaignId)
        const state = combat && String(combat._id) === String(prep.combatId) ? combat.tactical.characters.find((item) => item.actorKey === prep.actorKey && !item.left) : undefined
        if (!campaign || !combat || !state?.sheetId) {
            // Combate encerrado: o pedido é descartado sem gravar na ficha.
            await decide(prepId, adjustmentId, { status: "refused", reason: "O combate terminou antes de o Maddox examinar o pedido." })
            return
        }
        const { loadCharacterOptions } = await import("./tactical-options")
        const view = (await loadCharacterOptions([state], campaignId, combat._id)).get(state.actorKey)
        const current = view ? [...view.options.action, ...view.options.bonus].find((option) => option.id === adjustment.optionId) : undefined
        const context = await loadPrepSheet(state, campaignId)
        if (!context) throw new Error("A ficha do personagem não foi encontrada.")
        const optionText = current ? `${optionLine(current)}${current.adjusted ? ` · Ajustado pelo Maddox: ${current.adjusted.reason}` : ""}` : `id="${adjustment.optionId}" — ${adjustment.optionLabel} (não está disponível agora)`
        const ai = await import("./combat-prep-ai")
        const screened = await ai.screenAdjustment({ campaign, characterName: prep.characterName, optionText, request: adjustment.text }).catch(() => null)
        if (screened === false) {
            await decide(prepId, adjustmentId, { status: "refused", reason: REFUSED_BY_SCREEN })
            return
        }
        const previous = prep.adjustments
            .filter((item) => item.id !== adjustmentId && item.status !== "pending")
            .map((item) => `- ${item.optionLabel}: "${item.text}" → ${item.status === "accepted" ? "aceito" : item.status === "refused" ? "recusado" : "não examinado"}${item.reason ? ` (${item.reason})` : ""}`)
            .join("\n")
        const all = view ? [...view.options.action, ...view.options.bonus] : []
        const reads = createCatalogReadLog()
        const review = (mustConsult: boolean) => ai.reviewAdjustment({ campaign, characterName: prep.characterName, sheetText: context.sheetText, optionsText: all.map(optionLine).join("\n") || context.optionsText, sneakAttack: context.sneakAttack, optionText, request: adjustment.text, previous, reads, jobId, ...(mustConsult ? { mustConsult } : {}) })
        let response = combatAdjustResponseSchema.parse(await review(false))
        // DND-49 (revisão, F1): recusa sem nenhuma leitura do catálogo não vale — uma nova tentativa exigindo a consulta;
        // se de novo não consultar, o pedido fica "não examinado" (o jogador pode pedir de novo), nunca recusado de memória.
        // Consulta = qualquer leitura ou busca concluída (buscar e não achar a regra é a recusa correta).
        const consulted = () => reads.refs.length > 0 || reads.searches > 0
        if (response.decision === "refuse" && !consulted()) {
            log.warn({ campaignId: String(campaignId), option: adjustment.optionId, catalogFailures: reads.failures }, "[maddox] pedido de ajuste recusado sem consultar o catálogo; nova tentativa exigindo a consulta")
            response = combatAdjustResponseSchema.parse(await review(true))
            if (response.decision === "refuse" && !consulted()) {
                await decide(prepId, adjustmentId, { status: "error", reason: null, error: REFUSED_WITHOUT_CATALOG, catalogRefs: [], droppedWithoutSource: 0 })
                log.warn({ campaignId: String(campaignId), option: adjustment.optionId, catalogFailures: reads.failures }, "[maddox] pedido de ajuste não examinado: o Maddox recusou duas vezes sem consultar o catálogo")
                return
            }
        }
        const audit = { catalogRefs: reads.refs, refsCount: reads.refs.length, catalogFailures: reads.failures, catalogSearches: reads.searches }
        if (response.decision === "refuse") {
            await decide(prepId, adjustmentId, { status: "refused", reason: response.reason, catalogRefs: reads.refs, droppedWithoutSource: 0 })
            log.info({ campaignId: String(campaignId), option: adjustment.optionId, ...audit }, "[maddox] pedido de ajuste recusado")
            return
        }
        // As opções atuais (já preparadas) também são ids válidos para corrigir.
        const options = { action: [...context.options.action, ...(view?.options.action ?? [])], bonus: [...context.options.bonus, ...(view?.options.bonus ?? [])], reactions: context.options.reactions, attacksPerAction: context.options.attacksPerAction }
        const interpretation = interpretPrep({ sheetChanges: response.sheetChanges, modify: response.modify, remove: response.remove, add: response.add }, { ...context, options }, reads)
        // DND-51: a escolha do jogador só vale dita por ele (no pedido ou na entrevista).
        const [{ screenPlayerChoices, refusalsOf, choiceSheetOf }, { interviewPlayerTexts }] = await Promise.all([import("./sheet-choice-rules"), import("./question-runs")])
        const screen = await screenPlayerChoices(interpretation.sheetChanges, reads, [adjustment.text, ...prep.adjustments.map((item) => item.text), ...(await interviewPlayerTexts(campaign._id, prep.characterId))], await choiceSheetOf(state.sheetId))
        interpretation.sheetChanges = screen.allowed
        interpretation.refusals.push(...refusalsOf(screen.refused))
        const written = await applyInterpretation(interpretation, { sheetId: state.sheetId, campaign, characterName: prep.characterName, origin: "combat-adjust", requestedBy })
        const changes: CombatPrepChange[] = orderedChanges(interpretation, [...written.changes, ...interpretation.optionChanges])
        const sourced = { catalogRefs: reads.refs, droppedWithoutSource: interpretation.droppedWithoutSource }
        if (interpretation.dropped) log.warn({ campaignId: String(campaignId), option: adjustment.optionId, dropped: interpretation.dropped, droppedWithoutSource: interpretation.droppedWithoutSource }, "[maddox] itens do pedido de ajuste descartados na validação")
        // Aceito, mas nada válido para aplicar (id errado, valor fora da faixa, ficha mudou, fonte não confirmada): não é "aceito".
        if (!changes.some((change) => change.applied)) {
            // DND-49: tudo recusado por falta de fonte no catálogo = o pedido é recusado, com o motivo, para o jogador.
            if (interpretation.droppedWithoutSource) {
                const why = interpretation.refusals.find((change) => change.refused?.startsWith(CATALOG_REFUSAL_PREFIX))?.refused ?? `${CATALOG_REFUSAL_PREFIX}.`
                await decide(prepId, adjustmentId, { status: "refused", reason: `${why} A opção continua como está.`, changes, ...sourced })
                log.info({ campaignId: String(campaignId), option: adjustment.optionId, ...audit, droppedWithoutSource: interpretation.droppedWithoutSource }, "[maddox] pedido de ajuste recusado: sem fonte no catálogo")
                return
            }
            await decide(prepId, adjustmentId, { status: "error", reason: null, error: `O Maddox aceitou, mas nenhuma correção válida sobrou (${interpretation.dropped} item(ns) descartado(s)).`, ...sourced })
            log.warn({ campaignId: String(campaignId), option: adjustment.optionId, ...audit }, "[maddox] pedido de ajuste aceito sem mudança aplicável")
            return
        }
        // Sem mudança na opção pedida, o motivo fica na própria opção (o jogador vê "Ajustado pelo Maddox").
        const overlay = { ...interpretation.overlay, suppress: written.suppress }
        const fresh = await MaddoxCombatPrepModel.findById(prepId).select("overlay").lean<Pick<IMaddoxCombatPrep, "overlay">>()
        await MaddoxCombatPrepModel.updateOne({ _id: prepId }, { $set: { overlay: mergeOverlay(fresh?.overlay ?? overlay, overlay) } })
        await decide(prepId, adjustmentId, { status: "accepted", reason: response.reason, changes, ...sourced })
        log.info({ campaignId: String(campaignId), option: adjustment.optionId, changes: changes.length, ...audit, droppedWithoutSource: interpretation.droppedWithoutSource }, "[maddox] pedido de ajuste aceito")
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn({ err: message, campaignId: String(campaignId), option: adjustment.optionId }, "[maddox] falha no pedido de ajuste")
        await decide(prepId, adjustmentId, { status: "error", error: message, reason: null })
    } finally {
        await publishGameChanged(campaignId)
    }
}
