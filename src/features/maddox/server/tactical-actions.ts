import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { SkillName } from "@/features/character-sheets/types/character-sheet.types"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_COMBAT_OFFLINE_GRACE_MS, MADDOX_COMBAT_ROLL_CLAIM_STALE_MS, MADDOX_DECLARATION_VALIDATION_RIGORS, MADDOX_STANDARD_ACTION_DEFS, type MaddoxStandardAction } from "../constants"
import { MADDOX_ABILITY_LABELS } from "../check-modifier"
import { adjustDamage, attackMode, attackOutcome, autoCritical, criticalExpression, deathSave, exhaustionPenalty, formatDiceExpression, hasCondition, parseDiceExpression, saveMode } from "../combat-rules"
import { findCombatOption, weaponItemId, type CombatOption } from "../combat-options"
import type { CombatActionStep, IMaddoxCombatAction, IMaddoxCombatRoll, TacticalCharacterState } from "../combat-types"
import type { MaddoxCombatActionInput, MaddoxEndCombatTurnInput } from "../combat-schemas"
import type { MaddoxGameStateDto } from "../game-types"
import { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMember, type IMaddoxCampaignMessage } from "../models"
import { assertMemberCanPlay } from "./campaigns"
import { emitCombatRolled, emitCombatStepRolled } from "./game-live"
import { assertActive, assertPlayersTurn, characterOf, evaluateTurn, getGameState, loadAsMember, publishGameChanged, recordTurnAction } from "./game"
import { d20Expression, findActiveTactical, findActor, keptD20Of, mutateTactical, rollExpression, scheduleAbsenceCheck, type CombatActor, type TacticalCombat } from "./tactical-combat"
import { characterDamage, characterHealing, concentrationRollDoc, damageCombatant, type CharacterHp } from "./tactical-master"
import { isOpexUserId } from "./opex-members"
import { masteryLabel } from "../weapon-mastery"

/**
 * A vez do personagem no combate tático (Maddox 7) — SOMENTE servidor; `userId` é o usuário EFETIVO. O jogador escolhe
 * pela Ação ou pela Ação bônus uma opção que o servidor recalculou da ficha (`me.combat.options`): ataque, magia, item,
 * habilidade, ação comum ou "Outra ação" (texto livre validado pelo rigor). Cada rolagem é do jogador (motor de dados com
 * as regras de dado dele) e o servidor aplica o resultado: PV dos adversários no combate e PV dos personagens na ficha.
 * "Encerrar turno" grava a vez (o resumo vai para o Maddox) e fecha o turno dos jogadores.
 */

const log = loggerFor({ module: "maddox", feature: "tactical-actions" })

type CampaignDoc = IMaddoxCampaign
type MemberDoc = IMaddoxCampaignMember
type MessageDoc = IMaddoxCampaignMessage

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))

/** A vez do personagem do usuário (DND-41: também usada pelo pedido de ajuste). */
export const loadMyCombatTurn = (campaignId: string, userId: string) => loadMyTurn(campaignId, userId)

async function loadMyTurn(campaignId: string, userId: string): Promise<{ campaign: CampaignDoc; member: MemberDoc; combat: TacticalCombat; actor: Extract<CombatActor, { kind: "character" }> }> {
    const { campaign, member } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    await assertMemberCanPlay(campaignId, userId)
    assertPlayersTurn(campaign)
    const combatActor = campaign.turn.combatActor
    if (!combatActor) throw new DomainError(409, "Não há combate tático em andamento.", "NO_COMBAT")
    if (String(combatActor.memberId) !== String(member._id)) throw new DomainError(409, "Não é a vez do seu personagem.", "NOT_YOUR_COMBAT_TURN")
    const combat = await findActiveTactical(campaign._id)
    const actor = combat ? findActor(combat, combatActor.actorKey) : null
    if (!combat || !actor || actor.kind !== "character") throw new DomainError(409, "Não há combate tático em andamento.", "NO_COMBAT")
    return { campaign, member, combat, actor }
}

const sheetHp = async (state: TacticalCharacterState): Promise<CharacterHp | null> => {
    if (!state.sheetId) return null
    const { loadCombatSheets } = await import("./combat-sheet")
    const sheet = (await loadCombatSheets([state.sheetId])).get(state.sheetId)
    return sheet ? { ...sheet.hp, deathSaves: { ...sheet.deathSaves } } : null
}

async function writeHp(state: TacticalCharacterState, hp: CharacterHp) {
    if (!state.sheetId) return
    const { writeSheetHitPoints } = await import("./combat-sheet")
    await writeSheetHitPoints(state.sheetId, { hp: hp.hp, tempHp: hp.tempHp, deathSaves: hp.deathSaves })
}

/** Trava de rolagem mais antiga que isto foi abandonada (processo morto entre a reivindicação e a gravação). */
const staleClaimCutoff = () => new Date(Date.now() - MADDOX_COMBAT_ROLL_CLAIM_STALE_MS)

const newStep = (input: Partial<CombatActionStep> & Pick<CombatActionStep, "kind">): CombatActionStep => ({
    targetKey: null,
    targetName: null,
    status: "pending",
    roller: "player",
    dice: "",
    mode: "normal",
    roll: null,
    total: null,
    hit: null,
    critical: false,
    success: null,
    amount: null,
    damageType: null,
    note: null,
    skill: null,
    ...input,
})

function resolveTargets(combat: TacticalCombat, option: CombatOption, actor: Extract<CombatActor, { kind: "character" }>, keys: readonly string[]): CombatActor[] {
    if (option.target === "self") return [actor]
    if (option.target === "none") return []
    const unique = [...new Set(keys)]
    if (!unique.length) throw new DomainError(400, "Escolha o alvo.", "TARGET_REQUIRED")
    if (!option.multiTarget && unique.length > 1) throw new DomainError(400, "Esta opção tem um alvo só.", "SINGLE_TARGET")
    return unique.map((key) => {
        const target = findActor(combat, key)
        if (!target) throw new DomainError(400, "Alvo fora do combate.", "INVALID_TARGET")
        if (option.target === "enemy" && (target.kind !== "combatant" || target.state.defeated)) throw new DomainError(400, `${target.name} não é um alvo válido.`, "INVALID_TARGET")
        if (option.target === "ally" && (target.kind !== "character" || target.state.dead || target.state.left)) throw new DomainError(400, `${target.name} não é um aliado válido.`, "INVALID_TARGET")
        return target
    })
}

const STANDARD_SKILL_ABILITY: Partial<Record<MaddoxStandardAction, string>> = { hide: "Destreza", influence: "Carisma", search: "Sabedoria", study: "Inteligência" }

