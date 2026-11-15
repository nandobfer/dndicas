import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { applyConditionChange, conditionDisplayLabel, hpBand, HP_BAND_LABELS } from "../combat-rules"
import type { CombatActionStep, IMaddoxCombatAction } from "../combat-types"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_CONDITION_LABELS, MADDOX_CONDITIONS, MADDOX_TACTICAL_COMBAT_RIGORS } from "../constants"
import { MaddoxCampaignMessageModel, MaddoxCampaignModel, type IMaddoxCampaign, type IMaddoxCampaignMessage } from "../models"
import { questionRun, type QuestionRun } from "./question-runs"
import { findActiveTactical, findActorByName, mutateTactical, type CombatActor, type TacticalCombat } from "./tactical-combat"

/**
 * Correções do combate tático pelo "Pergunte ao mestre" e pelo lembrete (DND-59) — SOMENTE servidor. Só dentro do job de
 * uma resposta (`questionRun`) e com combate tático em andamento. Diferente da vez dos adversários (cópia de trabalho
 * gravada depois da narração), a correção grava NA HORA: o retorno de cada ferramenta já é o estado do combate, e a
 * resposta do Maddox só pode afirmar o que ele trouxer. Cada correção vira uma linha pública na mesa (`combat-fix`),
 * entra na auditoria e atualiza a prévia dos cards pendentes (vantagem/desvantagem).
 */

const log = loggerFor({ module: "maddox", feature: "question-combat" })

export class QuestionCombatError extends Error {}

const NOT_IN_QUESTION = 'Esta ferramenta só funciona na resposta a uma pergunta do "Pergunte ao mestre" ou a um lembrete.'

interface FixContext {
    run: QuestionRun
    campaign: Pick<IMaddoxCampaign, "_id" | "rigor" | "turn" | "showEnemyHp" | "showAllyHp">
    combat: TacticalCombat
}

async function fixContext(jobId: string | undefined): Promise<FixContext> {
    const run = questionRun(jobId)
    if (!run) throw new QuestionCombatError(NOT_IN_QUESTION)
    const campaign = await MaddoxCampaignModel.findById(run.campaignId).select("rigor turn showEnemyHp showAllyHp").lean<Pick<IMaddoxCampaign, "_id" | "rigor" | "turn" | "showEnemyHp" | "showAllyHp">>()
    if (!campaign || !MADDOX_TACTICAL_COMBAT_RIGORS.includes(campaign.rigor)) throw new QuestionCombatError("Esta campanha não usa combate tático.")
    const combat = await findActiveTactical(campaign._id)
    if (!combat) throw new QuestionCombatError("Não há combate tático em andamento: nada a corrigir no combate.")
    return { run, campaign, combat }
}

const participants = (combat: TacticalCombat) => combat.tactical.order.map((slot) => slot.name).join(", ")

function actorOf(combat: TacticalCombat, name: string): CombatActor {
    const actor = findActorByName(combat, name)
    if (!actor) throw new QuestionCombatError(`"${name}" não está neste combate. Participantes: ${participants(combat)}.`)
    return actor
}

const conditionKeyOf = (value: string) => {
    const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    const wanted = fold(value)
    return MADDOX_CONDITIONS.find((key) => key === value || fold(MADDOX_CONDITION_LABELS[key]) === wanted) ?? null
}

/** Grava a correção: linha pública, auditoria, log, prévia dos cards e aviso à mesa. */
async function commitFix(context: FixContext, tool: string, line: string, details: Record<string, unknown>): Promise<void> {
    const { refreshPendingAttackPreviews } = await import("./tactical-actions")
    await refreshPendingAttackPreviews(context.campaign._id)
    await MaddoxCampaignMessageModel.create({
        campaignId: context.campaign._id,
        turnNumber: context.campaign.turn?.number ?? context.run.turnNumber,
        phase: context.campaign.turn?.phase ?? "players",
        kind: "combat-fix",
        content: line,
    })
    if (context.run.askerUserId) {
        await recordAudit({ userId: context.run.askerUserId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: context.run.campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { combatFix: tool, combatId: String(context.combat._id), questionId: context.run.questionId, ...details } }).catch((error: unknown) =>
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: context.run.campaignId }, "[maddox] auditoria da correção do combate falhou"),
        )
    }
    log.info({ campaignId: context.run.campaignId, jobId: context.run.jobId, tool, line, ...details }, "[maddox] combate corrigido pelo mestre")
    const { publishGameChanged } = await import("./game")
    await publishGameChanged(context.campaign._id)
}

