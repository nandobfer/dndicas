import { Types } from "mongoose"
import { monsterSaveParts } from "../roll-parts"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY } from "../constants"
import { normalizeCatalogName } from "../catalog-markup"
import { attackOutcome } from "../combat-rules"
import type { CombatActionStep, IMaddoxCombatAction, IMaddoxCombatReaction, TacticalCharacterState } from "../combat-types"
import type { MaddoxGameStateDto } from "../game-types"
import { MaddoxCampaignMessageModel, MaddoxCharacterModel, type IMaddoxCampaign, type IMaddoxCampaignMessage } from "../models"
import { assertMemberCanPlay } from "./campaigns"
import { assertActive, getGameState, loadAsMember, publishGameChanged } from "./game"
import { d20Expression as d20ExpressionOf, findActiveTactical, findActor, mutateTactical, rollExpression, scheduleTimer } from "./tactical-combat"
import { characterDamage, type CharacterHp } from "./tactical-master"
import { isOpexUserId } from "./opex-members"

/**
 * Reações dos personagens no combate tático (Maddox 7) — SOMENTE servidor. A janela é aberta pelo ataque de um adversário
 * (gatilhos "atingido" e "sofreu dano") ou pelo Maddox (`offer_reaction`: inimigo saindo do alcance, conjurando magia,
 * ação preparada). Só o jogador indicado vê as opções; tem `MADDOX_REACTION_TIMEOUT_MS` para escolher. Offline recusa na
 * hora; prazo vencido = não reage; o dono pode recusar no lugar. Resolvida a janela, a espera do turno do mestre anda.
 *
 * Resolução no servidor: Escudo (+5 na CA até o próximo turno, reavalia o acerto e gasta o espaço), ataque de
 * oportunidade (o jogador rola ataque e dano dentro da janela), Contramágica (salvaguarda de Constituição do conjurador
 * contra a CD de magia), ação preparada e Esquiva Sobrenatural (metade do dano). As demais são registradas e o Maddox
 * adjudica na continuação.
 */

const log = loggerFor({ module: "maddox", feature: "combat-reactions" })

type MessageDoc = IMaddoxCampaignMessage & { combatReaction: IMaddoxCombatReaction }

const fold = (value: string) => normalizeCatalogName(value)

/** Prazos das janelas recém-gravadas e a recusa de quem está offline. */
export async function armReactionWindows(campaignId: Types.ObjectId): Promise<void> {
    const pending = await MaddoxCampaignMessageModel.find({ campaignId, kind: "combat-reaction", "combatReaction.status": "pending" }).lean<MessageDoc[]>()
    if (!pending.length) return
    const { onlineUserIds } = await import("./game-presence")
    const online = await onlineUserIds(String(campaignId))
    for (const message of pending) {
        if (online && message.userId && !online.has(message.userId) && !isOpexUserId(message.userId)) {
            await settleReaction(campaignId, message, { choice: null, status: "declined", decidedBy: null, reason: "Jogador offline: não reagiu." })
            continue
        }
        const delay = new Date(message.combatReaction.deadline).getTime() - Date.now()
        scheduleTimer(`reaction:${String(campaignId)}:${String(message._id)}`, delay, async () => {
            const fresh = await MaddoxCampaignMessageModel.findById(message._id).lean<MessageDoc>()
            if (fresh?.combatReaction?.status === "pending") await settleReaction(campaignId, fresh, { choice: null, status: "expired", decidedBy: null, reason: "O prazo da reação passou." })
        })
    }
}

