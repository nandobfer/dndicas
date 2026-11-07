import { Types } from "mongoose"
import { loggerFor } from "@/lib/logger"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import { MADDOX_COMBAT_MASTER_ROUNDS_MAX, MADDOX_COMBAT_WAIT_ROUNDS_MAX, MADDOX_REACTION_TIMEOUT_MS, MADDOX_CONDITION_LABELS, MADDOX_CONDITIONS, type MaddoxConditionKey, type MaddoxReactionTrigger } from "../constants"
import { MADDOX_ABILITY_LABELS } from "../check-modifier"
import { normalizeCatalogName } from "../catalog-markup"
import {
    adjustDamage,
    applyDamage,
    applyHealing,
    attackMode,
    attackOutcome,
    autoCritical,
    canAct,
    combineModes,
    concentrationDc,
    criticalExpression,
    damageAtZero,
    formatDiceExpression,
    hasCondition,
    hpBand,
    HP_BAND_LABELS,
    parseDiceExpression,
    saveMode,
    type DeathSaves,
    type RollMode,
} from "../combat-rules"
import type { CombatActionStep, IMaddoxCombatAction, IMaddoxCombatReaction, IMaddoxCombatRoll, MonsterActionStat, TacticalCharacterState } from "../combat-types"
import type { CombatOption } from "../combat-options"
import { emitLiveRoll, jobWorkspace, maddoxJobMeta, setJobWorkspace, takeJobWorkspace } from "./game-live"
import { d20Expression, remainingBlocks, findActiveTactical, findActor, findActorByName, keptD20Of, livingEnemies, consciousCharacters, rollExpression, saveTactical, type CombatActor, type TacticalCombat } from "./tactical-combat"

/**
 * A vez dos adversários no combate tático (Maddox 7) — SOMENTE servidor. As ferramentas do Maddox (`monster_action`,
 * `apply_effect`, `request_damage_roll`, `offer_reaction`) rolam os dados no SERVIDOR (o Maddox nunca escreve um
 * resultado) e mexem numa CÓPIA DE TRABALHO do combate e das fichas guardada no job da fila. A cópia só é gravada
 * (`commitTacticalWorkspace`) depois que a narração foi gerada: uma geração que falha não muda nada (a nova tentativa
 * rola de novo). Salvaguardas dos personagens, reações e rolagens pedidas viram esperas do turno do mestre.
 */

const log = loggerFor({ module: "maddox", feature: "tactical-master" })

export class TacticalToolError extends Error {}

interface SheetHp {
    hp: number
    hpMax: number
    tempHp: number
    deathSaves: DeathSaves
    armorClass: number
    saves: Record<AttributeType, number>
    changed: boolean
}

export interface TacticalWorkspace {
    combat: TacticalCombat
    sheets: Record<string, SheetHp>
    /** Reações de cada personagem (por gatilho) calculadas da ficha no começo da geração. */
    reactions: Record<string, CombatOption[]>
    /** Espaços de magia e cargas a gastar ao gravar (reações não entram aqui: são gastas ao decidir). */
    messages: Record<string, unknown>[]
    /** Adversários da fila que já agiram (o seguinte pode agir; um anterior, não). */
    acted: string[]
    turnNumber: number
    round: number
    lines: string[]
}

const fold = (value: string) => normalizeCatalogName(value)