/** O erro do combate (versão mudou, etc.) vira mensagem para o modelo. */
async function mutate<T>(context: FixContext, work: (combat: TacticalCombat) => T): Promise<T> {
    try {
        const { result } = await mutateTactical(context.campaign._id, work)
        return result
    } catch (error) {
        if (error instanceof QuestionCombatError) throw error
        if (error instanceof DomainError) throw new QuestionCombatError(error.message)
        throw error
    }
}

// ── Leitura ───────────────────────────────────────────────────────────────────

const cardRef = (id: Types.ObjectId | string) => String(id).slice(-6)

const modeLabel = (mode: CombatActionStep["mode"]) => (mode === "advantage" ? "vantagem" : mode === "disadvantage" ? "desvantagem" : "normal")

async function pendingCards(campaignId: Types.ObjectId, combat: TacticalCombat) {
    return MaddoxCampaignMessageModel.find({ campaignId, kind: "combat-action", "combatAction.combatId": String(combat._id), "combatAction.status": "pending" }).sort({ _id: 1 }).lean<IMaddoxCampaignMessage[]>()
}

/** O combate como a correção o vê: ordem, PV, CA, condições, economia dos personagens e os cards ainda não rolados. */
export async function readCombatForFix(jobId: string | undefined): Promise<Record<string, unknown>> {
    const context = await fixContext(jobId)
    const { tacticalView } = await import("./tactical-master")
    const view = (await tacticalView(context.campaign._id, undefined)) ?? {}
    const cards = await pendingCards(context.campaign._id, context.combat)
    return {
        ...view,
        economia: context.combat.tactical.characters
            .filter((state) => !state.left && !state.dead)
            .map((state) => ({
                personagem: state.name,
                acao: state.economy.action,
                acaoBonus: state.economy.bonus,
                reacao: state.economy.reaction,
                ataquesRestantes: state.economy.attacksLeft,
                flags: [state.flags.dodging ? "esquivando" : null, state.flags.disengaged ? "desengajado" : null, state.flags.dashed ? "disparada" : null, state.flags.helped ? `ajudado por ${state.flags.helped.byName}` : null].filter(Boolean),
            })),
        cardsPendentes: cards.map((message) => {
            const action = message.combatAction!
            return {
                card: cardRef(message._id),
                ator: action.actorName,
                acao: action.label,
                passos: action.steps.map((step) => ({ tipo: step.kind, alvo: step.targetName, status: step.status, ...(step.kind === "attack" ? { modo: modeLabel(step.mode), motivos: step.modeReasons ?? [] } : {}) })),
                rolando: action.rollingStep !== null && action.rollingStep !== undefined,
            }
        }),
    }
}

// ── Condições ─────────────────────────────────────────────────────────────────

export interface SetConditionInput {
    alvo: string
    condicao: string
    remover?: boolean
    duracaoRodadas?: number
    esconderse?: boolean
    cd?: number
    motivo: string
}