/** Escolha do jogador na janela de reação (`none` = não reagir). */
export async function decideReaction(campaignId: string, reactionId: string, choice: string, userId: string): Promise<MaddoxGameStateDto> {
    const { campaign, member } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    if (!Types.ObjectId.isValid(reactionId)) throw new DomainError(404, "Reação não encontrada", "NOT_FOUND")
    const message = await MaddoxCampaignMessageModel.findOne({ _id: new Types.ObjectId(reactionId), campaignId: campaign._id, kind: "combat-reaction" }).lean<MessageDoc>()
    if (!message?.combatReaction) throw new DomainError(404, "Reação não encontrada", "NOT_FOUND")
    const isTarget = String(message.memberId) === String(member._id)
    const isOwner = campaign.ownerId === userId
    if (!isTarget && !(isOwner && choice === "none")) throw new DomainError(403, "Esta reação é de outro jogador.", "NOT_REACTION_TARGET")
    await assertMemberCanPlay(campaignId, userId)
    if (message.combatReaction.status !== "pending") throw new DomainError(409, "Esta janela de reação já fechou.", "REACTION_CLOSED")
    if (choice !== "none" && !message.combatReaction.options.some((option) => option.id === choice)) throw new DomainError(409, "Esta reação não está disponível.", "OPTION_UNAVAILABLE")
    await settleReaction(campaign._id, message, { choice: choice === "none" ? null : choice, status: choice === "none" ? "declined" : "used", decidedBy: userId, reason: choice === "none" ? (isTarget ? "Não reagiu." : "O dono recusou a reação no lugar do jogador.") : null })
    if (!isTarget) await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { turn: message.turnNumber, reaction: reactionId, declinedFor: message.userId } })
    return getGameState(campaignId, userId)
}

interface Settle {
    choice: string | null
    status: "used" | "declined" | "expired"
    decidedBy: string | null
    reason: string | null
}

