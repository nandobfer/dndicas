import { randomUUID } from "node:crypto"
import { partsFromCalc } from "@/features/dice-roller/dice-breakdown"
import { Types } from "mongoose"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY } from "../constants"
import { checkModifier, checkTitle, type MaddoxCheckSheet } from "../check-modifier"
import { MaddoxCampaignMemberModel, MaddoxCampaignMessageModel, MaddoxCampaignModel, type IMaddoxCampaignMessage } from "../models"
import type { MaddoxGameStateDto } from "../game-types"
import { assertMemberCanPlay } from "./campaigns"
import { emitCheckRolled, type MaddoxDraftCheck } from "./game-live"
import { assertActive, getGameState, loadAsMember, publishGameChanged, scheduleMasterTurn } from "./game"

/**
 * Testes pedidos pelo Maddox (Maddox 5) — SOMENTE servidor. Os testes fazem parte do turno do mestre: a narração que os
 * pede deixa o turno esperando as rolagens (`turn.awaitingChecks`); a rolagem é feita aqui, com o motor de dados
 * (`rollGeneralDice`) e o modificador calculado da ficha — o cliente não envia dado nem modificador. Quando o último
 * teste da rodada é rolado (ou cancelado), a continuação do Maddox entra na fila com os resultados.
 */

const log = loggerFor({ module: "maddox", feature: "game-checks" })

type MessageDoc = IMaddoxCampaignMessage

/** Documento da mensagem `check` para um teste pedido na geração (gravado logo depois da narração). */
export function draftCheckMessage(campaignId: Types.ObjectId, turnNumber: number, round: number, draft: MaddoxDraftCheck) {
    return {
        campaignId,
        turnNumber,
        phase: "master" as const,
        kind: "check" as const,
        memberId: new Types.ObjectId(draft.memberId),
        userId: draft.userId,
        characterId: new Types.ObjectId(draft.characterId),
        characterName: draft.characterName,
        content: "",
        check: {
            round,
            status: "pending" as const,
            kind: draft.kind,
            ability: draft.ability,
            skill: draft.skill,
            dc: draft.dc,
            mode: draft.mode,
            reason: draft.reason,
            sheetId: draft.sheetId ? new Types.ObjectId(draft.sheetId) : null,
            roll: null,
            modifierParts: [],
            rolledBy: null,
            rolledAt: null,
            cancelReason: null,
        },
    }
}

/**
 * Rola o teste `checkId`: o jogador indicado ou o dono, no lugar dele (auditado). O modificador sai da ficha na hora;
 * as regras de dado (*overrides*) valem as do jogador do personagem.
 */