/** Ação ou Ação bônus do personagem da vez. */
export async function submitCombatAction(campaignId: string, input: MaddoxCombatActionInput, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, member, combat, actor } = await loadMyTurn(campaignId, userId)
    const turnNumber = campaign.turn.number
    const pending = await MaddoxCampaignMessageModel.exists({ campaignId: campaign._id, turnNumber, kind: "combat-action", "combatAction.actorKey": actor.key, "combatAction.status": "pending" })
    if (pending) throw new DomainError(409, "Termine (ou cancele) a ação em andamento antes de outra.", "ACTION_PENDING")
    const { loadCharacterOptions } = await import("./tactical-options")
    const view = (await loadCharacterOptions([actor.state], campaign._id, combat._id)).get(actor.key)
    if (!view) throw new DomainError(409, "A ficha do personagem não foi encontrada.", "SHEET_REQUIRED")
    const option = findCombatOption(view.options, input.economy, input.optionId)
    if (!option) throw new DomainError(409, "Esta opção não está disponível agora para o seu personagem.", "OPTION_UNAVAILABLE")
    const targets = resolveTargets(combat, option, actor, input.targets ?? [])
    const freeText = input.freeText?.trim() || null
    const character = await characterOf(member)

    if (option.resolution === "free" || option.uncertain) {
        if (!freeText) throw new DomainError(400, "Descreva o que o personagem faz.", "FREE_TEXT_REQUIRED")
        if (MADDOX_DECLARATION_VALIDATION_RIGORS.includes(campaign.rigor)) {
            const { validateDeclaration } = await import("./action-validation")
            const conditions = actor.state.conditions.map((condition) => condition.key).join(", ") || "nenhuma"
            const combatText = [`- Gasta: ${option.economy === "bonus" ? "Ação bônus" : "Ação"}${option.uncertain ? ` (usando ${option.label})` : ""}`, `- Condições: ${conditions}`, `- Ficha: ${view.sheet.option.level}º nível, CA ${view.sheet.armorClass}, PV ${view.sheet.hp.hp}/${view.sheet.hp.hpMax}`].join("\n")
            const verdict = await validateDeclaration({ campaign, character, content: freeText, combat: combatText })
            if (!verdict.valid) throw new DomainError(409, verdict.reason, "ACTION_INVALID")
        }
    }
    if (option.resolution === "check" && option.skills?.length && (!input.skill || !option.skills.includes(input.skill))) throw new DomainError(400, `Escolha a perícia: ${option.skills.join(", ")}.`, "SKILL_REQUIRED")
    const spellLevel = option.spell && option.spell.circle > 0 ? (input.spellLevel ?? option.spell.levels[0]) : null
    if (option.spell && option.spell.circle > 0 && (!spellLevel || !option.spell.levels.includes(spellLevel))) throw new DomainError(409, "Não há espaço de magia livre nesse círculo.", "SPELL_SLOT_UNAVAILABLE")

    // Os dados que o servidor precisa para resolver a opção: sem eles, recusa antes de reservar ou gastar qualquer coisa.
    const unresolvable = option.resolution === "attack" ? !option.attack : option.resolution === "auto" ? !option.attack?.damage : option.resolution === "heal" ? !option.heal?.dice : false
    if (unresolvable) {
        log.warn({ campaignId, option: option.id, resolution: option.resolution }, "[maddox] opção de combate sem os dados para resolver")
        throw new DomainError(409, "Esta opção não tem os dados para o servidor resolver; use \"Outra ação\" e descreva o efeito.", "OPTION_UNRESOLVABLE")
    }

    // DND-49: o ataque furtivo é perguntado DEPOIS do acerto (passo `sneak-choice`); aqui só se a opção pode somá-lo.
    const sneakRider = option.attack?.riders?.find((item) => item.key === "sneak-attack") ?? null
    // DND-49 — Maestria Trespassar: o 2º ataque é contra OUTRO inimigo.
    if (option.id.startsWith("cleave:") && targets[0]?.key === actor.state.economy.cleave?.targetKey) throw new DomainError(409, "O ataque da Maestria Trespassar é contra outro inimigo, a até 1,5 m do primeiro alvo.", "CLEAVE_SAME_TARGET")

    // Passos e efeitos imediatos.
    const steps: CombatActionStep[] = []
    const notes: string[] = []
    let status: IMaddoxCombatAction["status"] = "pending"
    const standard = option.id.startsWith("standard:") ? (option.id.slice("standard:".length) as MaddoxStandardAction) : null
    if (option.resolution === "attack") {
        // DND-49: prévia do modo (o rolador já mostra os dois d20 com o motivo); a rolagem recalcula e é a que vale.
        const preview = attackMode({ attacker: actor.state, target: targets[0]!.state, ranged: Boolean(option.attack!.ranged), helped: Boolean(actor.state.flags.helped), targetKey: targets[0]!.key })
        steps.push(newStep({ kind: "attack", targetKey: targets[0]!.key, targetName: targets[0]!.name, dice: d20Expression(option.attack!.bonus + exhaustionPenalty(actor.state)), mode: preview.mode, modeReasons: preview.reasons }))
        // O dano já fica no card: rolado só se o ataque acertar (o erro o marca como pulado).
        if (option.attack!.damage && option.attack!.damage !== "0") steps.push(newStep({ kind: "damage", targetKey: targets[0]!.key, targetName: targets[0]!.name, dice: option.attack!.damage, damageType: option.attack!.damageType }))
    }
    else if (option.resolution === "auto") steps.push(newStep({ kind: "damage", targetKey: targets[0]?.key ?? null, targetName: targets[0]?.name ?? null, dice: option.attack!.damage, damageType: option.attack!.damageType }))
    else if (option.resolution === "heal") steps.push(newStep({ kind: "heal", targetKey: targets[0]!.key, targetName: targets[0]!.name, dice: option.heal!.dice }))
    else if (option.resolution === "save" && option.save) {
        if (option.save.damage) steps.push(newStep({ kind: "damage", dice: option.save.damage, damageType: option.save.damageType, note: `salvaguarda de ${MADDOX_ABILITY_LABELS[option.save.ability]} CD ${option.save.dc}` }))
        else {
            for (const target of targets) {
                if (target.kind !== "combatant") continue
                const forced = saveMode(target.state, option.save.ability)
                const roll = forced === "fail" ? null : await rollExpression(d20Expression(target.state.stats.saves[option.save.ability] ?? 0), { mode: forced, label: `${target.name} · salvaguarda` })
                steps.push(newStep({ kind: "save", targetKey: target.key, targetName: target.name, status: "done", roller: "server", roll, total: roll?.total ?? null, success: roll ? roll.total >= option.save.dc : false, note: roll ? null : "falha automática" }))
            }
            status = "resolved"
        }
    } else if (option.resolution === "check" && standard) {
        steps.push(newStep({ kind: "check", skill: input.skill ?? option.skills?.[0] ?? null, dice: "1d20", note: standard === "hide" ? "CD 15" : null }))
    } else status = "resolved"

    // Reserva a Ação/Ação bônus (troca condicional pela versão do combate) ANTES de gastar recursos da ficha: uma
    // confirmação concorrente cai em ACTION_ALREADY_USED sem perder espaço, carga ou item.
    let snapshot: Pick<TacticalCharacterState, "economy" | "concentration" | "flags" | "ready" | "conditions"> | null = null
    let revealed = false
    await mutateTactical(campaign._id, (current) => {
        const me = findActor(current, actor.key)
        if (!me || me.kind !== "character") throw new DomainError(409, "Não há combate tático em andamento.", "NO_COMBAT")
        snapshot = structuredClone({ economy: me.state.economy, concentration: me.state.concentration, flags: me.state.flags, ready: me.state.ready, conditions: me.state.conditions })
        revealed = false
        const economy = me.state.economy
        if (option.id.startsWith("offhand:") && option.economy === "action") {
            // DND-49 — Maestria Ágil: o ataque extra da propriedade Leve entra na ação Atacar (sem gastar a Ação bônus).
            if (!economy.lightAttack || economy.lightExtraUsed) throw new DomainError(409, "O ataque extra da propriedade Leve já foi feito neste turno.", "ACTION_ALREADY_USED")
            economy.lightExtraUsed = true
        } else if (option.id.startsWith("cleave:")) {
            if (!economy.cleave || economy.cleaveUsed) throw new DomainError(409, "A Maestria Trespassar já foi usada neste turno.", "ACTION_ALREADY_USED")
            economy.cleaveUsed = true
        } else if (option.economy === "bonus") {
            if (!economy.bonus) throw new DomainError(409, "Você já usou a Ação bônus neste turno.", "ACTION_ALREADY_USED")
            economy.bonus = false
            if (option.id.startsWith("offhand:")) economy.lightExtraUsed = true
        } else if (option.category === "weapons" && option.resolution === "attack") {
            if (economy.action) {
                economy.action = false
                economy.attackAction = true
                economy.attacksLeft = Math.max(0, view.options.attacksPerAction - 1)
            } else if (economy.attackAction && economy.attacksLeft > 0) economy.attacksLeft -= 1
            else throw new DomainError(409, "Você já usou a Ação neste turno.", "ACTION_ALREADY_USED")
            if (option.attack?.light && !economy.lightAttack) {
                economy.lightAttack = true
                economy.lightWeaponId = weaponItemId(option.id)
            }
        } else {
            if (!economy.action) throw new DomainError(409, "Você já usou a Ação neste turno.", "ACTION_ALREADY_USED")
            economy.action = false
        }
        if (spellLevel) economy.slotSpellCast = true
        // DND-49: conjurar magia com componente Verbal revela quem estava escondido (sai o Invisível do Esconder-se).
        if (option.spell?.verbal && me.state.conditions.some(isHiddenCondition)) {
            me.state.conditions = me.state.conditions.filter((condition) => !isHiddenCondition(condition))
            revealed = true
        }
        if (option.spell?.concentration) me.state.concentration = { spell: option.label, sinceRound: current.tactical.round }
        if (standard === "dodge") me.state.flags.dodging = true
        if (standard === "disengage") me.state.flags.disengaged = true
        if (standard === "dash") me.state.flags.dashed = true
        if (standard === "help") {
            const ally = targets[0]
            const target = ally ? findActor(current, ally.key) : null
            if (target) target.state.flags.helped = { byName: me.name, byKey: me.key, targetKey: null }
        }
        if (standard === "ready") {
            const readied = input.readyOptionId ? (findCombatOption(view.options, "action", input.readyOptionId) ?? null) : null
            me.state.ready = { optionId: readied?.id ?? "free", label: readied?.label ?? (freeText ?? "ação preparada"), trigger: input.readyTrigger?.trim() || freeText || "gatilho descrito" }
        }
        // Save sem dano: aplica a salvaguarda rolada aos alvos (o efeito, o Maddox narra).
        return null
    })

    // Recursos da ficha, depois da reserva; se um gasto falhar, a economia e os efeitos da reserva voltam.
    const sheetId = actor.state.sheetId!
    const { spendSpellSlot, spendResourceCharge, consumeSheetItem } = await import("./combat-sheet")
    const refund = async () => {
        const previous = snapshot
        if (!previous) return
        await mutateTactical(campaign._id, (live) => {
            const me = findActor(live, actor.key)
            if (!me || me.kind !== "character") return
            Object.assign(me.state, structuredClone(previous))
        }).catch((error: unknown) => log.warn({ campaignId, actor: actor.name, err: error }, "[maddox] não foi possível devolver a economia depois de um gasto recusado"))
    }
    if (spellLevel && !(await spendSpellSlot(sheetId, spellLevel))) {
        await refund()
        throw new DomainError(409, "Não há espaço de magia livre nesse círculo.", "SPELL_SLOT_UNAVAILABLE")
    }
    if (option.charges && !(await spendResourceCharge(sheetId, option.charges.chargeId))) {
        await refund()
        throw new DomainError(409, "Esta habilidade não tem mais usos.", "NO_CHARGES")
    }
    const consumedItem = option.consumes?.itemId ?? (option.category === "items" && option.id.startsWith("item:") ? option.id.split(":")[1]! : null)
    if (consumedItem && !(await consumeSheetItem(sheetId, consumedItem))) {
        await refund()
        throw new DomainError(409, "Você não tem mais esse item.", "ITEM_UNAVAILABLE")
    }

    if (standard === "dodge" || standard === "disengage" || standard === "dash") notes.push(MADDOX_STANDARD_ACTION_DEFS[standard].detail)
    if (standard === "ready") notes.push(`Preparou: ${input.readyTrigger?.trim() || freeText || "gatilho descrito"}`)
    if (option.spell?.concentration) notes.push("concentração")
    if (revealed) notes.push("saiu do esconderijo (componente Verbal)")
    if (option.id.startsWith("cleave:")) notes.push("o jogador declara o alvo a até 1,5 m do primeiro")

    const doc: IMaddoxCombatAction = {
        combatId: String(combat._id),
        round: combat.tactical.round,
        actorKey: actor.key,
        actorName: actor.name,
        actorKind: "character",
        economy: option.economy,
        category: option.category,
        optionId: option.id,
        label: option.label,
        targets: targets.map((target) => ({ actorKey: target.key, name: target.name })),
        spellLevel,
        freeText,
        status: status === "resolved" && steps.some((item) => item.status === "pending") ? "pending" : status,
        steps,
        summary: "",
        waitRound: null,
        save: option.save ? { ability: option.save.ability, dc: option.save.dc, halfOnSave: option.save.halfOnSave } : null,
        ranged: Boolean(option.attack?.ranged),
        sneakAttack: null,
        sneakRider: sneakRider ? { dice: sneakRider.dice } : null,
        mastery: option.attack?.mastery && option.resolution === "attack" ? { key: option.attack.mastery, modifier: option.attack.modifier ?? 0, proficiency: view.sheet.option.proficiencyBonus } : null,
    }
    doc.summary = actionSummary(doc, notes)
    const message = await MaddoxCampaignMessageModel.create({
        campaignId: campaign._id,
        turnNumber,
        phase: "players",
        kind: "combat-action",
        memberId: member._id,
        userId,
        characterId: character?._id ?? null,
        characterName: character?.name ?? actor.name,
        content: "",
        combatAction: { ...doc, cancellable: !spellLevel && !option.charges && option.category !== "items" && steps.length > 0 },
    })
    log.info({ campaignId, turnNumber, actor: actor.name, option: option.id, economy: option.economy, messageId: String(message._id) }, "[maddox] ação do personagem no combate")
    // Salvaguardas dos adversários roladas pelo servidor (DND-25): todos veem o dado rolar no card.
    emitServerSteps(campaignId, String(message._id), [], steps)
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