export async function setCombatCondition(jobId: string | undefined, input: SetConditionInput): Promise<Record<string, unknown>> {
    const context = await fixContext(jobId)
    const key = conditionKeyOf(input.condicao)
    if (!key) throw new QuestionCombatError(`Condição "${input.condicao}" desconhecida. Condições: ${MADDOX_CONDITIONS.map((item) => MADDOX_CONDITION_LABELS[item]).join(", ")}.`)
    const outcome = await mutate(context, (combat) => {
        const target = actorOf(combat, input.alvo)
        if (key === "exhaustion" && target.kind === "character") throw new QuestionCombatError("A exaustão de um personagem jogador fica na ficha: use update_character_exhaustion (com o motivo).")
        const change = applyConditionChange(
            target.state.conditions,
            { key, remove: input.remover, untilRound: input.duracaoRodadas ? combat.tactical.round + input.duracaoRodadas : null, source: input.motivo, hidden: input.esconderse, hiddenDc: input.cd ?? null },
            { name: target.name, immunities: target.kind === "combatant" ? target.state.stats.conditionImmunities : [] },
        )
        target.state.conditions = change.conditions
        return { line: change.line, changed: change.changed, name: target.name, conditions: target.state.conditions.map(conditionDisplayLabel) }
    })
    if (!outcome.changed) return { aplicado: false, resultado: outcome.line, condicoes: outcome.conditions, nota: "Nada mudou no combate: diga isso ao jogador." }
    context.run.conditionWrites = (context.run.conditionWrites ?? 0) + 1
    const line = `${outcome.line}${!input.remover && input.duracaoRodadas ? ` por ${input.duracaoRodadas} rodada(s)` : ""} — ${input.motivo.trim()}`
    await commitFix(context, "set_combat_condition", line, { target: outcome.name, condition: key, remove: Boolean(input.remover) })
    return { aplicado: true, resultado: line, condicoes: outcome.conditions, nota: "Gravado no combate: o card e a ficha já mostram. Só agora diga ao jogador que aplicou." }
}

// ── Card pendente ─────────────────────────────────────────────────────────────

export interface EditActionInput {
    card?: string
    ator?: string
    modo?: "vantagem" | "desvantagem" | "normal"
    alvo?: string
    cancelar?: boolean
    motivo: string
}

async function findCard(context: FixContext, input: EditActionInput): Promise<IMaddoxCampaignMessage & { combatAction: IMaddoxCombatAction }> {
    const cards = (await pendingCards(context.campaign._id, context.combat)) as (IMaddoxCampaignMessage & { combatAction: IMaddoxCombatAction })[]
    if (!cards.length) throw new QuestionCombatError("Não há card de ação pendente (ainda não rolado) neste combate.")
    const wanted = input.card?.trim().toLowerCase()
    const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    const card = wanted ? cards.find((item) => cardRef(item._id) === wanted || String(item._id) === wanted) : input.ator ? [...cards].reverse().find((item) => fold(item.combatAction.actorName) === fold(input.ator!)) : cards.length === 1 ? cards[0] : null
    if (!card) throw new QuestionCombatError(`Card não encontrado. Cards pendentes: ${cards.map((item) => `${cardRef(item._id)} (${item.combatAction.actorName} — ${item.combatAction.label})`).join("; ")}.`)
    return card
}

