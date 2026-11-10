import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { findCombatOption } from "../combat-options"
import { combatAdjustResponseSchema } from "../combat-prep-schemas"
import type { CombatPrepAdjustment, CombatPrepChange } from "../combat-types"
import type { MaddoxCombatAdjustmentInput } from "../combat-schemas"
import { MaddoxCampaignModel, MaddoxCombatPrepModel, type IMaddoxCampaign, type IMaddoxCombatPrep } from "../models"
import { interpretPrep, loadPrepSheet, mergeOverlay, optionLine, applyInterpretation, trackCombatPrepWork } from "./combat-prep"
import { isOpexUserId } from "./opex-members"

/**
 * Pedido de ajuste de uma opção no combate (DND-41) — SOMENTE servidor. Só o dono do personagem, só na própria vez, sem
 * gastar Ação nem Ação bônus. O pedido entra em `adjustments` da preparação e vira um job na fila serial da campanha (dois
 * pedidos seguidos são tratados em ordem, e o segundo vê o resultado do primeiro). Aceito: a opção é corrigida (e a ficha,
 * com auditoria e tempo real); recusado: nada muda. Sempre com o motivo.
 */

const log = loggerFor({ module: "maddox", feature: "combat-adjustments" })

const REFUSED_BY_SCREEN = "Esse pedido não tem base nas regras nem na ficha do personagem: a opção continua como está."

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
    trackCombatPrepWork(enqueueMaddoxJob(campaignId, "combat-adjust", async () => runAdjustment(campaign._id, prep._id, adjustment.id)))
    const { publishGameChanged, getGameState } = await import("./game")
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

async function decide(prepId: Types.ObjectId, adjustmentId: string, set: Partial<CombatPrepAdjustment>) {
    const fields = Object.fromEntries(Object.entries({ ...set, decidedAt: new Date() }).map(([key, value]) => [`adjustments.$.${key}`, value]))
    await MaddoxCombatPrepModel.updateOne({ _id: prepId, "adjustments.id": adjustmentId }, { $set: fields })
}

async function runAdjustment(campaignId: Types.ObjectId, prepId: Types.ObjectId, adjustmentId: string): Promise<void> {
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
        const raw = await ai.reviewAdjustment({ campaign, characterName: prep.characterName, sheetText: context.sheetText, optionsText: all.map(optionLine).join("\n") || context.optionsText, sneakAttack: context.sneakAttack, optionText, request: adjustment.text, previous })
        const response = combatAdjustResponseSchema.parse(raw)
        if (response.decision === "refuse") {
            await decide(prepId, adjustmentId, { status: "refused", reason: response.reason })
            log.info({ campaignId: String(campaignId), option: adjustment.optionId }, "[maddox] pedido de ajuste recusado")
            return
        }
        // As opções atuais (já preparadas) também são ids válidos para corrigir.
        const options = { action: [...context.options.action, ...(view?.options.action ?? [])], bonus: [...context.options.bonus, ...(view?.options.bonus ?? [])], reactions: context.options.reactions, attacksPerAction: context.options.attacksPerAction }
        const interpretation = interpretPrep({ sheetChanges: response.sheetChanges, modify: response.modify, remove: response.remove, add: response.add }, { ...context, options })
        const written = await applyInterpretation(interpretation, { sheetId: state.sheetId, campaign, characterName: prep.characterName, origin: "combat-adjust" })
        const changes: CombatPrepChange[] = [...written.changes, ...interpretation.optionChanges]
        // Sem mudança na opção pedida, o motivo fica na própria opção (o jogador vê "Ajustado pelo Maddox").
        const overlay = { ...interpretation.overlay, suppress: written.suppress }
        const fresh = await MaddoxCombatPrepModel.findById(prepId).select("overlay").lean<Pick<IMaddoxCombatPrep, "overlay">>()
        await MaddoxCombatPrepModel.updateOne({ _id: prepId }, { $set: { overlay: mergeOverlay(fresh?.overlay ?? overlay, overlay) } })
        await decide(prepId, adjustmentId, { status: "accepted", reason: response.reason, changes })
        log.info({ campaignId: String(campaignId), option: adjustment.optionId, changes: changes.length }, "[maddox] pedido de ajuste aceito")
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn({ err: message, campaignId: String(campaignId), option: adjustment.optionId }, "[maddox] falha no pedido de ajuste")
        await decide(prepId, adjustmentId, { status: "error", error: message, reason: null })
    } finally {
        await publishGameChanged(campaignId)
    }
}