/** Invisível vindo do Esconder-se (DND-49: sai depois de um ataque ou de uma magia com componente Verbal). */
const isHiddenCondition = (condition: { key: string; source?: string }) => condition.key === "invisible" && condition.source === "Esconder"

/**
 * DND-49: ataque que acertou sem vantagem nem desvantagem — o furtivo vale com um aliado consciente a até 1,5 m do alvo
 * (JEV com a chave ligada; senão, geração curta do narrador). Falha da conferência = vale (o jogo não trava; fica no log).
 */
async function sneakAllyCondition(campaign: CampaignDoc, combat: TacticalCombat, actor: Extract<CombatActor, { kind: "character" }>, target: CombatActor): Promise<boolean> {
    try {
        const allies = combat.tactical.characters.filter((state) => state.actorKey !== actor.key && !state.left && !state.dead && !state.hpZero).map((state) => state.name)
        const allyCombatants = combat.combatants.filter((item) => item.side === "aliado" && item.tactical && !item.tactical.defeated).map((item) => item.name)
        const recent = await MaddoxCampaignMessageModel.find({ campaignId: campaign._id, kind: "declaration", combatTurn: true }).sort({ _id: -1 }).limit(6).select("content").lean<{ content: string }[]>()
        const situation = [campaign.state?.situation?.trim() ?? "", ...recent.reverse().map((item) => item.content)].filter(Boolean).join("\n\n")
        const { checkSneakAttackCondition } = await import("./combat-prep-ai")
        const verdict = await checkSneakAttackCondition({ campaign, characterName: actor.name, targetName: target.name, allies: [...allies, ...allyCombatants], situation })
        return verdict.ok
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] conferência do ataque furtivo indisponível; o ataque furtivo foi oferecido")
        return true
    }
}

/** O ataque deste passo (o mais recente antes dele: entre o ataque e o dano pode haver a escolha do furtivo). */
const attackBefore = (steps: readonly CombatActionStep[], index: number) => [...steps.slice(0, index)].reverse().find((item) => item.kind === "attack")

/** Dados que o servidor rolou num card (salvaguarda de um adversário) e que ainda não estavam rolados antes. */
function emitServerSteps(campaignId: string, messageId: string, before: readonly CombatActionStep[], after: readonly CombatActionStep[]) {
    after.forEach((item, index) => {
        if (item.roller !== "server" || item.kind !== "save" || !item.roll || before[index]?.roll) return
        emitCombatStepRolled(campaignId, messageId, index, item.roll)
    })
}

/** Resumo da ação para o Maddox e a transcrição. */
export function actionSummary(action: IMaddoxCombatAction, notes: readonly string[] = []): string {
    const slot = action.economy === "bonus" ? "Ação bônus" : action.economy === "reaction" ? "Reação" : "Ação"
    const targets = action.targets.length ? ` em ${action.targets.map((target) => target.name).join(", ")}` : ""
    const parts = action.steps
        .filter((item) => item.status === "done")
        .map((item) => {
            if (item.kind === "attack") return `${item.targetName ?? "alvo"}: ${item.hit ? (item.critical ? "CRÍTICO" : "acertou") : "errou"} (${item.total})`
            if (item.kind === "damage") return `${item.amount ?? item.total} de dano${item.damageType ? ` ${item.damageType}` : ""}${item.targetName ? ` em ${item.targetName}` : ""}${item.note ? ` (${item.note})` : ""}`
            if (item.kind === "heal") return `${item.targetName ?? "alvo"} recuperou ${item.amount ?? 0} PV`
            if (item.kind === "save") return `${item.targetName}: salvaguarda ${item.success ? "sucesso" : "falha"}${item.total !== null ? ` (${item.total})` : ""}${item.amount ? `, ${item.amount} de dano` : ""}${item.note ? ` (${item.note})` : ""}`
            if (item.kind === "check") return `teste de ${item.skill ?? "perícia"}: ${item.total}${item.success === null ? "" : item.success ? " (sucesso)" : " (falha)"}`
            if (item.kind === "sneak-choice") return item.success ? `somou o ataque furtivo (+${item.dice})` : "não somou o ataque furtivo"
            return ""
        })
        .filter(Boolean)
    const free = action.freeText ? `: "${action.freeText}"` : ""
    const spell = action.spellLevel ? ` (${action.spellLevel}º círculo)` : ""
    const sneak = action.sneakAttack ? ` + Ataque furtivo (+${action.sneakAttack.dice})` : ""
    const allNotes = [...notes, ...(action.masteryNotes ?? [])]
    return `${action.actorName} — ${slot}: ${action.label}${sneak}${spell}${targets}${free}${parts.length ? ` → ${parts.join("; ")}` : ""}${allNotes.length ? ` [${allNotes.join("; ")}]` : ""}${action.status === "cancelled" ? " (cancelada)" : ""}`
}