/** Fecha a janela: aplica o efeito escolhido (ou o golpe que esperava), grava o resultado e deixa a espera andar. */
async function settleReaction(campaignId: Types.ObjectId, message: MessageDoc, settle: Settle): Promise<void> {
    const reaction = message.combatReaction
    const claimed = await MaddoxCampaignMessageModel.updateOne({ _id: message._id, "combatReaction.status": "pending" }, { $set: { "combatReaction.status": settle.status, "combatReaction.choice": settle.choice, "combatReaction.decidedBy": settle.decidedBy } })
    if (claimed.modifiedCount === 0) return
    const option = settle.choice ? (reaction.options.find((item) => item.id === settle.choice) ?? null) : null
    const outcome: string[] = settle.reason ? [settle.reason] : []
    let hpWrite: { state: TacticalCharacterState; hp: CharacterHp } | null = null
    let spawnedAction: IMaddoxCombatAction | null = null
    const combat = await findActiveTactical(campaignId)
    const actorKey = combat?.tactical.characters.find((state) => state.memberId === String(message.memberId))?.actorKey ?? null
    const sheetId = combat?.tactical.characters.find((state) => state.memberId === String(message.memberId))?.sheetId ?? null

    if (combat && actorKey) {
        // Recursos da reação (espaço de magia, carga) antes de aplicar.
        if (option?.spell && option.spell.circle > 0 && sheetId) {
            const { spendSpellSlot } = await import("./combat-sheet")
            const level = option.spell.levels[0]
            if (!level || !(await spendSpellSlot(sheetId, level))) outcome.push(`Sem espaço de magia para ${option.label}: a reação não saiu.`)
        }
        if (option?.charges && sheetId) {
            const { spendResourceCharge } = await import("./combat-sheet")
            await spendResourceCharge(sheetId, option.charges.chargeId)
        }
        const failedSlot = outcome.some((line) => line.startsWith("Sem espaço"))
        const name = option ? fold(option.label) : ""
        const shield = Boolean(option && !failedSlot && /escudo|shield/.test(name) && option.category === "spells")
        const counterspell = Boolean(option && !failedSlot && /contramagica|counterspell/.test(name))
        const uncanny = Boolean(option && /esquiva sobrenatural|uncanny dodge/.test(name))
        const attackOption = Boolean(option && !failedSlot && option.attack && (option.id === "opportunity" || option.category === "weapons" || (option.category === "spells" && option.resolution === "attack")))
        const attackSource = attackOption && reaction.sourceKey ? findActor(combat, reaction.sourceKey) : null
        // Ataque sem alvo (janela aberta sem `fonte`): a reação não sai e não é gasta.
        const noTarget = attackOption && !attackSource
        if (noTarget) outcome.push(`Sem o adversário que provocou o ataque, ${option!.label} não saiu (a reação não foi gasta).`)

        let counterResult: string | null = null
        if (counterspell && reaction.sourceKey) {
            const source = findActor(combat, reaction.sourceKey)
            if (source?.kind === "combatant") {
                const { loadCombatSheets } = await import("./combat-sheet")
                const sheet = sheetId ? (await loadCombatSheets([sheetId])).get(sheetId) : null
                const dc = sheet?.option.spellSaveDc ?? 13
                const save = await rollExpression(d20ExpressionOf(source.state.stats.saves.constitution ?? 0), { label: `${source.name} · salvaguarda contra Contramágica`, modifierParts: monsterSaveParts("constitution", source.state.stats.saves.constitution ?? 0) })
                counterResult = save.total >= dc ? `${source.name} passou na salvaguarda de Constituição (${save.total} contra CD ${dc}): a magia acontece.` : `${source.name} falhou na salvaguarda de Constituição (${save.total} contra CD ${dc}): a magia é anulada.`
            }
        }

        // O callback pode rodar de novo num conflito de versão: as linhas, a escrita de PV e o card do ataque saem da
        // última execução (sem acumular), e o card só é atualizado depois da gravação.
        let applied: string[] = []
        let attackCard: { amount: number; note: string | null; hit: boolean } | null = null
        await mutateTactical(campaignId, async (live) => {
            const lines: string[] = []
            applied = lines
            attackCard = null
            hpWrite = null
            const me = findActor(live, actorKey)
            if (!me || me.kind !== "character") return
            if (option && !failedSlot && !noTarget) me.state.economy.reaction = false
            if (shield) me.state.flags.shield = true
            if (option?.id === "ready") me.state.ready = null
            const attack = reaction.pendingAttack
            // Sem reação, o golpe entra depois (`applyPendingAttack`).
            if (attack && option) {
                const { loadCombatSheets } = await import("./combat-sheet")
                const sheet = me.state.sheetId ? (await loadCombatSheets([me.state.sheetId])).get(me.state.sheetId) : null
                const ac = (sheet?.armorClass ?? 10) + (me.state.flags.shield ? 5 : 0)
                const still = attackOutcome(attack.d20, attack.total, ac)
                if (!still.hit) {
                    lines.push(`Com o Escudo (CA ${ac}), o ataque de ${attack.attackerName} (${attack.total}) errou.`)
                    attackCard = { amount: 0, note: "errou (Escudo)", hit: false }
                } else if (sheet) {
                    const amount = uncanny ? Math.floor(attack.damage / 2) : attack.damage
                    const hp: CharacterHp = { ...sheet.hp, deathSaves: { ...sheet.deathSaves } }
                    const result = characterDamage(me.state, hp, amount, attack.critical)
                    hpWrite = { state: me.state, hp }
                    lines.push(`${attack.attackerName} acertou mesmo assim: ${amount} de dano${attack.damageType ? ` ${attack.damageType}` : ""}${uncanny ? " (metade, Esquiva Sobrenatural)" : ""}${result.notes.length ? ` (${result.notes.join("; ")})` : ""}.`)
                    attackCard = { amount, note: result.notes.join("; ") || null, hit: true }
                }
            }
        })
        outcome.push(...applied)
        const card = attackCard as { amount: number; note: string | null; hit: boolean } | null
        if (card && reaction.pendingAttack) await settleAttackCard(campaignId, message.turnNumber, reaction.pendingAttack.attackerKey, actorKey, card)
        if (counterResult) outcome.push(counterResult)
        if (option && !failedSlot && !shield && !counterspell && !attackOption && !uncanny) outcome.push(`${message.characterName ?? "O personagem"} usou ${option.label} como reação (${reaction.description}).`)
        if (shield && !reaction.pendingAttack) outcome.push(`${message.characterName ?? "O personagem"} conjurou Escudo: +5 na CA até o próximo turno.`)
        if (attackOption && option?.attack && attackSource) {
            const source = attackSource
            // DND-58: a exaustão da ficha vale no ataque de oportunidade.
            const exhaustion = await reactionExhaustion(message.characterId ?? null)
            {
                spawnedAction = {
                    combatId: String(combat._id),
                    round: combat.tactical.round,
                    actorKey,
                    actorName: message.characterName ?? "Personagem",
                    actorKind: "character",
                    economy: "reaction",
                    category: "weapons",
                    optionId: option.id,
                    label: option.label,
                    targets: [{ actorKey: source.key, name: source.name }],
                    spellLevel: null,
                    freeText: null,
                    status: "pending",
                    // Ataque e dano rolados pelo jogador (o dano só se o ataque acertar), como na Ação.
                    steps: [attackStep(source.key, source.name, option.attack.bonus + exhaustion), ...(option.attack.damage && option.attack.damage !== "0" ? [damageStep(source.key, source.name, option.attack.damage, option.attack.damageType)] : [])],
                    ranged: Boolean(option.attack.ranged),
                    summary: `${message.characterName} — Reação: ${option.label} em ${source.name}`,
                    waitRound: reaction.waitRound,
                }
                outcome.push(`${message.characterName} faz ${option.label} contra ${source.name}.`)
            }
        }
    }

    if (hpWrite) {
        const { writeSheetHitPoints } = await import("./combat-sheet")
        const write = hpWrite as { state: TacticalCharacterState; hp: CharacterHp }
        if (write.state.sheetId) await writeSheetHitPoints(write.state.sheetId, { hp: write.hp.hp, tempHp: write.hp.tempHp, deathSaves: write.hp.deathSaves })
    }
    if (!option && reaction.pendingAttack && combat && actorKey) {
        // Sem reação: o golpe que esperava entra agora.
        await applyPendingAttack(campaignId, message, actorKey, outcome)
    }
    await MaddoxCampaignMessageModel.updateOne({ _id: message._id }, { $set: { "combatReaction.outcome": outcome.join(" ") || "Sem reação." } })
    if (spawnedAction) {
        await MaddoxCampaignMessageModel.create({
            campaignId,
            turnNumber: message.turnNumber,
            phase: message.phase,
            kind: "combat-action",
            memberId: message.memberId,
            userId: message.userId,
            characterId: message.characterId,
            characterName: message.characterName,
            content: "",
            segment: message.segment,
            combatAction: { ...(spawnedAction as IMaddoxCombatAction), cancellable: false },
        })
    }
    log.info({ campaignId: String(campaignId), reactionId: String(message._id), status: settle.status, choice: settle.choice }, "[maddox] janela de reação fechada")
    const { markDeadCharacters } = await import("./tactical-actions")
    const after = await findActiveTactical(campaignId)
    if (after) await markDeadCharacters(campaignId, after)
    await publishGameChanged(campaignId)
    const { advanceAfterChecks } = await import("./game-checks")
    await advanceAfterChecks(campaignId, message.turnNumber, reaction.waitRound)
}