export async function editCombatAction(jobId: string | undefined, input: EditActionInput): Promise<Record<string, unknown>> {
    const context = await fixContext(jobId)
    if (!input.modo && !input.alvo && !input.cancelar) throw new QuestionCombatError("Informe `modo`, `alvo` ou `cancelar`.")
    const card = await findCard(context, input)
    const action = card.combatAction
    if (action.rollingStep !== null && action.rollingStep !== undefined) throw new QuestionCombatError("Este card está sendo rolado agora: não dá mais para corrigir.")
    const reason = input.motivo.trim()
    if (input.cancelar) {
        // Magia, carga e item já foram gastos no envio: cancelar devolveria só a economia e o recurso se perderia.
        if (!(action as IMaddoxCombatAction & { cancellable?: boolean }).cancellable) throw new QuestionCombatError("Este card já gastou espaço de magia, carga ou item no envio: não dá para cancelar. Corrija o modo ou o alvo, ou deixe o jogador rolar.")
        const { cancelPendingAction } = await import("./tactical-actions")
        try {
            await cancelPendingAction(context.campaign._id, card)
        } catch (error) {
            if (error instanceof DomainError) throw new QuestionCombatError(error.message)
            throw error
        }
        const line = `Card de ${action.actorName} (${action.label}) cancelado; a ação volta — ${reason}`
        await commitFix(context, "edit_combat_action", line, { card: String(card._id), cancel: true })
        return { aplicado: true, resultado: line, nota: "O card foi cancelado e a ação voltou: o jogador escolhe de novo." }
    }
    const steps = action.steps.map((step) => ({ ...step }))
    let targets = action.targets
    const changes: string[] = []
    if (input.alvo) {
        if (steps.some((step) => step.status !== "pending")) throw new QuestionCombatError("Um passo deste card já foi rolado: o alvo não muda mais.")
        if (action.targets.length !== 1) throw new QuestionCombatError("Só dá para trocar o alvo de um card com um alvo.")
        const target = actorOf(context.combat, input.alvo)
        if (target.key === action.actorKey) throw new QuestionCombatError("O alvo não pode ser o próprio ator.")
        const previous = action.targets[0]!.actorKey
        for (const step of steps) if (step.targetKey === previous) Object.assign(step, { targetKey: target.key, targetName: target.name })
        targets = [{ actorKey: target.key, name: target.name }]
        changes.push(`alvo agora é ${target.name}`)
    }
    if (input.modo) {
        const attack = steps.find((step) => step.kind === "attack" && step.status === "pending")
        if (!attack) throw new QuestionCombatError("Este card não tem jogada de ataque pendente: o modo não se aplica.")
        attack.situationalMode = input.modo === "normal" ? null : { mode: input.modo === "vantagem" ? "advantage" : "disadvantage", reason }
        changes.push(input.modo === "normal" ? "sem vantagem/desvantagem da situação" : `${input.modo} (${reason})`)
    }
    const updated = await MaddoxCampaignMessageModel.updateOne(
        { _id: card._id, "combatAction.status": "pending", "combatAction.rollingStep": null },
        { $set: { "combatAction.steps": steps, "combatAction.targets": targets } },
    )
    if (updated.modifiedCount === 0) throw new QuestionCombatError("O card mudou (foi rolado ou cancelado) enquanto você corrigia: confira com get_combat_details.")
    const line = `Card de ${action.actorName} (${action.label}) corrigido: ${changes.join("; ")} — ${reason}`
    await commitFix(context, "edit_combat_action", line, { card: String(card._id), mode: input.modo ?? null, target: input.alvo ?? null })
    const fresh = await MaddoxCampaignMessageModel.findById(card._id).select("combatAction.steps").lean<{ combatAction?: { steps: CombatActionStep[] } }>()
    const attack = fresh?.combatAction?.steps.find((step) => step.kind === "attack" && step.status === "pending")
    return { aplicado: true, resultado: line, ...(attack ? { modoDoAtaque: modeLabel(attack.mode), motivos: attack.modeReasons ?? [] } : {}), nota: "O card já mostra a correção; a rolagem sai assim." }
}

// ── Adversário ────────────────────────────────────────────────────────────────

export interface CorrectCombatantInput {
    adversario: string
    pv?: number
    ca?: number
    foraDeCombate?: boolean
    motivo: string
}

export async function correctCombatant(jobId: string | undefined, input: CorrectCombatantInput): Promise<Record<string, unknown>> {
    const context = await fixContext(jobId)
    if (input.pv === undefined && input.ca === undefined && input.foraDeCombate === undefined) throw new QuestionCombatError("Informe `pv`, `ca` ou `foraDeCombate`.")
    const outcome = await mutate(context, (combat) => {
        const actor = actorOf(combat, input.adversario)
        if (actor.kind !== "combatant") throw new QuestionCombatError(`${actor.name} é um personagem jogador: os PV dele mudam com update_character_hit_points.`)
        const stats = actor.state.stats
        // A linha pública respeita o que a mesa pode ver: PV exato só com a opção da campanha ligada; a CA nunca.
        const showHp = actor.combatant.side === "aliado" ? Boolean(context.campaign.showAllyHp) : Boolean(context.campaign.showEnemyHp)
        const parts: string[] = []
        let hpChanged = false
        if (input.pv !== undefined) {
            stats.hp = Math.max(0, Math.min(stats.hpMax, Math.round(input.pv)))
            hpChanged = true
            if (input.foraDeCombate === undefined) actor.state.defeated = stats.hp <= 0
        }
        if (input.ca !== undefined) {
            stats.ac = Math.max(1, Math.round(input.ca))
            parts.push("CA corrigida")
        }
        if (input.foraDeCombate !== undefined) {
            actor.state.defeated = input.foraDeCombate
            if (!input.foraDeCombate && stats.hp <= 0) stats.hp = 1
            hpChanged = true
        }
        actor.combatant.condition = actor.state.defeated ? "caído" : HP_BAND_LABELS[hpBand(stats.hp, stats.hpMax)].toLowerCase()
        if (hpChanged) parts.unshift(actor.state.defeated ? "fora de combate" : showHp ? `PV ${stats.hp}/${stats.hpMax}` : `PV: ${actor.combatant.condition}`)
        return { name: actor.name, parts, hp: stats.hp, hpMax: stats.hpMax, ac: stats.ac, defeated: actor.state.defeated }
    })
    const line = `${outcome.name}: ${outcome.parts.join(", ")} — ${input.motivo.trim()}`
    await commitFix(context, "correct_combatant", line, { target: outcome.name, hp: outcome.hp, ac: outcome.ac, defeated: outcome.defeated })
    return { aplicado: true, resultado: line, pv: `${outcome.hp}/${outcome.hpMax}`, ca: outcome.ac, foraDeCombate: outcome.defeated, nota: "A linha pública mostra só o que a mesa pode ver (PV exato só com a opção da campanha; a CA nunca)." }
}