/** O jogador rola o próximo passo pendente da ação (ataque, dano, cura, teste). */
export async function rollCombatAction(campaignId: string, actionId: string, userId: string): Promise<{ roll: DiceRollResponse; state: MaddoxGameStateDto }> {
    const { campaign, member } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    if (!Types.ObjectId.isValid(actionId)) throw new DomainError(404, "Ação não encontrada", "NOT_FOUND")
    const message = await MaddoxCampaignMessageModel.findOne({ _id: new Types.ObjectId(actionId), campaignId: campaign._id, kind: "combat-action" }).lean<MessageDoc>()
    const action = message?.combatAction
    if (!message || !action) throw new DomainError(404, "Ação não encontrada", "NOT_FOUND")
    if (String(message.memberId) !== String(member._id)) throw new DomainError(403, "Esta ação é de outro jogador.", "NOT_ACTION_OWNER")
    await assertMemberCanPlay(campaignId, userId)
    if (action.status !== "pending") throw new DomainError(409, "Esta ação já foi resolvida.", "ACTION_RESOLVED")
    const index = action.steps.findIndex((item) => item.status === "pending")
    if (index < 0) throw new DomainError(409, "Esta ação já foi resolvida.", "ACTION_RESOLVED")
    if (action.steps[index]!.kind === "sneak-choice") throw new DomainError(409, "Escolha antes se soma o ataque furtivo ao dano.", "SNEAK_CHOICE_PENDING")
    const combat = await findActiveTactical(campaign._id)
    const actor = combat ? findActor(combat, action.actorKey) : null
    if (!combat || !actor || actor.kind !== "character") throw new DomainError(409, "O combate terminou.", "NO_COMBAT")

    // Reivindica o passo ANTES de rolar: duas chamadas no mesmo card (dois cliques, retentativa de rede) não aplicam o
    // efeito duas vezes — só quem marca `rollingStep` rola; a outra recebe 409. A trava expira depois de
    // `MADDOX_COMBAT_ROLL_CLAIM_STALE_MS` (processo morto no meio): a próxima tentativa assume, e só o dono da
    // reivindicação (`rollingAt`) grava o resultado.
    const claimedAt = new Date()
    const claimed = await MaddoxCampaignMessageModel.updateOne(
        { _id: message._id, "combatAction.status": "pending", [`combatAction.steps.${index}.status`]: "pending", $or: [{ "combatAction.rollingStep": null }, { "combatAction.rollingAt": { $lt: staleClaimCutoff() } }] },
        { $set: { "combatAction.rollingStep": index, "combatAction.rollingAt": claimedAt, "combatAction.cancellable": false } },
    )
    if (claimed.modifiedCount === 0) throw new DomainError(409, "Este passo já está sendo rolado.", "ACTION_RESOLVED")
    const release = () => MaddoxCampaignMessageModel.updateOne({ _id: message._id, "combatAction.rollingAt": claimedAt }, { $set: { "combatAction.rollingStep": null, "combatAction.rollingAt": null, "combatAction.cancellable": action.cancellable ?? false } }).catch(() => undefined)
    try {
        return await rollClaimedStep(campaignId, userId, campaign, message, action, index, combat, actor, claimedAt)
    } catch (error) {
        await release()
        throw error
    }
}

async function rollClaimedStep(
    campaignId: string,
    userId: string,
    campaign: CampaignDoc,
    message: MessageDoc,
    action: IMaddoxCombatAction,
    index: number,
    combat: TacticalCombat,
    actor: Extract<CombatActor, { kind: "character" }>,
    claimedAt: Date,
): Promise<{ roll: DiceRollResponse; state: MaddoxGameStateDto }> {
    const actionId = String(message._id)
    const current = action.steps[index]!
    const { loadCharacterOptions } = await import("./tactical-options")
    const view = (await loadCharacterOptions([actor.state], undefined, combat._id)).get(actor.key)
    const { sheetSkill } = await import("./combat-sheet")

    // Rola fora da troca condicional: uma nova tentativa de gravação não rola de novo.
    let roll: DiceRollResponse
    let mode: CombatActionStep["mode"] = "normal"
    let modeReasons: string[] = []
    let helpedUsed = false
    let vexUsed = false
    let sneakOffer = false
    let toppleRoll: DiceRollResponse | null | undefined
    const target = current.targetKey ? findActor(combat, current.targetKey) : null
    const mastery = action.mastery ?? null
    const toppleDc = mastery ? 8 + mastery.modifier + mastery.proficiency : 0
    if (current.kind === "attack") {
        if (!target) throw new DomainError(409, "O alvo saiu do combate.", "INVALID_TARGET")
        const ranged = Boolean(action.ranged)
        const helped = Boolean(actor.state.flags.helped)
        const computed = attackMode({ attacker: actor.state, target: target.state, ranged, helped, targetKey: target.key })
        mode = computed.mode
        modeReasons = computed.reasons
        vexUsed = computed.reasons.includes("Maestria Afligir")
        helpedUsed = helped
        roll = await rollExpression(current.dice, { mode, label: `${action.label} · ataque`, userId: message.userId })
        const ac = target.kind === "combatant" ? target.state.stats.ac : 10
        const hit = attackOutcome(keptD20Of(roll), roll.total, ac, autoCritical(target.state, ranged)).hit
        // DND-49: furtivo perguntado depois do acerto — uma vez por turno, nunca com desvantagem; com vantagem vale direto,
        // sem ela, com um aliado a até 1,5 m do alvo.
        if (hit && action.sneakRider && !actor.state.economy.sneakAttackUsed && !computed.disadvantage && action.steps[index + 1]?.kind === "damage") {
            sneakOffer = computed.advantage || (await sneakAllyCondition(campaign, combat, actor, target))
        }
        // DND-49 — Maestria Derrubar: o alvo atingido faz salvaguarda de Constituição (o servidor rola UMA vez, aqui).
        if (hit && mastery?.key === "topple" && target.kind === "combatant" && !hasCondition(target.state, "prone")) {
            const forced = saveMode(target.state, "constitution")
            toppleRoll = forced === "fail" ? null : await rollExpression(d20Expression(target.state.stats.saves.constitution ?? 0), { mode: forced, label: `${target.name} · salvaguarda (Maestria Derrubar)` })
        }
    } else if (current.kind === "check") {
        const skill = (current.skill ?? "Furtividade") as SkillName
        const modifier = view ? sheetSkill(view.sheet, skill).value + exhaustionPenalty(actor.state) : 0
        roll = await rollExpression(d20Expression(modifier), { label: `Teste de ${skill}`, userId: message.userId })
    } else {
        const previous = attackBefore(action.steps, index)
        const expression = parseDiceExpression(current.dice)
        const critical = Boolean(previous?.critical)
        roll = await rollExpression(expression ? formatDiceExpression(critical ? criticalExpression(expression) : expression) : current.dice, { label: `${action.label} · ${current.kind === "heal" ? "cura" : "dano"}`, userId: message.userId })
    }

    // Magia de salvaguarda: as salvaguardas dos adversários são roladas UMA vez, aqui (o callback abaixo pode rodar de novo).
    const areaSpell = current.kind === "damage" && action.category === "spells" && action.targets.length > 0 && !action.steps.some((item) => item.kind === "attack")
    const saveRolls = new Map<string, DiceRollResponse | null>()
    if (areaSpell && action.save) {
        for (const ref of action.targets) {
            const each = findActor(combat, ref.actorKey)
            if (each?.kind !== "combatant") continue
            const forced = saveMode(each.state, action.save.ability)
            saveRolls.set(each.key, forced === "fail" ? null : await rollExpression(d20Expression(each.state.stats.saves[action.save.ability] ?? 0), { mode: forced, label: `${each.name} · salvaguarda` }))
        }
    }

    // Cópias de trabalho refeitas a cada execução do callback (conflito de versão = nova execução, sem acumular).
    let steps: CombatActionStep[] = []
    let hpWrites: { state: TacticalCharacterState; hp: CharacterHp }[] = []
    let extraRolls: Record<string, unknown>[] = []
    let masteryNotes: string[] = []

    await mutateTactical(campaign._id, async (live) => {
        steps = action.steps.map((item) => ({ ...item }))
        hpWrites = []
        extraRolls = []
        masteryNotes = [...(action.masteryNotes ?? [])]
        const done = steps[index]!
        done.status = "done"
        done.roll = roll
        done.total = roll.total
        done.mode = mode
        const me = findActor(live, actor.key)
        if (!me || me.kind !== "character") return
        if (helpedUsed) me.state.flags.helped = null
        const liveTarget = done.targetKey ? findActor(live, done.targetKey) : null
        if (done.kind === "attack") {
            done.modeReasons = modeReasons
            // DND-49: o ataque revela quem estava escondido (a vantagem já valeu para este ataque) e gasta o Afligir usado.
            me.state.conditions = me.state.conditions.filter((condition) => !isHiddenCondition(condition))
            if (vexUsed) me.state.flags.vex = null
        }
        if (done.kind === "attack" && liveTarget) {
            const ac = liveTarget.kind === "combatant" ? liveTarget.state.stats.ac : 10
            const ranged = Boolean(action.ranged)
            const outcome = attackOutcome(keptD20Of(roll), roll.total, ac, autoCritical(liveTarget.state, ranged))
            done.hit = outcome.hit
            done.critical = outcome.critical
            const next = steps[index + 1]
            if (next && next.kind === "damage") {
                if (!outcome.hit) {
                    // DND-49 — Maestria Garantido: no erro, dano igual ao modificador usado (do mesmo tipo); com ≤ 0, nada.
                    if (mastery?.key === "graze" && mastery.modifier > 0) {
                        next.status = "done"
                        next.roller = "server"
                        next.total = mastery.modifier
                        next.dice = String(mastery.modifier)
                        next.note = masteryLabel("graze")
                        applyDamageTo(live, liveTarget, next, mastery.modifier, false, hpWrites, extraRolls)
                    } else next.status = "skipped"
                } else if (!parseDiceExpression(next.dice)?.terms.length) {
                    // Sem dados no dano (ataque desarmado): o valor fixo entra direto.
                    const amount = Number.parseInt(next.dice, 10) || 0
                    next.status = "done"
                    next.total = amount
                    applyDamageTo(live, liveTarget, next, amount, outcome.critical, hpWrites, extraRolls)
                } else if (sneakOffer && action.sneakRider) {
                    // DND-49: o jogador decide antes do dano se soma o ataque furtivo.
                    steps.splice(index + 1, 0, newStep({ kind: "sneak-choice", targetKey: liveTarget.key, targetName: liveTarget.name, dice: action.sneakRider.dice, note: `Somar ataque furtivo (+${action.sneakRider.dice})?` }))
                }
            }
            if (outcome.hit && mastery && liveTarget.kind === "combatant") applyHitMastery(mastery, { me, target: liveTarget, ranged, weaponId: weaponItemId(action.optionId), toppleRoll, toppleDc, steps, notes: masteryNotes })
        } else if (done.kind === "damage") {
            if (action.category === "spells" && action.steps.some((item) => item.kind === "damage") && action.targets.length && !action.steps.some((item) => item.kind === "attack")) {
                // Magia de salvaguarda (ou acerto automático): cada alvo.
                const option = { save: action.save ?? null }
                for (const ref of action.targets) {
                    const each = findActor(live, ref.actorKey)
                    if (!each) continue
                    if (option?.save && each.kind === "combatant") {
                        const saveRoll = saveRolls.get(each.key) ?? null
                        const success = saveRoll ? saveRoll.total >= option.save.dc : false
                        const amount = success ? (option.save.halfOnSave ? Math.floor(roll.total / 2) : 0) : roll.total
                        const saveStep = newStep({ kind: "save", targetKey: each.key, targetName: each.name, status: "done", roller: "server", roll: saveRoll, total: saveRoll?.total ?? null, success, amount, damageType: done.damageType, note: saveRoll ? null : "falha automática" })
                        if (amount) applyDamageTo(live, each, saveStep, amount, false, hpWrites, extraRolls)
                        steps.push(saveStep)
                    } else {
                        const hitStep = newStep({ kind: "damage", targetKey: each.key, targetName: each.name, status: "done", roller: "server", total: roll.total, damageType: done.damageType })
                        applyDamageTo(live, each, hitStep, roll.total, false, hpWrites, extraRolls)
                        steps.push(hitStep)
                    }
                }
                done.amount = roll.total
            } else if (liveTarget) {
                applyDamageTo(live, liveTarget, done, roll.total, Boolean(attackBefore(steps, index)?.critical), hpWrites, extraRolls)
                // DND-41: o ataque furtivo conta como usado quando o dano com ele é rolado (o ataque que erra não gasta).
                if (action.sneakAttack) me.state.economy.sneakAttackUsed = true
                // DND-49 — Afligir e Lentidão: valem quando o acerto causa dano.
                if ((done.amount ?? 0) > 0 && mastery && liveTarget.kind === "combatant") applyDamageMastery(mastery, { me, target: liveTarget, round: live.tactical.round, notes: masteryNotes })
            }
        } else if (done.kind === "heal" && liveTarget && liveTarget.kind === "character") {
            const hp = await sheetHp(liveTarget.state)
            if (hp) {
                done.amount = characterHealing(liveTarget.state, hp, roll.total)
                hpWrites.push({ state: liveTarget.state, hp })
            }
        } else if (done.kind === "check") {
            if (action.optionId === "standard:hide") {
                done.success = roll.total >= 15
                if (done.success && !me.state.conditions.some((condition) => condition.key === "invisible")) me.state.conditions.push({ key: "invisible", untilRound: null, source: "Esconder" })
            }
        }
    })

    const resolved = !steps.some((item) => item.status === "pending")
    const nextAction: IMaddoxCombatAction = { ...action, steps, status: resolved ? "resolved" : "pending", masteryNotes }
    nextAction.summary = actionSummary(nextAction)
    await MaddoxCampaignMessageModel.updateOne({ _id: message._id, "combatAction.rollingAt": claimedAt }, { $set: { combatAction: { ...nextAction, cancellable: false, rollingStep: null, rollingAt: null } } })
    for (const write of hpWrites) await writeHp(write.state, write.hp)
    if (extraRolls.length) await MaddoxCampaignMessageModel.insertMany(extraRolls.map((roll) => ({ ...roll, campaignId: campaign._id, turnNumber: message.turnNumber, phase: message.phase })))
    await afterDeaths(campaign._id)
    emitCombatRolled(campaignId, actionId, roll)
    emitServerSteps(campaignId, actionId, action.steps, steps)
    await publishGameChanged(campaign._id)
    if (resolved && action.waitRound !== null) {
        const { advanceAfterChecks } = await import("./game-checks")
        await advanceAfterChecks(campaign._id, message.turnNumber, action.waitRound)
    }
    return { roll, state: await getGameState(campaignId, userId) }
}