export async function rollCheck(campaignId: string, checkId: string, userId: string): Promise<{ roll: DiceRollResponse; state: MaddoxGameStateDto }> {
    const { campaign, member } = await loadAsMember(campaignId, userId)
    assertActive(campaign)
    if (!Types.ObjectId.isValid(checkId)) throw new DomainError(404, "Teste não encontrado", "NOT_FOUND")
    const message = await MaddoxCampaignMessageModel.findOne({ _id: new Types.ObjectId(checkId), campaignId: campaign._id, kind: "check" }).lean<MessageDoc>()
    if (!message?.check) throw new DomainError(404, "Teste não encontrado", "NOT_FOUND")
    const isTarget = String(message.memberId) === String(member._id)
    const isOwner = campaign.ownerId === userId
    if (!isTarget && !isOwner) throw new DomainError(403, "Este teste é de outro jogador.", "NOT_CHECK_TARGET")
    await assertMemberCanPlay(campaignId, userId)
    const check = message.check
    if (check.status === "rolled") throw new DomainError(409, "Este teste já foi rolado.", "CHECK_ALREADY_ROLLED")
    if (check.status !== "pending") throw new DomainError(409, "Este teste foi cancelado.", "CHECK_NOT_PENDING")
    const turn = campaign.turn
    if (turn?.phase !== "master" || !turn.awaitingChecks || turn.number !== message.turnNumber || (turn.checkRound ?? 0) !== check.round) {
        throw new DomainError(409, "Este teste não está mais aguardando a rolagem.", "CHECK_NOT_PENDING")
    }

    const spec = { kind: check.kind, ability: check.ability, skill: check.skill ?? null }
    const sheet = check.sheetId ? await loadSheet(check.sheetId) : null
    const modifier = checkModifier(sheet, spec)
    const [{ rollGeneralDice }, { resolveGeneralDiceTarget }] = await Promise.all([import("@/features/dice-roller/server/dice-roll-service"), import("@/features/dice-roller/server/dice-target")])
    const roll = await rollGeneralDice(
        { terms: [{ dice: "d20", quantity: 1 }], modifier: modifier.value, modifierParts: partsFromCalc(modifier.parts), mode: check.mode, label: checkTitle(spec), source: "sheet" },
        resolveGeneralDiceTarget({ userId: message.userId })!,
    )
    const saved = await MaddoxCampaignMessageModel.updateOne(
        { _id: message._id, "check.status": "pending" },
        { $set: { "check.status": "rolled", "check.roll": roll, "check.modifierParts": modifier.parts, "check.rolledBy": userId, "check.rolledAt": new Date() } },
    )
    if (saved.modifiedCount === 0) throw new DomainError(409, "Este teste já foi rolado.", "CHECK_ALREADY_ROLLED")
    log.info({ campaignId, turnNumber: message.turnNumber, round: check.round, checkId, total: roll.total, byOwner: !isTarget }, "[maddox] Teste rolado")
    if (!isTarget) {
        await recordAudit({ userId, entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY, entidadeId: campaignId, acao: AcaoAuditoria.ATUALIZAR, depois: { turn: message.turnNumber, check: checkId, rolledFor: message.userId, total: roll.total } })
    }
    emitCheckRolled(campaignId, checkId, roll)
    await publishGameChanged(campaign._id)
    await advanceAfterChecks(campaign._id, message.turnNumber, check.round)
    return { roll, state: await getGameState(campaignId, userId) }
}

async function loadSheet(sheetId: Types.ObjectId): Promise<MaddoxCheckSheet | null> {
    const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
    return CharacterSheet.findById(sheetId).lean<MaddoxCheckSheet>()
}

/**
 * Sem teste pendente na rodada, a continuação do Maddox entra na fila (uma só: a troca é condicional e só uma chamada
 * vence, mesmo com rolagens simultâneas).
 */
export async function advanceAfterChecks(campaignId: Types.ObjectId, turnNumber: number, round: number): Promise<boolean> {
    await cancelOrphanChecks(campaignId, turnNumber, round)
    // Combate tático (DND-25): sem personagem pendente na iniciativa, os inimigos rolam agora (e a ordem espera o dado parar).
    const { rollEnemyInitiativeIfReady } = await import("./tactical-combat")
    await rollEnemyInitiativeIfReady(campaignId, turnNumber, round)
    if (await hasRoundWaits(campaignId, turnNumber, round, true)) return false
    const token = randomUUID()
    const now = new Date()
    const won = await MaddoxCampaignModel.updateOne(
        {
            _id: campaignId,
            status: "active",
            "turn.number": turnNumber,
            "turn.phase": "master",
            "turn.awaitingChecks": true,
            "turn.checkRound": round === 0 ? { $in: [0, null] } : round,
            // Pausa de leitura entre dois blocos do combate tático: a continuação só entra depois dela.
            $or: [{ "turn.pauseUntil": null }, { "turn.pauseUntil": { $exists: false } }, { "turn.pauseUntil": { $lte: now } }],
        },
        { $set: { "turn.awaitingChecks": false, "turn.checkRound": round + 1, "turn.generating": { token, startedAt: new Date() }, "turn.failedAt": null, "turn.pauseUntil": null } },
    )
    if (won.modifiedCount === 0) return false
    log.info({ campaignId: String(campaignId), turnNumber, round }, "[maddox] Testes da rodada concluídos; o Maddox continua a narração")
    void scheduleMasterTurn(campaignId, token, turnNumber, round + 1)
    await publishGameChanged(campaignId)
    return true
}

/**
 * A rodada `round` do turno do mestre tem esperas: testes (Maddox 5) e, no combate tático (Maddox 7), rolagens avulsas,
 * janelas de reação e ações de reação (ataque de oportunidade). `pendingOnly` = só as que ainda esperam o jogador.
 */