/** Carrega a cópia de trabalho na primeira ferramenta da geração. */
async function workspaceOf(campaignId: Types.ObjectId, jobId: string, turnNumber: number): Promise<TacticalWorkspace> {
    const existing = jobWorkspace<TacticalWorkspace>(String(campaignId), jobId)
    if (existing) return existing
    const meta = maddoxJobMeta(String(campaignId), jobId)
    if (!meta || meta.kind !== "narration") throw new TacticalToolError("A vez dos adversários só acontece na narração do turno do mestre. Responda à pergunta sem agir pelos adversários.")
    const combat = await findActiveTactical(campaignId)
    if (!combat) throw new TacticalToolError("Não há combate tático em andamento: comece com start_combat quando a luta começar.")
    if (combat.tactical.phase !== "running") throw new TacticalToolError("O combate ainda está na iniciativa: espere os jogadores rolarem antes de agir pelos adversários.")
    const { loadCharacterOptions } = await import("./tactical-options")
    const views = await loadCharacterOptions(combat.tactical.characters.filter((state) => !state.left && !state.dead))
    const sheets: Record<string, SheetHp> = {}
    const reactions: Record<string, CombatOption[]> = {}
    for (const state of combat.tactical.characters) {
        const view = views.get(state.actorKey)
        if (!view) continue
        const { sheetSave } = await import("./combat-sheet")
        sheets[state.actorKey] = {
            ...view.sheet.hp,
            deathSaves: view.sheet.deathSaves,
            armorClass: view.sheet.armorClass,
            saves: Object.fromEntries((["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as AttributeType[]).map((ability) => [ability, sheetSave(view.sheet, ability).value])) as Record<AttributeType, number>,
            changed: false,
        }
        reactions[state.actorKey] = view.options.reactions
    }
    const workspace: TacticalWorkspace = { combat, sheets, reactions, messages: [], acted: [], turnNumber, round: meta.round, lines: [] }
    setJobWorkspace(String(campaignId), jobId, workspace)
    return workspace
}

const conditionKeyOf = (value: string): MaddoxConditionKey | null => {
    const wanted = fold(value)
    return MADDOX_CONDITIONS.find((key) => key === value || fold(MADDOX_CONDITION_LABELS[key]) === wanted) ?? null
}

const actorNames = (workspace: TacticalWorkspace) => workspace.combat.tactical.order.map((slot) => slot.name).join(", ")

function targetOf(workspace: TacticalWorkspace, name: string): CombatActor {
    const actor = findActorByName(workspace.combat, name)
    if (!actor) throw new TacticalToolError(`"${name}" não está neste combate. Participantes: ${actorNames(workspace)}.`)
    if (actor.kind === "character" && (actor.state.dead || actor.state.left)) throw new TacticalToolError(`${actor.name} não está mais na luta.`)
    return actor
}

const characterMessage = (state: TacticalCharacterState) => ({ memberId: new Types.ObjectId(state.memberId), userId: state.userId, characterId: new Types.ObjectId(state.characterId), characterName: state.name })

function baseMessage(workspace: TacticalWorkspace, kind: "combat-action" | "combat-roll" | "combat-reaction", extra: Record<string, unknown>) {
    return { campaignId: workspace.combat.campaignId, turnNumber: workspace.turnNumber, phase: "master", kind, content: "", segment: workspace.round, ...extra }
}

/**
 * Ainda cabe uma espera (reação, salvaguarda, rolagem pedida). Com blocos (DND-25) o teto de esperas vale por bloco, e o
 * turno do mestre inteiro tem o teto de proteção `MADDOX_COMBAT_MASTER_ROUNDS_MAX`.
 */
const canWait = (workspace: TacticalWorkspace) => {
    const block = workspace.combat.tactical.block
    if (!block) return workspace.round < MADDOX_COMBAT_WAIT_ROUNDS_MAX - 1
    return block.waits < MADDOX_COMBAT_WAIT_ROUNDS_MAX - 1 && workspace.round < MADDOX_COMBAT_MASTER_ROUNDS_MAX - 1
}

/** Dado de um adversário rolado agora: vai para a bolha ao vivo da geração (todos veem rolar antes da narração). */
function showRoll(campaignId: Types.ObjectId, jobId: string, roll: DiceRollResponse, input: { actorName: string; label: string; step: "attack" | "damage" | "save" | "heal"; targetName?: string | null; verdict?: "hit" | "miss" | "critical" | "success" | "fail" | null; amount?: number | null; damageType?: string | null }) {
    emitLiveRoll(String(campaignId), jobId, { id: roll.rollId, actorName: input.actorName, label: input.label, step: input.step, targetName: input.targetName ?? null, verdict: input.verdict ?? null, amount: input.amount ?? null, damageType: input.damageType ?? null, roll })
}

/** Pontos de vida da ficha que o dano e a cura do combate mexem. */
export interface CharacterHp {
    hp: number
    hpMax: number
    tempHp: number
    deathSaves: DeathSaves
}

/**
 * Dano num personagem (regras puras sobre o estado e os PV da ficha): PV temporários, 0 PV (Inconsciente), falhas no
 * teste contra a morte, morte instantânea e a CD da concentração (`null` = não precisa manter).
 */
export function characterDamage(state: TacticalCharacterState, hp: CharacterHp, amount: number, critical: boolean): { notes: string[]; concentrationDc: number | null } {
    const result = applyDamage(hp, amount)
    hp.hp = result.hp
    hp.tempHp = result.tempHp
    const notes: string[] = []
    let concentration: number | null = null
    if (result.massiveDeath) {
        state.dead = true
        notes.push(`${state.name} morreu instantaneamente (dano massivo)`)
    } else if (result.atZero && amount > 0) {
        const saves = damageAtZero(hp.deathSaves, critical)
        hp.deathSaves = { success: saves.success, failure: saves.failure }
        state.stable = false
        if (saves.dead) state.dead = true
        notes.push(saves.dead ? `${state.name} morreu (três falhas)` : `${state.name} sofreu ${critical ? "duas falhas" : "uma falha"} no teste contra a morte`)
    } else if (result.droppedToZero) {
        state.hpZero = true
        state.stable = false
        if (!hasCondition(state, "unconscious")) state.conditions.push({ key: "unconscious", untilRound: null, source: "0 PV" })
        if (state.concentration) {
            notes.push(`${state.name} perdeu a concentração em ${state.concentration.spell}`)
            state.concentration = null
        }
        notes.push(`${state.name} caiu a 0 PV e está Inconsciente`)
    } else if (state.concentration && result.dealt + result.absorbed > 0) {
        concentration = concentrationDc(amount)
    }
    if (state.dead) {
        state.hpZero = true
        state.concentration = null
        state.conditions = state.conditions.filter((condition) => condition.key !== "unconscious")
    }
    return { notes, concentrationDc: concentration }
}

/** Cura num personagem: sai dos 0 PV (testes contra a morte zerados) e perde a condição Inconsciente. */
export function characterHealing(state: TacticalCharacterState, hp: CharacterHp, amount: number): number {
    if (state.dead) return 0
    const healed = applyHealing(hp, amount)
    hp.hp = healed.hp
    if (healed.hp > 0 && state.hpZero) {
        state.hpZero = false
        state.stable = false
        state.conditions = state.conditions.filter((condition) => condition.key !== "unconscious")
        hp.deathSaves = { success: 0, failure: 0 }
    }
    return healed.healed
}

/** Card de salvaguarda de concentração para o personagem (espera do turno do mestre ou na hora). */
export function concentrationRollDoc(combatId: string, state: TacticalCharacterState, dc: number, saveBonus: number, waitRound: number | null): IMaddoxCombatRoll {
    return { combatId, kind: "concentration", waitRound, status: "pending", ability: "constitution", dc, mode: "normal", dice: d20Expression(saveBonus), roll: null, total: null, success: null, reason: `Manter a concentração em ${state.concentration?.spell ?? "magia"} (CD ${dc})`, effect: null, targetKey: state.actorKey, outcome: null, rolledBy: null }
}

/** Dano num personagem na cópia de trabalho (com a salvaguarda de concentração como espera). */
function damageCharacter(workspace: TacticalWorkspace, actor: Extract<CombatActor, { kind: "character" }>, amount: number, critical: boolean, sourceName: string): string {
    void sourceName
    const hp = workspace.sheets[actor.key]
    if (!hp) return `${actor.name} não tem ficha: narre o efeito do golpe.`
    const { notes, concentrationDc: dc } = characterDamage(actor.state, hp, amount, critical)
    hp.changed = true
    if (dc !== null && canWait(workspace)) {
        workspace.messages.push(baseMessage(workspace, "combat-roll", { ...characterMessage(actor.state), combatRoll: concentrationRollDoc(String(workspace.combat._id), actor.state, dc, hp.saves.constitution ?? 0, workspace.round) }))
        notes.push(`${actor.name} faz salvaguarda de Constituição CD ${dc} para manter a concentração`)
    }
    return notes.join("; ")
}

export function damageCombatant(actor: Extract<CombatActor, { kind: "combatant" }>, amount: number): string {
    const stats = actor.state.stats
    const result = applyDamage({ hp: stats.hp, hpMax: stats.hpMax, tempHp: stats.tempHp }, amount)
    stats.hp = result.hp
    stats.tempHp = result.tempHp
    if (result.hp <= 0 && !actor.state.defeated) {
        actor.state.defeated = true
        actor.combatant.condition = "caído"
        return `${actor.name} caiu`
    }
    actor.combatant.condition = HP_BAND_LABELS[hpBand(stats.hp, stats.hpMax)].toLowerCase()
    return ""
}

function rollDoc(workspace: TacticalWorkspace, input: { kind: IMaddoxCombatRoll["kind"]; ability: AttributeType | null; dc: number | null; dice: string; reason: string; targetKey: string | null; mode?: RollMode; effect?: IMaddoxCombatRoll["effect"] }): IMaddoxCombatRoll {
    return { combatId: String(workspace.combat._id), kind: input.kind, waitRound: workspace.round, status: "pending", ability: input.ability, dc: input.dc, mode: input.mode ?? "normal", dice: input.dice, roll: null, total: null, success: null, reason: input.reason, effect: input.effect ?? null, targetKey: input.targetKey, outcome: null, rolledBy: null }
}

const step = (input: Partial<CombatActionStep> & Pick<CombatActionStep, "kind">): CombatActionStep => ({
    targetKey: null,
    targetName: null,
    status: "done",
    roller: "server",
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

function actionCard(workspace: TacticalWorkspace, actor: CombatActor, input: { label: string; economy: IMaddoxCombatAction["economy"]; targets: CombatActor[]; steps: CombatActionStep[]; summary: string }) {
    const doc: IMaddoxCombatAction = {
        combatId: String(workspace.combat._id),
        round: workspace.combat.tactical.round,
        actorKey: actor.key,
        actorName: actor.name,
        actorKind: actor.kind,
        economy: input.economy,
        category: "monster",
        optionId: `monster:${fold(input.label)}`,
        label: input.label,
        targets: input.targets.map((target) => ({ actorKey: target.key, name: target.name })),
        spellLevel: null,
        freeText: null,
        status: "resolved",
        steps: input.steps,
        summary: input.summary,
        waitRound: null,
    }
    workspace.messages.push(baseMessage(workspace, "combat-action", { combatAction: doc }))
    workspace.lines.push(input.summary)
}

/** Reações de `trigger` que o personagem pode usar agora (reação livre, sem incapacidade). */
function reactionsFor(workspace: TacticalWorkspace, actor: Extract<CombatActor, { kind: "character" }>, trigger: MaddoxReactionTrigger): CombatOption[] {
    if (!actor.state.economy.reaction || !canAct(actor.state) || actor.state.hpZero) return []
    const pending = workspace.messages.some((message) => (message as { kind?: string }).kind === "combat-reaction" && (message as { memberId?: Types.ObjectId }).memberId?.equals(actor.state.memberId))
    if (pending) return []
    return (workspace.reactions[actor.key] ?? []).filter((option) => option.trigger === trigger || (trigger === "hit" && option.trigger === "other" && option.category === "spells"))
}

function openReaction(workspace: TacticalWorkspace, actor: Extract<CombatActor, { kind: "character" }>, trigger: MaddoxReactionTrigger, description: string, options: CombatOption[], sourceKey: string | null, pendingAttack: IMaddoxCombatReaction["pendingAttack"]) {
    const doc: IMaddoxCombatReaction = {
        combatId: String(workspace.combat._id),
        waitRound: workspace.round,
        trigger,
        description,
        status: "pending",
        options,
        choice: null,
        // O prazo conta a partir da gravação (`commitTacticalWorkspace` o renova).
        deadline: new Date(Date.now() + MADDOX_REACTION_TIMEOUT_MS),
        pendingAttack,
        sourceKey,
        outcome: null,
        decidedBy: null,
    }
    workspace.messages.push(baseMessage(workspace, "combat-reaction", { ...characterMessage(actor.state), combatReaction: doc }))
}

/** Confere que o adversário pode agir agora pela fila (ou numa reação) e devolve a ação do bloco. */
function monsterActionOf(workspace: TacticalWorkspace, actor: Extract<CombatActor, { kind: "combatant" }>, actionName: string, asReaction: boolean): MonsterActionStat {
    if (actor.state.defeated) throw new TacticalToolError(`${actor.name} está caído: não age mais.`)
    if (!canAct(actor.state)) throw new TacticalToolError(`${actor.name} está incapacitado (${actor.state.conditions.map((condition) => MADDOX_CONDITION_LABELS[condition.key]).join(", ")}): não age neste turno.`)
    const queue = workspace.combat.tactical.queue
    const block = workspace.combat.tactical.block
    if (!asReaction && block) {
        // Blocos (DND-25): cada adversário age na própria geração.
        if (block.kind !== "npc" || !block.actorKey) throw new TacticalToolError("Nesta narração nenhum adversário age: narre só o que já aconteceu. Cada adversário age depois, no próprio bloco.")
        if (block.actorKey !== actor.key) throw new TacticalToolError(`Não é a vez de ${actor.name}: neste bloco age só ${findActor(workspace.combat, block.actorKey)?.name ?? "outro adversário"}.`)
    } else if (!asReaction) {
        const position = queue.indexOf(actor.key)
        if (position < 0) {
            const names = queue.map((key) => findActor(workspace.combat, key)?.name).filter(Boolean)
            throw new TacticalToolError(names.length ? `Não é a vez de ${actor.name}. Agem agora, nesta ordem: ${names.join(", ")}.` : `Nenhum adversário age agora: narre a vez do personagem e pare.`)
        }
        const last = Math.max(-1, ...workspace.acted.map((key) => queue.indexOf(key)))
        if (position < last) throw new TacticalToolError(`${actor.name} já teve a vez nesta rodada (a ordem segue a iniciativa).`)
        if (!workspace.acted.includes(actor.key)) workspace.acted.push(actor.key)
    }
    const action = actor.state.stats.actions.find((item) => fold(item.name) === fold(actionName)) ?? actor.state.stats.actions.find((item) => fold(item.name).startsWith(fold(actionName)))
    if (!action) throw new TacticalToolError(`${actor.name} não tem a ação "${actionName}". Ações: ${actor.state.stats.actions.map((item) => item.name).join(", ") || "nenhuma"}.`)
    if (!action.available) throw new TacticalToolError(`${action.name} está recarregando: escolha outra ação de ${actor.name}.`)
    const economy = actor.state.economy
    const slot = asReaction ? "reaction" : action.economy
    if (slot === "reaction") {
        if (!economy.reaction) throw new TacticalToolError(`${actor.name} já usou a reação nesta rodada.`)
        economy.reaction = false
    } else if (slot === "bonus") {
        if (!economy.bonus) throw new TacticalToolError(`${actor.name} já usou a Ação bônus neste turno.`)
        economy.bonus = false
    } else if (economy.action) {
        economy.action = false
        economy.attackAction = action.kind === "attack"
        economy.attacksLeft = action.kind === "attack" ? Math.max(0, actor.state.stats.multiattack - 1) : 0
    } else if (action.kind === "attack" && economy.attackAction && economy.attacksLeft > 0) {
        economy.attacksLeft -= 1
    } else {
        throw new TacticalToolError(`${actor.name} já usou a Ação neste turno${actor.state.stats.multiattack > 1 ? " (e todos os Ataques Múltiplos)" : ""}.`)
    }
    if (action.recharge) action.available = false
    return action
}

export interface MonsterActionInput {
    combatente: string
    acao: string
    alvos: string[]
    modo?: "normal" | "vantagem" | "desvantagem"
    reacao?: boolean
}

/** Ataque, salvaguarda ou outra ação de um adversário: o servidor rola e aplica (na cópia). */
export async function monsterAction(campaignId: Types.ObjectId, jobId: string, turnNumber: number, input: MonsterActionInput): Promise<Record<string, unknown>> {
    const workspace = await workspaceOf(campaignId, jobId, turnNumber)
    const attacker = targetOf(workspace, input.combatente)
    if (attacker.kind !== "combatant") throw new TacticalToolError(`${attacker.name} é um personagem jogador: quem age por ele é o jogador.`)
    const targets = input.alvos.map((name) => targetOf(workspace, name))
    if (input.reacao) {
        for (const target of targets) {
            if (target.kind === "character" && target.state.flags.disengaged) throw new TacticalToolError(`${target.name} usou Desengajar neste turno: o movimento dele não provoca ataque de oportunidade.`)
        }
    }
    const action = monsterActionOf(workspace, attacker, input.acao, Boolean(input.reacao))
    const asked: RollMode = input.modo === "vantagem" ? "advantage" : input.modo === "desvantagem" ? "disadvantage" : "normal"

    if (action.kind === "attack") {
        const target = targets[0]
        if (!target || targets.length !== 1) throw new TacticalToolError("Um ataque tem exatamente um alvo em `alvos`.")
        const ranged = action.ranged
        const computed = attackMode({ attacker: attacker.state, target: target.state, ranged, helped: Boolean(attacker.state.flags.helped) })
        const mode = combineModes(computed.mode === "advantage" || asked === "advantage", computed.mode === "disadvantage" || asked === "disadvantage")
        const ac = target.kind === "character" ? (workspace.sheets[target.key]?.armorClass ?? 10) + (target.state.flags.shield ? 5 : 0) : target.state.stats.ac
        const attackRoll = await rollExpression(d20Expression(action.bonus ?? 0), { mode, label: `${attacker.name} · ${action.name}` })
        const d20 = keptD20Of(attackRoll)
        const outcome = attackOutcome(d20, attackRoll.total, ac, autoCritical(target.state, ranged))
        showRoll(campaignId, jobId, attackRoll, { actorName: attacker.name, label: `${action.name} · ataque`, step: "attack", targetName: target.name, verdict: outcome.critical ? "critical" : outcome.hit ? "hit" : "miss" })
        const steps: CombatActionStep[] = [step({ kind: "attack", targetKey: target.key, targetName: target.name, dice: d20Expression(action.bonus ?? 0), mode, roll: attackRoll, total: attackRoll.total, hit: outcome.hit, critical: outcome.critical })]
        let summary = `${attacker.name} atacou ${target.name} com ${action.name}: ${outcome.hit ? (outcome.critical ? "CRÍTICO" : "acertou") : "errou"} (${attackRoll.total}${d20 === 20 || d20 === 1 ? `, ${d20} natural` : ""} contra CA ${ac})`
        const result: Record<string, unknown> = { ataque: { total: attackRoll.total, d20, ca: ac, acertou: outcome.hit, critico: outcome.critical, modo: mode } }
        if (outcome.hit && action.damage) {
            const expression = parseDiceExpression(action.damage)!
            const damageRoll = await rollExpression(formatDiceExpression(outcome.critical ? criticalExpression(expression) : expression), { label: `${attacker.name} · dano` })
            if (target.kind === "character") {
                const hit = reactionsFor(workspace, target, "hit")
                if (hit.length && canWait(workspace)) {
                    steps.push(step({ kind: "damage", targetKey: target.key, targetName: target.name, status: "pending", dice: action.damage, roll: damageRoll, total: damageRoll.total, damageType: action.damageType, note: "aguardando a reação" }))
                    openReaction(workspace, target, "hit", `${attacker.name} acertou ${target.name} com ${action.name} (${attackRoll.total})`, hit, attacker.key, {
                        attackerKey: attacker.key,
                        attackerName: attacker.name,
                        actionName: action.name,
                        total: attackRoll.total,
                        d20,
                        damage: damageRoll.total,
                        damageType: action.damageType,
                        critical: outcome.critical,
                    })
                    actionCard(workspace, attacker, { label: action.name, economy: input.reacao ? "reaction" : action.economy, targets, steps, summary: `${summary}; ${target.name} pode reagir` })
                    return { ...result, status: "aguardando_reacao", nota: `${target.name} pode reagir (${hit.map((option) => option.label).join(", ")}). Narre até o golpe chegar e PARE: o resultado vem na próxima mensagem. Não conduza outros adversários nesta narração.` }
                }
                const note = damageCharacter(workspace, target, damageRoll.total, outcome.critical, attacker.name)
                showRoll(campaignId, jobId, damageRoll, { actorName: attacker.name, label: `${action.name} · dano`, step: "damage", targetName: target.name, amount: damageRoll.total, damageType: action.damageType })
                steps.push(step({ kind: "damage", targetKey: target.key, targetName: target.name, dice: action.damage, roll: damageRoll, total: damageRoll.total, amount: damageRoll.total, damageType: action.damageType, note: note || null }))
                summary += `; ${damageRoll.total} de dano${action.damageType ? ` ${action.damageType}` : ""}${note ? ` (${note})` : ""}`
                const damaged = reactionsFor(workspace, target, "damaged")
                if (damaged.length && !target.state.hpZero && canWait(workspace)) openReaction(workspace, target, "damaged", `${target.name} sofreu dano de ${attacker.name}`, damaged, attacker.key, null)
                result.dano = { total: damageRoll.total, tipo: action.damageType, alvo: target.name, pv: `${workspace.sheets[target.key]?.hp ?? "?"}/${workspace.sheets[target.key]?.hpMax ?? "?"}`, efeito: note || null }
            } else {
                const adjusted = adjustDamage(damageRoll.total, action.damageType, target.state.stats)
                const note = damageCombatant(target, adjusted.amount)
                showRoll(campaignId, jobId, damageRoll, { actorName: attacker.name, label: `${action.name} · dano`, step: "damage", targetName: target.name, amount: adjusted.amount, damageType: action.damageType })
                steps.push(step({ kind: "damage", targetKey: target.key, targetName: target.name, dice: action.damage, roll: damageRoll, total: damageRoll.total, amount: adjusted.amount, damageType: action.damageType, note: [adjusted.note, note].filter(Boolean).join("; ") || null }))
                summary += `; ${adjusted.amount} de dano${note ? ` (${note})` : ""}`
                result.dano = { total: adjusted.amount, alvo: target.name, efeito: note || null }
            }
        }
        actionCard(workspace, attacker, { label: action.name, economy: input.reacao ? "reaction" : action.economy, targets, steps, summary })
        return { ...result, resumo: summary }
    }

    if (action.kind === "save") {
        if (!targets.length) throw new TacticalToolError("Informe os alvos da salvaguarda em `alvos`.")
        const ability = action.ability ?? "dexterity"
        const damageRoll = action.damage ? await rollExpression(action.damage, { label: `${attacker.name} · ${action.name}` }) : null
        if (damageRoll) showRoll(campaignId, jobId, damageRoll, { actorName: attacker.name, label: `${action.name} · dano`, step: "damage", amount: damageRoll.total, damageType: action.damageType })
        const steps: CombatActionStep[] = []
        const waits: string[] = []
        for (const target of targets) {
            if (target.kind === "character") {
                const forced = saveMode(target.state, ability)
                if (forced === "fail" || !canWait(workspace)) {
                    const amount = damageRoll ? damageRoll.total : 0
                    const note = amount ? damageCharacter(workspace, target, amount, false, attacker.name) : ""
                    steps.push(step({ kind: "save", targetKey: target.key, targetName: target.name, success: false, amount, damageType: action.damageType, note: forced === "fail" ? "falha automática" : note || null }))
                    continue
                }
                workspace.messages.push(
                    baseMessage(workspace, "combat-roll", {
                        ...characterMessage(target.state),
                        combatRoll: rollDoc(workspace, {
                            kind: "save",
                            ability,
                            dc: action.dc ?? 10,
                            dice: d20Expression(workspace.sheets[target.key]?.saves[ability] ?? 0),
                            mode: forced,
                            reason: `${attacker.name} · ${action.name}: salvaguarda de ${MADDOX_ABILITY_LABELS[ability]} CD ${action.dc ?? 10}`,
                            targetKey: target.key,
                            effect: { sourceName: `${attacker.name} · ${action.name}`, damage: damageRoll?.total ?? null, damageType: action.damageType, halfOnSave: action.halfOnSave, condition: null },
                        }),
                    }),
                )
                waits.push(target.name)
                steps.push(step({ kind: "save", targetKey: target.key, targetName: target.name, status: "pending", roller: "player", note: "o jogador rola" }))
            } else {
                const forced = saveMode(target.state, ability)
                const saveRoll = forced === "fail" ? null : await rollExpression(d20Expression(target.state.stats.saves[ability] ?? 0), { mode: forced, label: `${target.name} · salvaguarda` })
                const success = saveRoll ? saveRoll.total >= (action.dc ?? 10) : false
                if (saveRoll) showRoll(campaignId, jobId, saveRoll, { actorName: target.name, label: `Salvaguarda contra ${action.name}`, step: "save", targetName: target.name, verdict: success ? "success" : "fail" })
                const base = damageRoll?.total ?? 0
                const adjusted = adjustDamage(success ? (action.halfOnSave ? Math.floor(base / 2) : 0) : base, action.damageType, target.state.stats)
                const note = adjusted.amount ? damageCombatant(target, adjusted.amount) : ""
                steps.push(step({ kind: "save", targetKey: target.key, targetName: target.name, roll: saveRoll, total: saveRoll?.total ?? null, success, amount: adjusted.amount, damageType: action.damageType, note: note || null }))
            }
        }
        const summary = `${attacker.name} usou ${action.name} (salvaguarda de ${MADDOX_ABILITY_LABELS[ability]} CD ${action.dc ?? 10})${damageRoll ? `, ${damageRoll.total} de dano${action.damageType ? ` ${action.damageType}` : ""}${action.halfOnSave ? " (metade no sucesso)" : ""}` : ""} em ${targets.map((target) => target.name).join(", ")}`
        actionCard(workspace, attacker, { label: action.name, economy: action.economy, targets, steps, summary })
        if (waits.length) return { status: "aguardando_salvaguardas", resumo: summary, nota: `${waits.join(", ")} rola(m) a salvaguarda. Narre até o efeito chegar e PARE: o resultado vem na próxima mensagem.` }
        return { resumo: summary }
    }

    const summary = `${attacker.name} usou ${action.name}${targets.length ? ` em ${targets.map((target) => target.name).join(", ")}` : ""}`
    actionCard(workspace, attacker, { label: action.name, economy: action.economy, targets, steps: [], summary })
    return { resumo: summary, nota: "Ação sem rolagem automática: narre o efeito pela descrição do bloco e use apply_effect para condições, dano ou cura." }
}

export interface ApplyEffectInput {
    alvo: string
    condicao?: string
    remover?: boolean
    duracaoRodadas?: number
    dano?: string
    tipoDano?: string
    cura?: string
    descricao: string
}

/** Efeito adjudicado pelo Maddox (ambiente, magia utilitária, ação livre): condição, dano ou cura em dados rolados pelo servidor. */
export async function applyEffect(campaignId: Types.ObjectId, jobId: string, turnNumber: number, input: ApplyEffectInput): Promise<Record<string, unknown>> {
    const workspace = await workspaceOf(campaignId, jobId, turnNumber)
    const target = targetOf(workspace, input.alvo)
    const parts: string[] = []
    const steps: CombatActionStep[] = []
    if (input.condicao) {
        const key = conditionKeyOf(input.condicao)
        if (!key) throw new TacticalToolError(`Condição "${input.condicao}" desconhecida. Condições: ${MADDOX_CONDITIONS.map((item) => MADDOX_CONDITION_LABELS[item]).join(", ")}.`)
        if (input.remover) {
            target.state.conditions = target.state.conditions.filter((condition) => condition.key !== key)
            parts.push(`${target.name} não está mais ${MADDOX_CONDITION_LABELS[key]}`)
        } else {
            if (target.kind === "combatant" && target.state.stats.conditionImmunities.includes(key)) parts.push(`${target.name} é imune a ${MADDOX_CONDITION_LABELS[key]}`)
            else {
                target.state.conditions = [...target.state.conditions.filter((condition) => condition.key !== key), { key, untilRound: input.duracaoRodadas ? workspace.combat.tactical.round + input.duracaoRodadas : null, source: input.descricao.slice(0, 80) }]
                parts.push(`${target.name} está ${MADDOX_CONDITION_LABELS[key]}${input.duracaoRodadas ? ` por ${input.duracaoRodadas} rodada(s)` : ""}`)
            }
        }
    }
    for (const [kind, raw] of [["damage", input.dano], ["heal", input.cura]] as const) {
        if (!raw) continue
        const expression = parseDiceExpression(raw)
        if (!expression) throw new TacticalToolError(`"${raw}" não é uma expressão de dados (ex.: 2d6+3).`)
        const roll = await rollExpression(formatDiceExpression(expression), { label: input.descricao.slice(0, 60) })
        showRoll(campaignId, jobId, roll, { actorName: "Maddox", label: input.descricao.slice(0, 60), step: kind === "heal" ? "heal" : "damage", targetName: target.name, amount: roll.total, damageType: kind === "heal" ? null : (input.tipoDano ?? null) })
        if (kind === "heal") {
            const healed = healActor(workspace, target, roll.total)
            steps.push(step({ kind: "heal", targetKey: target.key, targetName: target.name, dice: raw, roll, total: roll.total, amount: healed }))
            parts.push(`${target.name} recuperou ${healed} PV`)
        } else if (target.kind === "character") {
            const note = damageCharacter(workspace, target, roll.total, false, input.descricao)
            steps.push(step({ kind: "damage", targetKey: target.key, targetName: target.name, dice: raw, roll, total: roll.total, amount: roll.total, damageType: input.tipoDano ?? null, note: note || null }))
            parts.push(`${target.name} sofreu ${roll.total} de dano${input.tipoDano ? ` ${input.tipoDano}` : ""}${note ? ` (${note})` : ""}`)
        } else {
            const adjusted = adjustDamage(roll.total, input.tipoDano ?? null, target.state.stats)
            const note = damageCombatant(target, adjusted.amount)
            steps.push(step({ kind: "damage", targetKey: target.key, targetName: target.name, dice: raw, roll, total: roll.total, amount: adjusted.amount, damageType: input.tipoDano ?? null, note: [adjusted.note, note].filter(Boolean).join("; ") || null }))
            parts.push(`${target.name} sofreu ${adjusted.amount} de dano${note ? ` (${note})` : ""}`)
        }
    }
    if (!parts.length) throw new TacticalToolError("Informe `condicao`, `dano` ou `cura`.")
    const summary = `${input.descricao}: ${parts.join("; ")}`
    const doc: IMaddoxCombatAction = {
        combatId: String(workspace.combat._id),
        round: workspace.combat.tactical.round,
        actorKey: "maddox",
        actorName: "Maddox",
        actorKind: "combatant",
        economy: "action",
        category: "monster",
        optionId: "effect",
        label: input.descricao.slice(0, 120),
        targets: [{ actorKey: target.key, name: target.name }],
        spellLevel: null,
        freeText: null,
        status: "resolved",
        steps,
        summary,
        waitRound: null,
    }
    workspace.messages.push(baseMessage(workspace, "combat-action", { combatAction: doc }))
    workspace.lines.push(summary)
    return { resumo: summary }
}

function healActor(workspace: TacticalWorkspace, target: CombatActor, amount: number): number {
    if (target.kind === "combatant") {
        const healed = applyHealing({ hp: target.state.stats.hp, hpMax: target.state.stats.hpMax, tempHp: target.state.stats.tempHp }, amount)
        target.state.stats.hp = healed.hp
        if (healed.hp > 0) target.state.defeated = false
        return healed.healed
    }
    const hp = workspace.sheets[target.key]
    if (!hp) return 0
    hp.changed = true
    return characterHealing(target.state, hp, amount)
}

export interface DamageRollInput {
    personagem: string
    dados: string
    tipoDano?: string
    alvo: string
    motivo: string
}

/** Dano de uma ação livre aceita: o JOGADOR rola (espera); o resultado entra no alvo. */
export async function requestDamageRoll(campaignId: Types.ObjectId, jobId: string, turnNumber: number, input: DamageRollInput): Promise<Record<string, unknown>> {
    const workspace = await workspaceOf(campaignId, jobId, turnNumber)
    const roller = targetOf(workspace, input.personagem)
    if (roller.kind !== "character") throw new TacticalToolError(`${roller.name} não é um personagem jogador: para dano de adversário use monster_action ou apply_effect.`)
    const target = targetOf(workspace, input.alvo)
    const expression = parseDiceExpression(input.dados)
    if (!expression) throw new TacticalToolError(`"${input.dados}" não é uma expressão de dados (ex.: 1d8+3).`)
    if (!canWait(workspace)) throw new TacticalToolError("Limite de esperas deste turno atingido: resolva sem nova rolagem.")
    workspace.messages.push(
        baseMessage(workspace, "combat-roll", {
            ...characterMessage(roller.state),
            combatRoll: { ...rollDoc(workspace, { kind: "damage", ability: null, dc: null, dice: formatDiceExpression(expression), reason: input.motivo.slice(0, 200), targetKey: target.key }), effect: { sourceName: roller.name, damage: null, damageType: input.tipoDano ?? null, halfOnSave: false, condition: null } },
        }),
    )
    return { status: "aguardando_rolagem", nota: `${roller.name} rola ${formatDiceExpression(expression)} de dano em ${target.name}. Narre até o momento do golpe e PARE.` }
}

export interface OfferReactionInput {
    personagens: string[]
    gatilho: "saiu-do-alcance" | "conjura-magia" | "preparada" | "outro"
    descricao: string
    fonte?: string
}

const TRIGGER_OF: Record<OfferReactionInput["gatilho"], MaddoxReactionTrigger> = { "saiu-do-alcance": "leave-reach", "conjura-magia": "spell", preparada: "ready", outro: "other" }

/** Abre a janela de reação para os personagens (ataque de oportunidade, Contramágica, ação preparada). */
export async function offerReaction(campaignId: Types.ObjectId, jobId: string, turnNumber: number, input: OfferReactionInput): Promise<Record<string, unknown>> {
    const workspace = await workspaceOf(campaignId, jobId, turnNumber)
    if (!canWait(workspace)) throw new TacticalToolError("Limite de esperas deste turno atingido: siga sem reações.")
    const trigger = TRIGGER_OF[input.gatilho]
    const source = input.fonte ? targetOf(workspace, input.fonte) : null
    // O ataque de oportunidade precisa do alvo: sem a fonte, o jogador gastaria a reação sem ter em quem bater.
    if (trigger === "leave-reach" && source?.kind !== "combatant") throw new TacticalToolError("Para o ataque de oportunidade, informe em `fonte` o adversário que saiu do alcance.")
    if (trigger === "leave-reach" && source?.kind === "combatant" && source.state.flags.disengaged) throw new TacticalToolError(`${source.name} se desengajou: não provoca ataque de oportunidade.`)
    const opened: string[] = []
    const skipped: string[] = []
    for (const name of input.personagens) {
        const actor = targetOf(workspace, name)
        if (actor.kind !== "character") throw new TacticalToolError(`${actor.name} não é um personagem jogador.`)
        const options = reactionsFor(workspace, actor, trigger)
        if (!options.length) {
            skipped.push(actor.name)
            continue
        }
        openReaction(workspace, actor, trigger, input.descricao.slice(0, 200), options, source?.key ?? null, null)
        opened.push(actor.name)
    }
    if (!opened.length) return { status: "sem_reacao", nota: `${skipped.join(", ") || "Ninguém"} não tem reação para esse gatilho agora: siga a narração.` }
    return { status: "aguardando_reacao", abertas: opened, ...(skipped.length ? { semReacao: skipped } : {}), nota: "Narre até o gatilho e PARE: a escolha dos jogadores vem na próxima mensagem." }
}

/** O combate tático como o Maddox o vê agora (cópia de trabalho, se houver): ordem, rodada, PV, CA e quem age. */
export async function tacticalView(campaignId: Types.ObjectId, jobId: string | undefined): Promise<Record<string, unknown> | null> {
    const workspace = jobId ? jobWorkspace<TacticalWorkspace>(String(campaignId), jobId) : null
    const combat = workspace?.combat ?? (await findActiveTactical(campaignId))
    if (!combat) return null
    const sheets = workspace?.sheets ?? {}
    return {
        titulo: combat.title,
        fase: combat.tactical.phase,
        rodada: combat.tactical.round,
        agemAgora: (combat.tactical.block ? (combat.tactical.block.kind === "npc" && combat.tactical.block.actorKey ? [combat.tactical.block.actorKey] : []) : combat.tactical.queue).map((key) => findActor(combat, key)?.name).filter(Boolean),
        ...(combat.tactical.block ? { depois: remainingBlocks(combat).map((key) => findActor(combat, key)?.name).filter(Boolean) } : {}),
        proximaVez: combat.tactical.nextKey ? (findActor(combat, combat.tactical.nextKey)?.name ?? null) : null,
        ordem: combat.tactical.order.map((slot) => {
            const actor = findActor(combat, slot.actorKey)
            if (!actor) return { nome: slot.name }
            const conditions = actor.state.conditions.map((condition) => MADDOX_CONDITION_LABELS[condition.key])
            if (actor.kind === "character") {
                const hp = sheets[actor.key]
                return { nome: actor.name, tipo: "personagem", iniciativa: slot.total, ...(hp ? { pv: `${hp.hp}/${hp.hpMax}`, ca: hp.armorClass } : {}), condicoes: conditions, ...(actor.state.dead ? { morto: true } : actor.state.hpZero ? { morrendo: !actor.state.stable, estavel: actor.state.stable } : {}), ...(actor.state.concentration ? { concentracao: actor.state.concentration.spell } : {}) }
            }
            const stats = actor.state.stats
            return { nome: actor.name, tipo: actor.combatant.side, iniciativa: slot.total, pv: `${stats.hp}/${stats.hpMax}`, ca: stats.ac, caido: actor.state.defeated, condicoes: conditions, acoes: stats.actions.map((action) => `${action.name}${action.available ? "" : " (recarregando)"}`), ...(stats.multiattack > 1 ? { ataquesMultiplos: stats.multiattack } : {}) }
        }),
        inimigosDePe: livingEnemies(combat).length,
        personagensConscientes: consciousCharacters(combat).length,
    }
}

/**
 * Grava a cópia de trabalho depois que a narração foi gerada: o combate (troca condicional pela versão), PV e testes
 * contra a morte nas fichas. Devolve as mensagens a inserir junto com a narração (cards das ações, salvaguardas,
 * reações). Sem cópia (o Maddox não agiu pelos adversários) = nada a gravar.
 */
export async function commitTacticalWorkspace(campaignId: Types.ObjectId, jobId: string): Promise<Record<string, unknown>[]> {
    const workspace = takeJobWorkspace<TacticalWorkspace>(String(campaignId), jobId)
    if (!workspace) return []
    // Personagens com 0 PV mantêm o espelho da ficha (o personagem curado por fora volta a contar).
    for (const state of workspace.combat.tactical.characters) {
        const hp = workspace.sheets[state.actorKey]
        if (hp && !state.dead) state.hpZero = hp.hp <= 0
    }
    await saveTactical(workspace.combat)
    const { writeSheetHitPoints } = await import("./combat-sheet")
    for (const state of workspace.combat.tactical.characters) {
        const hp = workspace.sheets[state.actorKey]
        if (!hp?.changed || !state.sheetId) continue
        await writeSheetHitPoints(state.sheetId, { hp: hp.hp, tempHp: hp.tempHp, deathSaves: hp.deathSaves })
    }
    if (workspace.combat.tactical.characters.some((state) => state.dead)) {
        const { markDeadCharacters } = await import("./tactical-actions")
        await markDeadCharacters(campaignId, workspace.combat)
    }
    const deadline = new Date(Date.now() + MADDOX_REACTION_TIMEOUT_MS)
    for (const message of workspace.messages) {
        const reaction = (message as { combatReaction?: IMaddoxCombatReaction }).combatReaction
        if (reaction) reaction.deadline = deadline
    }
    log.info({ campaignId: String(campaignId), turnNumber: workspace.turnNumber, actions: workspace.lines.length, messages: workspace.messages.length }, "[maddox] vez dos adversários gravada")
    return workspace.messages
}

/** Linhas do que os adversários fizeram (para log e testes). */
export const workspaceLines = (campaignId: string, jobId: string) => jobWorkspace<TacticalWorkspace>(campaignId, jobId)?.lines ?? []