type MasteryState = NonNullable<IMaddoxCombatAction["mastery"]>
type CharacterActor = Extract<CombatActor, { kind: "character" }>
type CombatantActor = Extract<CombatActor, { kind: "combatant" }>

/**
 * DND-49 — efeitos de maestria no acerto (regras das entidades "Maestria: …" do catálogo): Drenar (desvantagem no próximo
 * ataque do alvo), Derrubar (salvaguarda de Constituição; falha = Caído), Empurrar (registrado; o Maddox narra) e
 * Trespassar (libera o 2º ataque corpo a corpo contra outro inimigo, uma vez por turno).
 */
function applyHitMastery(mastery: MasteryState, input: { me: CharacterActor; target: CombatantActor; ranged: boolean; weaponId: string | null; toppleRoll: DiceRollResponse | null | undefined; toppleDc: number; steps: CombatActionStep[]; notes: string[] }) {
    const { me, target, notes } = input
    if (mastery.key === "sap") {
        target.state.flags.sapped = { byKey: me.key, byName: me.name }
        notes.push(`${masteryLabel("sap")}: ${target.name} tem desvantagem na próxima jogada de ataque`)
    } else if (mastery.key === "topple") {
        if (hasCondition(target.state, "prone")) return
        if (input.toppleRoll === undefined) return
        const success = input.toppleRoll ? input.toppleRoll.total >= input.toppleDc : false
        input.steps.push(newStep({ kind: "save", targetKey: target.key, targetName: target.name, status: "done", roller: "server", roll: input.toppleRoll, total: input.toppleRoll?.total ?? null, success, note: `${masteryLabel("topple")} · Constituição CD ${input.toppleDc}${input.toppleRoll ? "" : " · falha automática"}` }))
        if (!success) {
            target.state.conditions = [...target.state.conditions.filter((condition) => condition.key !== "prone"), { key: "prone", untilRound: null, source: masteryLabel("topple") }]
            notes.push(`${masteryLabel("topple")}: ${target.name} ficou Caído`)
        } else notes.push(`${masteryLabel("topple")}: ${target.name} resistiu`)
    } else if (mastery.key === "push") {
        notes.push(`${masteryLabel("push")}: ${target.name} pode ser empurrado até 3 m (se for Grande ou menor)`)
    } else if (mastery.key === "cleave" && !input.ranged && input.weaponId && !me.state.economy.cleaveUsed) {
        me.state.economy.cleave = { weaponId: input.weaponId, targetKey: target.key }
    }
}

/** DND-49 — efeitos de maestria quando o acerto causa dano: Afligir (vantagem no próximo ataque contra o alvo) e Lentidão. */
function applyDamageMastery(mastery: MasteryState, input: { me: CharacterActor; target: CombatantActor; round: number; notes: string[] }) {
    const { me, target, notes } = input
    if (mastery.key === "vex") {
        me.state.flags.vex = { targetKey: target.key, round: input.round }
        notes.push(`${masteryLabel("vex")}: vantagem no próximo ataque contra ${target.name}`)
    } else if (mastery.key === "slow" && !target.state.flags.slowed) {
        target.state.flags.slowed = { byKey: me.key, byName: me.name }
        notes.push(`${masteryLabel("slow")}: ${target.name} perde 3 m de deslocamento até o próximo turno de ${me.name}`)
    }
}