async function reactionExhaustion(characterId: Types.ObjectId | null): Promise<number> {
    if (!characterId) return 0
    const character = await MaddoxCharacterModel.findById(characterId).select("sheetId").lean<{ sheetId?: Types.ObjectId | null }>()
    const { characterExhaustionPenalty } = await import("./combat-sheet")
    return characterExhaustionPenalty(character?.sheetId ? String(character.sheetId) : null)
}

const attackStep = (key: string, name: string, bonus: number): CombatActionStep => ({
    kind: "attack",
    targetKey: key,
    targetName: name,
    status: "pending",
    roller: "player",
    dice: d20ExpressionOf(bonus),
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
})

const damageStep = (key: string, name: string, dice: string, damageType: string | null): CombatActionStep => ({ ...attackStep(key, name, 0), kind: "damage", dice, damageType })

/** Sem reação: aplica o dano do golpe que esperava a escolha. */
async function applyPendingAttack(campaignId: Types.ObjectId, message: MessageDoc, actorKey: string, outcome: string[]) {
    const attack = message.combatReaction.pendingAttack!
    let write: { sheetId: string; hp: CharacterHp } | null = null
    let line: string | null = null
    let card: { amount: number; note: string | null; hit: boolean } | null = null
    await mutateTactical(campaignId, async (live) => {
        write = null
        line = null
        card = null
        const me = findActor(live, actorKey)
        if (!me || me.kind !== "character" || !me.state.sheetId) return
        const { loadCombatSheets } = await import("./combat-sheet")
        const sheet = (await loadCombatSheets([me.state.sheetId])).get(me.state.sheetId)
        if (!sheet) return
        const hp: CharacterHp = { ...sheet.hp, deathSaves: { ...sheet.deathSaves } }
        const result = characterDamage(me.state, hp, attack.damage, attack.critical)
        write = { sheetId: me.state.sheetId, hp }
        line = `${attack.attackerName} acertou: ${attack.damage} de dano${attack.damageType ? ` ${attack.damageType}` : ""}${result.notes.length ? ` (${result.notes.join("; ")})` : ""}.`
        card = { amount: attack.damage, note: result.notes.join("; ") || null, hit: true }
    })
    if (line) outcome.push(line)
    if (card) await settleAttackCard(campaignId, message.turnNumber, attack.attackerKey, actorKey, card)
    if (write) {
        const { writeSheetHitPoints } = await import("./combat-sheet")
        const done = write as { sheetId: string; hp: CharacterHp }
        await writeSheetHitPoints(done.sheetId, { hp: done.hp.hp, tempHp: done.hp.tempHp, deathSaves: done.hp.deathSaves })
    }
}