// ── Economia e flags do personagem ────────────────────────────────────────────

export interface CorrectTurnInput {
    personagem: string
    acao?: boolean
    acaoBonus?: boolean
    reacao?: boolean
    ataquesRestantes?: number
    esquivando?: boolean
    desengajado?: boolean
    disparada?: boolean
    ajudado?: boolean
    motivo: string
}

export async function correctCharacterTurn(jobId: string | undefined, input: CorrectTurnInput): Promise<Record<string, unknown>> {
    const context = await fixContext(jobId)
    const fields: (keyof CorrectTurnInput)[] = ["acao", "acaoBonus", "reacao", "ataquesRestantes", "esquivando", "desengajado", "disparada", "ajudado"]
    if (!fields.some((field) => input[field] !== undefined)) throw new QuestionCombatError("Informe o que muda (acao, acaoBonus, reacao, ataquesRestantes, esquivando, desengajado, disparada ou ajudado).")
    const yes = (value: boolean) => (value ? "disponível" : "gasta")
    const outcome = await mutate(context, (combat) => {
        const actor = actorOf(combat, input.personagem)
        if (actor.kind !== "character") throw new QuestionCombatError(`${actor.name} é um adversário: use correct_combatant ou set_combat_condition.`)
        const { economy, flags } = actor.state
        const parts: string[] = []
        if (input.acao !== undefined) {
            economy.action = input.acao
            if (input.acao) Object.assign(economy, { attackAction: false, attacksLeft: 0 })
            parts.push(`Ação ${yes(input.acao)}`)
        }
        if (input.acaoBonus !== undefined) {
            economy.bonus = input.acaoBonus
            parts.push(`Ação bônus ${yes(input.acaoBonus)}`)
        }
        if (input.reacao !== undefined) {
            economy.reaction = input.reacao
            parts.push(`Reação ${yes(input.reacao)}`)
        }
        if (input.ataquesRestantes !== undefined) {
            economy.attacksLeft = Math.max(0, Math.min(8, Math.round(input.ataquesRestantes)))
            if (economy.attacksLeft > 0) economy.attackAction = true
            parts.push(`${economy.attacksLeft} ataque(s) restante(s)`)
        }
        if (input.esquivando !== undefined) {
            flags.dodging = input.esquivando
            parts.push(input.esquivando ? "esquivando" : "sem Esquivar")
        }
        if (input.desengajado !== undefined) {
            flags.disengaged = input.desengajado
            parts.push(input.desengajado ? "desengajado" : "sem Desengajar")
        }
        if (input.disparada !== undefined) {
            flags.dashed = input.disparada
            parts.push(input.disparada ? "com Disparada" : "sem Disparada")
        }
        if (input.ajudado !== undefined) {
            flags.helped = input.ajudado ? { byName: "Maddox", byKey: "maddox", targetKey: null } : null
            parts.push(input.ajudado ? "ajudado (vantagem no próximo ataque)" : "sem Ajuda")
        }
        return { name: actor.name, parts }
    })
    const line = `${outcome.name}: ${outcome.parts.join(", ")} — ${input.motivo.trim()}`
    await commitFix(context, "correct_character_turn", line, { target: outcome.name })
    return { aplicado: true, resultado: line }
}

/** A referência curta de um card (a mesma que `get_combat_details` mostra). */
export const combatCardRef = cardRef