/**
 * DND-49: resposta do jogador ao "Somar ataque furtivo?" depois do acerto. Somar = os dados entram no passo de dano (o
 * furtivo conta como usado quando esse dano é rolado); não somar = o dano segue sem eles. Só o dono da ação responde.
 */
export async function chooseSneakAttack(campaignId: string, actionId: string, add: boolean, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, member } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    if (!Types.ObjectId.isValid(actionId)) throw new DomainError(404, "Ação não encontrada", "NOT_FOUND")
    const message = await MaddoxCampaignMessageModel.findOne({ _id: new Types.ObjectId(actionId), campaignId: campaign._id, kind: "combat-action" }).lean<MessageDoc>()
    const action = message?.combatAction
    if (!message || !action) throw new DomainError(404, "Ação não encontrada", "NOT_FOUND")
    if (String(message.memberId) !== String(member._id)) throw new DomainError(403, "Esta ação é de outro jogador.", "NOT_ACTION_OWNER")
    await assertMemberCanPlay(campaignId, userId)
    const index = action.status === "pending" ? action.steps.findIndex((item) => item.status === "pending") : -1
    const choice = index >= 0 ? action.steps[index]! : null
    if (!choice || choice.kind !== "sneak-choice") throw new DomainError(409, "Não há ataque furtivo para decidir nesta ação.", "SNEAK_CHOICE_UNAVAILABLE")
    const combat = await findActiveTactical(campaign._id)
    const actor = combat ? findActor(combat, action.actorKey) : null
    if (!combat || !actor || actor.kind !== "character") throw new DomainError(409, "O combate terminou.", "NO_COMBAT")
    const usable = add && !actor.state.economy.sneakAttackUsed
    const steps = action.steps.map((item, at) => {
        if (at === index) return { ...item, status: "done" as const, success: usable, note: usable ? `ataque furtivo +${item.dice}` : "sem ataque furtivo" }
        if (at === index + 1 && item.kind === "damage" && usable) return { ...item, dice: `${item.dice}+${choice.dice}`, note: [item.note, `ataque furtivo +${choice.dice}`].filter(Boolean).join("; ") }
        return item
    })
    const next: IMaddoxCombatAction = { ...action, steps, sneakAttack: usable ? { dice: choice.dice } : null }
    next.summary = actionSummary(next)
    const updated = await MaddoxCampaignMessageModel.updateOne(
        { _id: message._id, "combatAction.status": "pending", [`combatAction.steps.${index}.status`]: "pending", "combatAction.rollingStep": null },
        { $set: { "combatAction.steps": steps, "combatAction.sneakAttack": next.sneakAttack, "combatAction.summary": next.summary } },
    )
    if (updated.modifiedCount === 0) throw new DomainError(409, "Esta escolha já foi feita.", "SNEAK_CHOICE_UNAVAILABLE")
    log.info({ campaignId, actor: action.actorName, add: usable }, "[maddox] escolha do ataque furtivo")
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

/** Aplica dano a um adversário (resistências) ou a um personagem (ficha), anotando o passo. */
function applyDamageTo(combat: TacticalCombat, target: CombatActor, item: CombatActionStep, amount: number, critical: boolean, hpWrites: { state: TacticalCharacterState; hp: CharacterHp }[], extraRolls: Record<string, unknown>[]) {
    if (target.kind === "combatant") {
        const adjusted = adjustDamage(amount, item.damageType, target.state.stats)
        const note = damageCombatant(target, adjusted.amount)
        item.amount = adjusted.amount
        item.note = [item.note, adjusted.note, note].filter(Boolean).join("; ") || null
        return
    }
    // As opções só miram adversários com dano; um personagem aqui não recebe dano pelo cliente.
    void combat
    void critical
    void hpWrites
    void extraRolls
    item.amount = 0
    item.note = "sem efeito em aliado"
}

/** Cancela a ação ainda não rolada (só a que não gastou recurso): a economia volta. */
export async function cancelCombatAction(campaignId: string, actionId: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, member, actor } = await loadMyTurn(campaignId, userId)
    if (!Types.ObjectId.isValid(actionId)) throw new DomainError(404, "Ação não encontrada", "NOT_FOUND")
    const message = await MaddoxCampaignMessageModel.findOne({ _id: new Types.ObjectId(actionId), campaignId: campaign._id, kind: "combat-action", memberId: member._id }).lean<MessageDoc & { combatAction: IMaddoxCombatAction & { cancellable?: boolean } }>()
    const action = message?.combatAction
    if (!message || !action) throw new DomainError(404, "Ação não encontrada", "NOT_FOUND")
    if (action.status !== "pending" || !action.cancellable || action.steps.some((item) => item.status === "done")) throw new DomainError(409, "Esta ação já não pode ser cancelada.", "ACTION_NOT_CANCELLABLE")
    const cancelled = await MaddoxCampaignMessageModel.updateOne({ _id: message._id, "combatAction.status": "pending", $or: [{ "combatAction.rollingStep": null }, { "combatAction.rollingAt": { $lt: staleClaimCutoff() } }] }, { $set: { "combatAction.status": "cancelled", "combatAction.rollingStep": null, "combatAction.rollingAt": null, "combatAction.summary": actionSummary({ ...action, status: "cancelled" }) } })
    if (cancelled.modifiedCount === 0) throw new DomainError(409, "Esta ação já não pode ser cancelada.", "ACTION_NOT_CANCELLABLE")
    // A ação Atacar volta inteira quando nenhum ataque foi rolado nela; senão, só o ataque cancelado volta.
    const rolledAttacks = await MaddoxCampaignMessageModel.exists({ campaignId: campaign._id, turnNumber: message.turnNumber, kind: "combat-action", "combatAction.actorKey": actor.key, "combatAction.category": "weapons", "combatAction.economy": "action", "combatAction.status": "resolved" })
    await mutateTactical(campaign._id, (live) => {
        const me = findActor(live, actor.key)
        if (!me) return
        const economy = me.state.economy
        if (action.optionId.startsWith("offhand:")) economy.lightExtraUsed = false
        if (action.optionId.startsWith("cleave:")) economy.cleaveUsed = false
        else if (action.optionId.startsWith("offhand:") && action.economy === "action") return
        else if (action.economy === "bonus") economy.bonus = true
        else if (action.category === "weapons") {
            if (rolledAttacks) economy.attacksLeft += 1
            else Object.assign(economy, { action: true, attackAction: false, attacksLeft: 0, lightAttack: false, lightWeaponId: null })
        } else economy.action = true
    })
    await publishGameChanged(campaign._id)
    return getGameState(campaignId, userId)
}

/** "Encerrar turno": grava a vez (resumo para o Maddox) e fecha o turno dos jogadores. */
export async function endCombatTurn(campaignId: string, input: MaddoxEndCombatTurnInput, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, member, actor } = await loadMyTurn(campaignId, userId)
    const turnNumber = campaign.turn.number
    const pendingAction = await MaddoxCampaignMessageModel.exists({ campaignId: campaign._id, turnNumber, kind: "combat-action", "combatAction.actorKey": actor.key, "combatAction.status": "pending" })
    if (pendingAction) throw new DomainError(409, "Role (ou cancele) a ação em andamento antes de encerrar o turno.", "ACTION_PENDING")
    const pendingRoll = await MaddoxCampaignMessageModel.exists({ campaignId: campaign._id, turnNumber, kind: "combat-roll", memberId: member._id, "combatRoll.status": "pending" })
    if (pendingRoll) throw new DomainError(409, "Faça a rolagem pendente antes de encerrar o turno.", "ROLL_PENDING")
    await recordCombatTurn(campaign, member, actor, input.movimento?.trim() || null, null)
    return getGameState(campaignId, userId)
}

/** Grava a declaração da vez (resumo das ações + movimento) e reavalia o turno. */
async function recordCombatTurn(campaign: CampaignDoc, member: MemberDoc, actor: Extract<CombatActor, { kind: "character" }>, movement: string | null, skippedBy: string | null, extra: { offlineSkip?: boolean; note?: string } = {}) {
    const actions = await MaddoxCampaignMessageModel.find({ campaignId: campaign._id, turnNumber: campaign.turn.number, kind: { $in: ["combat-action", "combat-roll"] }, memberId: member._id }).sort({ _id: 1 }).lean<MessageDoc[]>()
    const lines = actions
        .map((message) => (message.combatAction && message.combatAction.status !== "cancelled" ? message.combatAction.summary : message.combatRoll?.outcome ? `${actor.name} — ${message.combatRoll.reason}: ${message.combatRoll.outcome}` : ""))
        .filter(Boolean)
    const content = [`Vez de ${actor.name} (rodada do combate)`, ...lines.map((line) => `- ${line}`), ...(movement ? [`- Movimento e posição: ${movement}`] : []), ...(extra.note ? [`- ${extra.note}`] : []), ...(lines.length || movement ? [] : ["- Não fez nada nesta vez."])].join("\n")
    const character = await characterOf(member)
    const kind = lines.length || movement ? "declaration" : "pass"
    await recordTurnAction(campaign, member, character, kind, kind === "declaration" ? content : "", skippedBy, { offlineSkip: extra.offlineSkip, combatTurn: true })
    await publishGameChanged(campaign._id)
    await evaluateTurn(campaign._id)
}