/** Atualiza o card do ataque do adversário que esperava a reação (dano aplicado ou erro). */
async function settleAttackCard(campaignId: Types.ObjectId, turnNumber: number, attackerKey: string, targetKey: string, result: { amount: number; note: string | null; hit: boolean }) {
    const card = await MaddoxCampaignMessageModel.findOne({ campaignId, turnNumber, kind: "combat-action", "combatAction.actorKey": attackerKey, "combatAction.steps": { $elemMatch: { kind: "damage", targetKey, status: "pending" } } })
        .sort({ _id: -1 })
        .lean<IMaddoxCampaignMessage>()
    if (!card?.combatAction) return
    const steps = card.combatAction.steps.map((item) => (item.kind === "damage" && item.targetKey === targetKey && item.status === "pending" ? { ...item, status: result.hit ? ("done" as const) : ("skipped" as const), amount: result.amount, note: result.note } : item.kind === "attack" && item.targetKey === targetKey && !result.hit ? { ...item, hit: false } : item))
    await MaddoxCampaignMessageModel.updateOne({ _id: card._id }, { $set: { "combatAction.steps": steps } })
}

/** Linhas de resultado de uma rodada de espera (para a continuação do Maddox). */
export async function waitRoundResults(campaignId: Types.ObjectId, turnNumber: number, round: number): Promise<string[]> {
    const docs = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber, kind: { $in: ["combat-roll", "combat-reaction", "combat-action"] }, $or: [{ "combatRoll.waitRound": round }, { "combatReaction.waitRound": round }, { "combatAction.waitRound": round }] })
        .sort({ _id: 1 })
        .lean<IMaddoxCampaignMessage[]>()
    return docs
        .map((doc) => {
            if (doc.combatRoll) return `${doc.characterName ?? "Personagem"} — ${doc.combatRoll.reason}: ${doc.combatRoll.status === "rolled" ? `${doc.combatRoll.total} → ${doc.combatRoll.outcome ?? ""}` : (doc.combatRoll.outcome ?? "cancelada")}`
            if (doc.combatReaction) return `${doc.characterName ?? "Personagem"} — reação (${doc.combatReaction.description}): ${doc.combatReaction.outcome ?? doc.combatReaction.status}`
            if (doc.combatAction) return doc.combatAction.summary
            return ""
        })
        .filter(Boolean)
}