export async function hasRoundWaits(campaignId: Types.ObjectId, turnNumber: number, round: number, pendingOnly = false): Promise<boolean> {
    const found = await MaddoxCampaignMessageModel.exists({
        campaignId,
        turnNumber,
        $or: [
            { kind: "check", "check.round": round, ...(pendingOnly ? { "check.status": "pending" } : {}) },
            { kind: "combat-roll", "combatRoll.waitRound": round, ...(pendingOnly ? { "combatRoll.status": "pending" } : {}) },
            { kind: "combat-reaction", "combatReaction.waitRound": round, ...(pendingOnly ? { "combatReaction.status": "pending" } : {}) },
            { kind: "combat-action", "combatAction.waitRound": round, ...(pendingOnly ? { "combatAction.status": "pending" } : {}) },
        ],
    })
    if (found || !pendingOnly) return Boolean(found)
    // DND-41: a preparação da mesa de combate aberta nesta rodada (iniciativa) também é espera.
    const { MaddoxCombatPrepModel } = await import("../models")
    if (await MaddoxCombatPrepModel.exists({ campaignId, turnNumber, waitRound: round, status: { $in: ["pending", "running", "failed"] } })) return true
    // Iniciativa dos inimigos (DND-25): o dado ainda está rolando na tela de todos.
    const revealing = await MaddoxCampaignMessageModel.exists({ campaignId, turnNumber, kind: "combat-roll", "combatRoll.waitRound": round, "combatRoll.kind": "enemy-initiative", "combatRoll.revealUntil": { $gt: new Date() } })
    return Boolean(revealing)
}

/**
 * Cancela os testes pendentes da rodada cujo membro já não está na campanha. Cobre quem saiu DURANTE a geração: o
 * pedido ainda estava em memória quando `onMemberLeftGame` rodou, e só virou mensagem pendente depois. Devolve
 * quantos foram cancelados.
 */
export async function cancelOrphanChecks(campaignId: Types.ObjectId, turnNumber: number, round: number): Promise<number> {
    const pending = await MaddoxCampaignMessageModel.find({ campaignId, turnNumber, kind: "check", "check.round": round, "check.status": "pending" }).select("memberId").lean<{ memberId: Types.ObjectId | null }[]>()
    if (!pending.length) return 0
    const memberIds = pending.map((item) => item.memberId).filter((id): id is Types.ObjectId => Boolean(id))
    const joined = await MaddoxCampaignMemberModel.find({ _id: { $in: memberIds }, campaignId, status: "joined" }).select("_id").lean<{ _id: Types.ObjectId }[]>()
    const present = new Set(joined.map((member) => String(member._id)))
    const gone = memberIds.filter((id) => !present.has(String(id)))
    if (!gone.length) return 0
    const cancelled = await MaddoxCampaignMessageModel.updateMany(
        { campaignId, turnNumber, kind: "check", "check.round": round, "check.status": "pending", memberId: { $in: gone } },
        { $set: { "check.status": "cancelled", "check.cancelReason": "O jogador saiu da campanha" } },
    )
    if (cancelled.modifiedCount) log.info({ campaignId: String(campaignId), turnNumber, round, cancelled: cancelled.modifiedCount }, "[maddox] Testes de quem saiu da campanha cancelados")
    return cancelled.modifiedCount
}

/** O membro saiu ou foi removido: os testes pendentes dele são cancelados e a rodada pode terminar. */
export async function cancelMemberChecks(campaignId: Types.ObjectId, memberId: Types.ObjectId): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("status turn").lean<{ status: string; turn: { number: number; phase: string; checkRound?: number; awaitingChecks?: boolean } }>()
    if (!campaign || campaign.status !== "active") return
    const cancelled = await MaddoxCampaignMessageModel.updateMany(
        { campaignId, kind: "check", memberId, "check.status": "pending" },
        { $set: { "check.status": "cancelled", "check.cancelReason": "O jogador saiu da campanha" } },
    )
    if (cancelled.modifiedCount === 0) return
    log.info({ campaignId: String(campaignId), memberId: String(memberId), cancelled: cancelled.modifiedCount }, "[maddox] Testes pendentes cancelados (jogador saiu)")
    await publishGameChanged(campaignId)
    if (campaign.turn?.phase === "master" && campaign.turn.awaitingChecks) await advanceAfterChecks(campaignId, campaign.turn.number, campaign.turn.checkRound ?? 0)
}