/** O dono pula a vez do personagem ativo (ou a vez passa sozinha para quem está offline). */
export async function skipCombatTurn(campaign: CampaignDoc, target: MemberDoc, skippedBy: string | null, offline: boolean): Promise<void> {
    const combat = await findActiveTactical(campaign._id)
    const actor = combat && campaign.turn.combatActor ? findActor(combat, campaign.turn.combatActor.actorKey) : null
    if (!combat || !actor || actor.kind !== "character") throw new DomainError(409, "Não há combate tático em andamento.", "NO_COMBAT")
    await MaddoxCampaignMessageModel.updateMany({ campaignId: campaign._id, turnNumber: campaign.turn.number, memberId: target._id, kind: "combat-action", "combatAction.status": "pending" }, { $set: { "combatAction.status": "cancelled" } })
    await MaddoxCampaignMessageModel.updateMany({ campaignId: campaign._id, turnNumber: campaign.turn.number, memberId: target._id, kind: "combat-roll", "combatRoll.status": "pending" }, { $set: { "combatRoll.status": "cancelled", "combatRoll.outcome": offline ? "Jogador offline" : "Vez pulada" } })
    await recordCombatTurn(campaign, target, actor, null, skippedBy, { offlineSkip: offline, note: offline ? "Não agiu: o jogador estava offline." : undefined })
}

/** Reavalia a vez de quem está offline: passa a vez depois da carência. */
export async function evaluateCombatAbsence(campaignId: Types.ObjectId): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    const combatActor = campaign?.turn?.combatActor
    if (!campaign || campaign.status !== "active" || campaign.turn.phase !== "players" || !combatActor) return
    const member = await MaddoxCampaignMemberModel.findOne({ _id: combatActor.memberId, campaignId, status: "joined" }).lean<MemberDoc>()
    if (!member) return
    const { onlineUserIds } = await import("./game-presence")
    const online = await onlineUserIds(String(campaignId))
    // O Personagem Opex (DND-26) sempre conta como presente: a vez dele não passa por ausência.
    if (!online || online.has(member.userId) || isOpexUserId(member.userId)) {
        if (combatActor.offlineSince) await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.number": campaign.turn.number }, { $set: { "turn.combatActor.offlineSince": null } })
        return
    }
    const since = combatActor.offlineSince ? new Date(combatActor.offlineSince).getTime() : null
    if (since === null) {
        await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.number": campaign.turn.number }, { $set: { "turn.combatActor.offlineSince": new Date() } })
        scheduleAbsenceCheck(String(campaignId))
        return
    }
    const waited = Date.now() - since
    if (waited < MADDOX_COMBAT_OFFLINE_GRACE_MS) {
        scheduleAbsenceCheck(String(campaignId), MADDOX_COMBAT_OFFLINE_GRACE_MS - waited + 50)
        return
    }
    log.info({ campaignId: String(campaignId), memberId: String(member._id), waitedMs: waited }, "[maddox] jogador offline na própria vez: a vez passa")
    try {
        await skipCombatTurn(campaign, member, null, true)
    } catch (error) {
        if (!(error instanceof DomainError)) throw error
        log.info({ campaignId: String(campaignId), code: error.code }, "[maddox] vez do ausente já tinha mudado")
    }
}

// ── Rolagens avulsas (iniciativa, teste contra a morte, concentração, salvaguarda, dano pedido) ─────────────────────

const ENEMY_ROLL_ERROR = () => new DomainError(409, "A iniciativa dos inimigos é rolada pelo servidor, depois que todos os personagens rolarem.", "ENEMY_ROLL_BY_SERVER")

/** Rola o card `combat-roll`: o jogador indicado ou o dono, no lugar dele (auditado). */
export async function rollCombatRoll(campaignId: string, rollId: string, userId: string): Promise<{ roll: DiceRollResponse; state: MaddoxGameStateDto }> {
    const { campaign, member } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    if (!Types.ObjectId.isValid(rollId)) throw new DomainError(404, "Rolagem não encontrada", "NOT_FOUND")
    const message = await MaddoxCampaignMessageModel.findOne({ _id: new Types.ObjectId(rollId), campaignId: campaign._id, kind: "combat-roll" }).lean<MessageDoc>()
    const request = message?.combatRoll
    if (!message || !request) throw new DomainError(404, "Rolagem não encontrada", "NOT_FOUND")
    if (request.kind === "enemy-initiative") throw ENEMY_ROLL_ERROR()
    const isTarget = String(message.memberId) === String(member._id)
    const isOwner = campaign.ownerId === userId
    if (!isTarget && !isOwner) throw new DomainError(403, "Esta rolagem é de outro jogador.", "NOT_ROLL_TARGET")
    await assertMemberCanPlay(campaignId, userId)
    if (request.status !== "pending") throw new DomainError(409, request.status === "rolled" ? "Esta rolagem já foi feita." : "Esta rolagem foi cancelada.", "ROLL_NOT_PENDING")
    const roll = await performCombatRoll(campaign, message, request, message.userId)
    if (!isTarget) await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { turn: message.turnNumber, combatRoll: rollId, kind: request.kind, rolledFor: message.userId, total: roll.total } })
    return { roll, state: await getGameState(campaignId, userId) }
}

/** Rola e aplica a rolagem avulsa; continua o turno (espera concluída, ou vez encerrada no teste contra a morte). */
export async function performCombatRoll(campaign: CampaignDoc, message: MessageDoc, request: IMaddoxCombatRoll, rollerUserId: string | null): Promise<DiceRollResponse> {
    // A iniciativa dos inimigos só é rolada pelo servidor (`rollEnemyInitiativeIfReady`), depois dos personagens (DND-25).
    if (request.kind === "enemy-initiative") throw ENEMY_ROLL_ERROR()
    // Reivindica a rolagem ANTES de rolar e aplicar: o dono rolando no lugar ao mesmo tempo que o jogador (ou dois
    // cliques) não aplica o efeito duas vezes — a outra chamada recebe 409.
    const claimedAt = new Date()
    const claimed = await MaddoxCampaignMessageModel.updateOne(
        { _id: message._id, "combatRoll.status": "pending", $or: [{ "combatRoll.rolling": { $ne: true } }, { "combatRoll.rollingAt": { $lt: staleClaimCutoff() } }] },
        { $set: { "combatRoll.rolling": true, "combatRoll.rollingAt": claimedAt } },
    )
    if (claimed.modifiedCount === 0) throw new DomainError(409, "Esta rolagem já foi feita.", "ROLL_NOT_PENDING")
    try {
        return await performClaimedRoll(campaign, message, request, rollerUserId, claimedAt)
    } catch (error) {
        await MaddoxCampaignMessageModel.updateOne({ _id: message._id, "combatRoll.status": "pending", "combatRoll.rollingAt": claimedAt }, { $set: { "combatRoll.rolling": false, "combatRoll.rollingAt": null } }).catch(() => undefined)
        throw error
    }
}

async function performClaimedRoll(campaign: CampaignDoc, message: MessageDoc, request: IMaddoxCombatRoll, rollerUserId: string | null, claimedAt: Date): Promise<DiceRollResponse> {
    const combat = await findActiveTactical(campaign._id)
    const actor = combat && request.targetKey ? findActor(combat, request.targetKey) : null
    const character = actor?.kind === "character" ? actor : combat?.tactical.characters.find((state) => state.memberId === String(message.memberId)) ? (findActor(combat!, combat!.tactical.characters.find((state) => state.memberId === String(message.memberId))!.actorKey) as Extract<CombatActor, { kind: "character" }>) : null
    const roll = await rollExpression(request.dice, { mode: request.mode, label: request.reason, userId: rollerUserId })
    const d20 = keptD20Of(roll)
    let outcome = ""
    let success: boolean | null = null
    let hpWrites: { state: TacticalCharacterState; hp: CharacterHp }[] = []
    let extra: Record<string, unknown>[] = []
    let endsTurn = false

    if (combat) {
        await mutateTactical(campaign._id, async (live) => {
            // Nova execução num conflito de versão: começa do zero (sem escritas ou cards repetidos).
            hpWrites = []
            extra = []
            outcome = ""
            success = null
            const me = character ? findActor(live, character.key) : null
            if (request.kind === "initiative" && me?.kind === "character") {
                const { setCharacterInitiative } = await import("./tactical-combat")
                const { loadCombatSheets } = await import("./combat-sheet")
                const sheet = me.state.sheetId ? (await loadCombatSheets([me.state.sheetId])).get(me.state.sheetId) : null
                setCharacterInitiative(live, me.key, roll, sheet?.dexterity ?? 10)
                outcome = `iniciativa ${roll.total}`
            } else if (request.kind === "death-save" && me?.kind === "character") {
                const hp = await sheetHp(me.state)
                if (hp) {
                    const result = deathSave(d20, hp.deathSaves)
                    hp.deathSaves = { success: result.success, failure: result.failure }
                    if (result.revived) {
                        characterHealing(me.state, hp, 1)
                        outcome = "20 natural: recuperou 1 PV e acordou"
                    } else if (result.dead) {
                        me.state.dead = true
                        outcome = "três falhas: morreu"
                    } else if (result.stable) {
                        me.state.stable = true
                        hp.deathSaves = { success: 0, failure: 0 }
                        outcome = "três sucessos: está estável"
                    } else outcome = `${d20 >= 10 ? "sucesso" : d20 === 1 ? "1 natural: duas falhas" : "falha"} (${result.success} sucesso(s), ${result.failure} falha(s))`
                    success = d20 >= 10
                    hpWrites.push({ state: me.state, hp })
                }
                endsTurn = true
            } else if ((request.kind === "concentration" || request.kind === "save") && me?.kind === "character") {
                success = roll.total >= (request.dc ?? 10)
                if (request.kind === "concentration") {
                    if (!success && me.state.concentration) {
                        outcome = `falhou: perdeu a concentração em ${me.state.concentration.spell}`
                        me.state.concentration = null
                    } else outcome = success ? "manteve a concentração" : "falhou"
                } else {
                    const effect = request.effect
                    const base = effect?.damage ?? 0
                    const amount = success ? (effect?.halfOnSave ? Math.floor(base / 2) : 0) : base
                    outcome = `${success ? "sucesso" : "falha"}${amount ? `: ${amount} de dano${effect?.damageType ? ` ${effect.damageType}` : ""}` : ""}`
                    if (amount) {
                        const hp = await sheetHp(me.state)
                        if (hp) {
                            const result = characterDamage(me.state, hp, amount, false)
                            if (result.notes.length) outcome += ` (${result.notes.join("; ")})`
                            hpWrites.push({ state: me.state, hp })
                            if (result.concentrationDc !== null) {
                                const { loadCombatSheets, sheetSave } = await import("./combat-sheet")
                                const sheet = me.state.sheetId ? (await loadCombatSheets([me.state.sheetId])).get(me.state.sheetId) : null
                                extra.push({ kind: "combat-roll", memberId: message.memberId, userId: message.userId, characterId: message.characterId, characterName: message.characterName, content: "", segment: message.segment, combatRoll: concentrationRollDoc(String(live._id), me.state, result.concentrationDc, sheet ? sheetSave(sheet, "constitution").value : 0, request.waitRound) })
                            }
                        }
                    }
                }
            } else if (request.kind === "damage") {
                const target = request.targetKey ? findActor(live, request.targetKey) : null
                if (target?.kind === "combatant") {
                    const adjusted = adjustDamage(roll.total, request.effect?.damageType ?? null, target.state.stats)
                    const note = damageCombatant(target, adjusted.amount)
                    outcome = `${adjusted.amount} de dano em ${target.name}${[adjusted.note, note].filter(Boolean).length ? ` (${[adjusted.note, note].filter(Boolean).join("; ")})` : ""}`
                } else outcome = `${roll.total} de dano`
            }
        })
    }
    const saved = await MaddoxCampaignMessageModel.updateOne(
        { _id: message._id, "combatRoll.status": "pending", "combatRoll.rollingAt": claimedAt },
        { $set: { "combatRoll.rolling": false, "combatRoll.rollingAt": null, "combatRoll.status": "rolled", "combatRoll.roll": roll, "combatRoll.total": roll.total, "combatRoll.success": success, "combatRoll.outcome": outcome || `${roll.total}`, "combatRoll.rolledBy": rollerUserId ?? "server" } },
    )
    if (saved.modifiedCount === 0) throw new DomainError(409, "Esta rolagem já foi feita.", "ROLL_NOT_PENDING")
    for (const write of hpWrites) await writeHp(write.state, write.hp)
    if (extra.length) await MaddoxCampaignMessageModel.insertMany(extra.map((doc) => ({ ...doc, campaignId: campaign._id, turnNumber: message.turnNumber, phase: message.phase })))
    await afterDeaths(campaign._id)
    emitCombatRolled(String(campaign._id), String(message._id), roll)
    await publishGameChanged(campaign._id)
    log.info({ campaignId: String(campaign._id), kind: request.kind, total: roll.total, outcome }, "[maddox] rolagem do combate")
    if (request.waitRound !== null) {
        if (request.kind === "initiative") {
            const { finishInitiativeIfReady } = await import("./tactical-combat")
            await finishInitiativeIfReady(campaign._id, message.turnNumber, request.waitRound + 1)
        }
        const { advanceAfterChecks } = await import("./game-checks")
        await advanceAfterChecks(campaign._id, message.turnNumber, request.waitRound)
    } else if (endsTurn && character) {
        const fresh = await MaddoxCampaignModel.findById(campaign._id).lean<CampaignDoc>()
        const member = await MaddoxCampaignMemberModel.findById(message.memberId).lean<MemberDoc>()
        const updated = fresh && member ? await findActiveTactical(campaign._id) : null
        const me = updated ? findActor(updated, character.key) : null
        if (fresh && member && me?.kind === "character" && fresh.turn.phase === "players" && String(fresh.turn.combatActor?.memberId) === String(member._id)) await recordCombatTurn(fresh, member, me, null, null)
    }
    return roll
}

/** Personagens mortos no combate: o personagem da campanha fica `dead` (sai da mesa), com auditoria. */
export async function markDeadCharacters(campaignId: Types.ObjectId, combat: TacticalCombat): Promise<void> {
    for (const state of combat.tactical.characters.filter((item) => item.dead)) {
        const updated = await MaddoxCharacterModel.updateOne({ _id: new Types.ObjectId(state.characterId), campaignId, status: { $ne: "dead" } }, { $set: { status: "dead", currentState: `Morreu em combate (${combat.title}).`, currentStatePublic: true } })
        if (updated.modifiedCount === 0) continue
        log.info({ campaignId: String(campaignId), characterId: state.characterId, combatId: String(combat._id) }, "[maddox] personagem morreu em combate")
        const campaign = await MaddoxCampaignModel.findById(campaignId).select("ownerId").lean<{ ownerId: string }>()
        await recordAudit({ userId: campaign?.ownerId ?? state.userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: String(campaignId), acao: AcaoAuditoria.ATUALIZAR, depois: { by: "maddox", combat: String(combat._id), characterDied: state.characterId } })
    }
}

async function afterDeaths(campaignId: Types.ObjectId) {
    const combat = await findActiveTactical(campaignId)
    if (combat?.tactical.characters.some((state) => state.dead)) await markDeadCharacters(campaignId, combat)
}

/** O membro saiu: o personagem sai da ordem e as rolagens/reações pendentes dele são canceladas. */
export async function onMemberLeftCombat(campaignId: Types.ObjectId, memberId: Types.ObjectId): Promise<void> {
    const combat = await findActiveTactical(campaignId)
    if (!combat || !combat.tactical.characters.some((state) => state.memberId === String(memberId))) return
    await mutateTactical(campaignId, (live) => {
        const state = live.tactical.characters.find((item) => item.memberId === String(memberId))
        if (state) state.left = true
    })
    // DND-41: a preparação da mesa dele deixa de bloquear a ordem de iniciativa.
    await (await import("./combat-prep")).discardMemberPrep(combat._id, memberId)
    await MaddoxCampaignMessageModel.updateMany({ campaignId, memberId, kind: "combat-roll", "combatRoll.status": "pending" }, { $set: { "combatRoll.status": "cancelled", "combatRoll.outcome": "O jogador saiu da campanha" } })
    await MaddoxCampaignMessageModel.updateMany({ campaignId, memberId, kind: "combat-reaction", "combatReaction.status": "pending" }, { $set: { "combatReaction.status": "declined", "combatReaction.outcome": "O jogador saiu da campanha" } })
    await MaddoxCampaignMessageModel.updateMany({ campaignId, memberId, kind: "combat-action", "combatAction.status": "pending" }, { $set: { "combatAction.status": "cancelled" } })
    // A rodada pode ter ficado sem pendentes (ex.: era o último personagem na iniciativa: os inimigos rolam agora).
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("status turn").lean<Pick<CampaignDoc, "status" | "turn">>()
    if (campaign?.status === "active" && campaign.turn?.phase === "master" && campaign.turn.awaitingChecks) {
        const { advanceAfterChecks } = await import("./game-checks")
        await advanceAfterChecks(campaignId, campaign.turn.number, campaign.turn.checkRound ?? 0)
    }
}
