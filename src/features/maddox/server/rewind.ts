import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_MASTER_HEARTBEAT_MS, MADDOX_MASTER_LOCK_STALE_MS } from "../constants"
import {
    INCLUDE_DISCARDED,
    MaddoxCampaignMessageModel,
    MaddoxCampaignModel,
    MaddoxCampaignSnapshotModel,
    MaddoxMemoryRepairModel,
    MaddoxSceneImageModel,
    type IMaddoxCampaign,
    type IMaddoxCampaignSnapshot,
    type MaddoxMemoryChannelRef,
    type MaddoxRewindOp,
} from "../models"
import { availableRewindTurns, undoTarget, type MemoryRewindTarget, type RewindTurnOption } from "../rewind-plan"
import type { MaddoxGameStateDto } from "../game-types"
import { assertMemberCanPlay } from "./campaigns"
import { assertActive, getGameState, loadAsMember, publishGameChanged, readyMemberIds } from "./game"
import { enqueueMaddoxJob, isCampaignBusy } from "./game-live"
import { captureOriginSnapshot, restoreSnapshot } from "./turn-snapshots"

/**
 * Voltar a um turno (DND-44) — SOMENTE servidor; `userId` é o usuário EFETIVO.
 *
 * Só o dono, pronto para jogar, leva a mesa ao estado de um turno já jogado X (o retrato tirado quando a vez dos jogadores
 * de X abriu): a narração de X fica e o que veio depois sai da mesa, do Diário e do contexto do narrador. A primeira volta
 * guarda o retrato de origem (turno N, na fase em que estava): enquanto o Maddox não narrar de novo, o dono anda entre os
 * turnos < N ou retoma o N. A nova narração (`commitRewind`, dentro da fila e da trava do mestre) apaga o trecho de vez.
 *
 * Cada operação toma a trava do mestre (`turn.generating.rewind`, fase `master`): declarações concorrentes caem em
 * `MASTER_TURN`/`TURN_CLOSED`, uma segunda operação responde 409 e a trava velha (processo reiniciado) refaz a mesma
 * operação, que é idempotente. As memórias vão primeiro: com a rede fora, nada muda no Mongo e a resposta é 409
 * `ENGRAMIND_UNAVAILABLE`.
 */

const log = loggerFor({ module: "maddox", feature: "rewind" })

type CampaignDoc = IMaddoxCampaign

export const REWIND_ERRORS = {
    forbidden: "Só o dono da campanha pode voltar a mesa a outro turno.",
    masterTurn: "O Maddox está narrando. Aguarde o turno dos jogadores para voltar a mesa.",
    busy: "O Maddox está respondendo. Aguarde e tente de novo.",
    inProgress: "A mesa já está voltando a outro turno. Aguarde e tente de novo.",
    noPending: "Não há volta pendente: a mesa já está no turno atual.",
    firstTurn: "A mesa está no turno 1: não há para onde voltar.",
    noTurns: "Não há turno anterior para onde voltar. Só os turnos jogados depois da chegada desta função podem ser retomados.",
} as const

export interface MaddoxRewindTurnsDto {
    turns: RewindTurnOption[]
    undoTarget: number | null
    originTurn: number
    atTurn: number
}

const positionOf = (campaign: CampaignDoc) => ({ originTurn: campaign.rewind?.originTurn ?? campaign.turn?.number ?? 0, atTurn: campaign.rewind?.atTurn ?? campaign.turn?.number ?? 0 })

async function turnOptions(campaign: CampaignDoc): Promise<RewindTurnOption[]> {
    const rows = await MaddoxCampaignSnapshotModel.find({ campaignId: campaign._id, kind: "turn" }).select("turnNumber excerpt").lean<RewindTurnOption[]>()
    return availableRewindTurns(rows, positionOf(campaign))
}

function assertOwner(campaign: CampaignDoc, userId: string) {
    if (campaign.ownerId !== userId) throw new DomainError(403, REWIND_ERRORS.forbidden, "FORBIDDEN")
}

/** Por que a mesa não aceita uma volta agora (`null` = aceita). Fase do mestre só com a narração parada por falha. */
function idleBlock(campaign: CampaignDoc): { message: string; code: string } | null {
    const turn = campaign.turn
    if (turn?.generating?.rewind) return { message: REWIND_ERRORS.inProgress, code: "REWIND_IN_PROGRESS" }
    if (turn?.phase === "master") {
        const failed = !turn.generating && !turn.awaitingChecks && Boolean(turn.failedAt) && !(turn.pauseUntil && new Date(turn.pauseUntil).getTime() > Date.now())
        if (!failed) return { message: REWIND_ERRORS.masterTurn, code: "MASTER_TURN" }
    }
    if (isCampaignBusy(String(campaign._id))) return { message: REWIND_ERRORS.busy, code: "MASTER_TURN" }
    return null
}

/** Turnos para onde o dono pode levar a mesa (lista do menu "Turnos"). */
export async function listRewindTurns(campaignId: string, userId: string): Promise<MaddoxRewindTurnsDto> {
    const { campaign } = await loadAsMember(campaignId, userId)
    assertOwner(campaign, userId)
    assertActive(campaign)
    const turns = await turnOptions(campaign)
    const position = positionOf(campaign)
    return { turns, undoTarget: undoTarget(turns, position.atTurn), ...position }
}

/**
 * Controle do botão "Turnos" para o dono (DTO da mesa): disponível ou o motivo em pt-BR. Os demais recebem `null`.
 */
export async function rewindControl(campaign: CampaignDoc, ready: boolean): Promise<NonNullable<MaddoxGameStateDto["me"]["rewind"]>> {
    const position = positionOf(campaign)
    const turns = campaign.status === "active" ? await turnOptions(campaign) : []
    const blockReason = !ready ? "Conclua a entrevista de personagem para voltar a mesa a outro turno." : campaign.status !== "active" ? "A campanha não está em andamento." : (idleBlock(campaign)?.message ?? null)
    const emptyReason = turns.length ? null : position.atTurn <= 1 && !campaign.rewind ? REWIND_ERRORS.firstTurn : REWIND_ERRORS.noTurns
    return { blockReason, emptyReason, undoTarget: undoTarget(turns, position.atTurn), hasTurns: turns.length > 0 }
}

/** Faixa da volta pendente (para toda a mesa). */
export async function rewindBanner(campaign: CampaignDoc): Promise<MaddoxGameStateDto["turn"]["rewind"]> {
    const rewind = campaign.rewind
    if (!rewind || campaign.status !== "active") return null
    const hasNewActions = Boolean(await MaddoxCampaignMessageModel.exists({ campaignId: campaign._id, createdAt: { $gt: rewind.positionAt }, kind: { $ne: "rewind" } }))
    return { atTurn: rewind.atTurn, originTurn: rewind.originTurn, hasNewActions }
}

// ── Operações ────────────────────────────────────────────────────────────────

async function validate(campaignId: string, userId: string): Promise<CampaignDoc> {
    const { campaign } = await loadAsMember(campaignId, userId)
    assertOwner(campaign, userId)
    assertActive(campaign)
    await assertMemberCanPlay(campaignId, userId)
    return campaign
}

function assertIdle(campaign: CampaignDoc) {
    const block = idleBlock(campaign)
    if (block) throw new DomainError(409, block.message, block.code)
}

/** Toma a trava do mestre para a volta (fase `master`): a mesa para de aceitar ações até a operação terminar. */
async function takeLock(campaign: CampaignDoc, op: MaddoxRewindOp): Promise<string> {
    const token = randomUUID()
    const taken = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, status: "active", "turn.number": campaign.turn.number, "turn.phase": campaign.turn.phase, "turn.generating": null, "turn.awaitingChecks": { $ne: true } },
        { $set: { "turn.phase": "master", "turn.generating": { token, startedAt: new Date(), rewind: op } } },
    )
    if (taken.modifiedCount === 0) {
        const fresh = await MaddoxCampaignModel.findById(campaign._id).lean<CampaignDoc>()
        if (fresh?.turn?.generating?.rewind) throw new DomainError(409, REWIND_ERRORS.inProgress, "REWIND_IN_PROGRESS")
        throw new DomainError(409, REWIND_ERRORS.masterTurn, "MASTER_TURN")
    }
    return token
}

/** A operação não chegou a mexer na mesa: devolve o turno de antes e solta a trava. */
async function releaseLock(campaignId: Types.ObjectId, token: string, op: MaddoxRewindOp) {
    await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.generating.token": token }, { $set: { "turn.phase": op.before.phase, "turn.generating": null, "turn.failedAt": op.before.failedAt } })
}

/** Erro antes de qualquer mudança no Mongo: a trava é solta. Depois disso, a trava fica para a retomada refazer a operação. */
class BeforeTableChange extends Error {
    constructor(readonly original: unknown) {
        super(original instanceof Error ? original.message : String(original))
    }
}

/** Roda a operação na fila da campanha (em série com as gerações) e espera o resultado. */
async function runOp(campaignId: Types.ObjectId, token: string, op: MaddoxRewindOp): Promise<void> {
    let failure: unknown = null
    await enqueueMaddoxJob(String(campaignId), op.kind === "goto" ? `volta ao turno ${op.target}` : "retomada do turno de origem", async () => {
        const heartbeat = setInterval(() => {
            void MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.generating.token": token }, { $set: { "turn.generating.startedAt": new Date() } }, { timestamps: false }).catch(() => undefined)
        }, MADDOX_MASTER_HEARTBEAT_MS)
        heartbeat.unref?.()
        try {
            await executeOp(campaignId, token, op)
        } catch (error) {
            failure = error
        } finally {
            clearInterval(heartbeat)
        }
    })
    if (failure) throw failure
}

async function executeOp(campaignId: Types.ObjectId, token: string, op: MaddoxRewindOp): Promise<void> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    if (!campaign || campaign.turn?.generating?.token !== token) return
    try {
        if (op.kind === "goto") await performGoto(campaign, token, op)
        else await performResume(campaign, token, op)
    } catch (error) {
        if (!(error instanceof BeforeTableChange)) {
            log.error({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaignId), op: op.kind }, "[maddox] volta a um turno interrompida: a trava fica para a retomada")
            throw error
        }
        await releaseLock(campaignId, token, op)
        const original = error.original
        if (original instanceof DomainError) throw original
        const { MemoryRewindUnavailableError, MEMORY_REWIND_UNAVAILABLE } = await import("@/features/engramind/server/campaign-rewind")
        if (original instanceof MemoryRewindUnavailableError) {
            log.warn({ err: original.cause instanceof Error ? original.cause.message : String(original.cause), campaignId: String(campaignId) }, "[maddox] rede de memórias indisponível na volta a um turno")
            throw new DomainError(409, MEMORY_REWIND_UNAVAILABLE, "ENGRAMIND_UNAVAILABLE")
        }
        throw original
    }
}

/** Ir ao turno X (cobre "Desfazer turno" e andar para trás ou para frente dentro da volta pendente). */
export async function rewindToTurn(campaignId: string, input: { turnNumber: number }, userId: string): Promise<MaddoxGameStateDto> {
    const campaign = await validate(campaignId, userId)
    assertIdle(campaign)
    const target = input.turnNumber
    const options = await turnOptions(campaign)
    if (!options.some((item) => item.turnNumber === target)) throw new DomainError(409, turnUnavailableReason(campaign, target), "TURN_UNAVAILABLE")
    const op: MaddoxRewindOp = { kind: "goto", target, userId, before: { number: campaign.turn.number, phase: campaign.turn.phase, failedAt: campaign.turn.failedAt ?? null } }
    const token = await takeLock(campaign, op)
    await runOp(campaign._id, token, op)
    return getGameState(campaignId, userId)
}

function turnUnavailableReason(campaign: CampaignDoc, target: number): string {
    const { originTurn, atTurn } = positionOf(campaign)
    if (target === atTurn) return `A mesa já está no turno ${target}.`
    if (target >= originTurn) return `Só dá para voltar a um turno anterior ao ${originTurn}.`
    return `O turno ${target} não pode ser retomado: ele foi jogado antes da chegada desta função.`
}

/** "Voltar ao turno atual (N)": desfaz a volta pendente inteira. */
export async function resumeCurrentTurn(campaignId: string, userId: string): Promise<MaddoxGameStateDto> {
    const campaign = await validate(campaignId, userId)
    if (!campaign.rewind) throw new DomainError(409, REWIND_ERRORS.noPending, "NO_PENDING_REWIND")
    assertIdle(campaign)
    const op: MaddoxRewindOp = { kind: "resume", target: null, userId, before: { number: campaign.turn.number, phase: campaign.turn.phase, failedAt: campaign.turn.failedAt ?? null } }
    const token = await takeLock(campaign, op)
    await runOp(campaign._id, token, op)
    return getGameState(campaignId, userId)
}

// ── Memórias ─────────────────────────────────────────────────────────────────

async function memoryChannels(campaignId: Types.ObjectId, origin: IMaddoxCampaignSnapshot | null) {
    const engramind = await import("@/features/engramind/server/campaign-rewind")
    const boxes = await engramind.npcTokenBoxesOf(String(campaignId))
    for (const npc of origin?.npcs ?? []) {
        const box = (npc as { opex?: { engramind?: { tokenBox?: unknown } | null } | null }).opex?.engramind?.tokenBox
        if (box && !boxes.has(String(npc._id))) boxes.set(String(npc._id), box)
    }
    return { engramind, channels: await engramind.resolveRewindChannels(String(campaignId), boxes) }
}

/**
 * Leva as memórias ao alvo. As tocadas entram no registro do retrato de origem ANTES da primeira mudança (a perda
 * definitiva e as próximas voltas as encontram mesmo com tags antigas). Com a rede fora, tenta devolvê-las à posição em
 * que a mesa estava; se nem isso der, grava o reparo pendente.
 */
async function rewindMemories(campaign: CampaignDoc, origin: IMaddoxCampaignSnapshot, target: MemoryRewindTarget, repairTarget: { asOf: number | null; keepAfter: number | null }): Promise<void> {
    const { engramind, channels } = await memoryChannels(campaign._id, origin)
    if (!channels) return
    const known = new Set(origin.memories.map((item) => item.id))
    let touched: { id: string; ref: MaddoxMemoryChannelRef }[] = []
    try {
        const items = await engramind.planMemoryRewinds(channels, target, known)
        touched = items.filter((item) => !known.has(item.id)).map(({ id, ref }) => ({ id, ref }))
        if (touched.length) await MaddoxCampaignSnapshotModel.updateOne({ _id: origin._id }, { $push: { memories: { $each: touched } } })
        await engramind.applyMemoryRewinds(channels, items)
    } catch (error) {
        const all = [...origin.memories, ...touched]
        await repairMemoriesNow(campaign._id, origin, { ...repairTarget, known: all }).catch(async () => {
            await MaddoxCampaignModel.updateOne({ _id: campaign._id }, { $set: { memoryRepair: { ...repairTarget, known: all, at: new Date() } } })
        })
        throw new BeforeTableChange(error)
    }
}

async function repairMemoriesNow(campaignId: Types.ObjectId, origin: IMaddoxCampaignSnapshot | null, repair: { asOf: number | null; keepAfter: number | null; known: { id: string; ref: MaddoxMemoryChannelRef }[] }): Promise<void> {
    const { engramind, channels } = await memoryChannels(campaignId, origin)
    if (!channels) return
    const items = await engramind.planMemoryRewinds(channels, { asOf: repair.asOf ?? Number.POSITIVE_INFINITY, keepAfter: repair.keepAfter, deleteAfter: null }, new Set(repair.known.map((item) => item.id)))
    await engramind.applyMemoryRewinds(channels, items)
}

/** Reparo pendente de uma volta que falhou: roda antes da próxima operação. Lança com a rede fora. */
async function runPendingRepair(campaign: CampaignDoc, origin: IMaddoxCampaignSnapshot | null): Promise<void> {
    const repair = campaign.memoryRepair
    if (!repair) return
    await repairMemoriesNow(campaign._id, origin, repair)
    await MaddoxCampaignModel.updateOne({ _id: campaign._id, "memoryRepair.at": repair.at }, { $set: { memoryRepair: null } })
}

// ── Mesa ─────────────────────────────────────────────────────────────────────

/** Ações feitas depois de a mesa chegar ao turno atual (declarações novas): apagadas ao trocar de turno ou retomar. */
async function dropNewActions(campaignId: Types.ObjectId, rewindId: string, positionAt: Date): Promise<void> {
    await MaddoxCampaignMessageModel.deleteMany({ campaignId, createdAt: { $gt: positionAt }, kind: { $ne: "rewind" } })
    // Imagens pedidas depois da volta: viram descartadas desta volta (a cota continua contando e a retomada não as traz).
    await MaddoxSceneImageModel.updateMany({ campaignId, createdAt: { $gt: positionAt } }, { $set: { discardedBy: { rewindId: `${rewindId}:novas`, at: new Date() } } })
    const { PendingWrite } = await import("@/features/engramind/server/pending-writes")
    await PendingWrite.deleteMany({ campaignId: String(campaignId), updatedAt: { $gt: positionAt } })
}

/** Mensagens e imagens: o que veio depois do retrato sai da mesa; o que é até ele volta (dentro desta volta). */
async function markTable(campaignId: Types.ObjectId, rewindId: string, snapshot: IMaddoxCampaignSnapshot): Promise<void> {
    const boundary = snapshot.boundaryMessageId
    const after = boundary ? { _id: { $gt: boundary } } : {}
    await MaddoxCampaignMessageModel.updateMany({ campaignId, kind: { $ne: "rewind" }, ...after }, [{ $set: { discardedBy: { rewindId, at: "$$NOW", turnAction: "$turnAction" }, turnAction: false } }], { updatePipeline: true, timestamps: false })
    if (boundary) {
        await MaddoxCampaignMessageModel.updateMany({ campaignId, "discardedBy.rewindId": rewindId, _id: { $lte: boundary } }, [{ $set: { turnAction: { $ifNull: ["$discardedBy.turnAction", false] }, discardedBy: null } }], { updatePipeline: true, timestamps: false })
    }
    await MaddoxSceneImageModel.updateMany({ campaignId, createdAt: { $gt: snapshot.takenAt } }, { $set: { discardedBy: { rewindId, at: new Date() } } }, { timestamps: false })
    await MaddoxSceneImageModel.updateMany({ campaignId, "discardedBy.rewindId": rewindId, createdAt: { $lte: snapshot.takenAt } }, { $set: { discardedBy: null } }, { timestamps: false })
}

/** Retomada: tudo o que esta volta tirou da mesa volta. */
async function unmarkTable(campaignId: Types.ObjectId, rewindId: string): Promise<void> {
    await MaddoxCampaignMessageModel.updateMany({ campaignId, "discardedBy.rewindId": rewindId }, [{ $set: { turnAction: { $ifNull: ["$discardedBy.turnAction", false] }, discardedBy: null } }], { updatePipeline: true, timestamps: false })
    await MaddoxSceneImageModel.updateMany({ campaignId, "discardedBy.rewindId": rewindId }, { $set: { discardedBy: null } }, { timestamps: false })
}

/** Prazos do combate, sessão do narrador e preparação do combate depois de a mesa mudar de turno. */
async function afterTableMoved(campaign: CampaignDoc, combatActor: boolean): Promise<void> {
    const id = String(campaign._id)
    const { rotateNarratorSession } = await import("./opencode-sessions")
    void rotateNarratorSession(id)
    await publishGameChanged(campaign._id)
    const { notifyJournalChanged } = await import("@/features/engramind/server/campaign-memories")
    await notifyJournalChanged(id).catch(() => undefined)
    if (combatActor) void import("./tactical-actions").then(({ evaluateCombatAbsence }) => evaluateCombatAbsence(campaign._id)).catch(() => undefined)
    void import("./combat-prep").then(({ scheduleCombatPreps }) => scheduleCombatPreps(campaign._id)).catch(() => undefined)
}

async function notice(campaignId: Types.ObjectId, turnNumber: number, event: "goto" | "resume", originTurn: number) {
    await MaddoxCampaignMessageModel.create({ campaignId, turnNumber, phase: "players", kind: "rewind", content: "", rewindNotice: { event, turnNumber, originTurn } })
}

async function performGoto(campaign: CampaignDoc, token: string, op: MaddoxRewindOp): Promise<void> {
    const target = op.target!
    const campaignId = campaign._id
    const snapshot = await MaddoxCampaignSnapshotModel.findOne({ campaignId, kind: "turn", turnNumber: target }).lean<IMaddoxCampaignSnapshot>()
    if (!snapshot) throw new BeforeTableChange(new DomainError(409, turnUnavailableReason(campaign, target), "TURN_UNAVAILABLE"))

    let rewind = campaign.rewind ?? null
    let origin: IMaddoxCampaignSnapshot | null
    let first = false
    if (!rewind) {
        first = true
        const id = randomUUID()
        const before = { ...campaign, turn: { ...campaign.turn, phase: op.before.phase, generating: null, failedAt: op.before.failedAt } } as CampaignDoc
        origin = await captureOriginSnapshot(before, id)
        rewind = { id, originTurn: op.before.number, originPhase: op.before.phase, atTurn: op.before.number, positionAt: origin.takenAt, startedAt: new Date(), byUserId: op.userId, originSnapshotId: origin._id }
        await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.generating.token": token }, { $set: { rewind } })
    } else {
        origin = await MaddoxCampaignSnapshotModel.findById(rewind.originSnapshotId).lean<IMaddoxCampaignSnapshot>()
    }
    if (!origin) throw new Error("Retrato de origem da volta pendente não encontrado")

    try {
        await runPendingRepair(campaign, origin).catch((error: unknown) => {
            throw new BeforeTableChange(error)
        })
        const atSnapshot = first ? null : await MaddoxCampaignSnapshotModel.findOne({ campaignId, kind: "turn", turnNumber: rewind.atTurn }).select("takenAt").lean<{ takenAt: Date }>()
        await rewindMemories(
            campaign,
            origin,
            { asOf: snapshot.takenAt.getTime(), deleteAfter: origin.takenAt.getTime() },
            first ? { asOf: null, keepAfter: null } : { asOf: atSnapshot?.takenAt.getTime() ?? null, keepAfter: new Date(rewind.positionAt).getTime() },
        )
    } catch (error) {
        if (first && error instanceof BeforeTableChange) {
            // Primeira volta que não aconteceu: a mesa continua sem volta pendente.
            await MaddoxCampaignModel.updateOne({ _id: campaignId, "rewind.id": rewind.id }, { $set: { rewind: null } })
            await MaddoxCampaignSnapshotModel.deleteOne({ _id: origin._id })
        }
        throw error
    }

    const { cancelCampaignTimers } = await import("./tactical-combat")
    cancelCampaignTimers(String(campaignId))
    if (!first) await dropNewActions(campaignId, rewind.id, new Date(rewind.positionAt))
    const { stashPendingWrites } = await import("@/features/engramind/server/campaign-rewind")
    const stashed = await stashPendingWrites(String(campaignId), snapshot.takenAt)
    if (stashed.length) await MaddoxCampaignSnapshotModel.updateOne({ _id: origin._id }, { $push: { pendingWrites: { $each: stashed } } })
    await markTable(campaignId, rewind.id, snapshot)
    await restoreSnapshot(snapshot)

    const combatActor = (snapshot.turn as { combatActor?: CampaignDoc["turn"]["combatActor"] } | null)?.combatActor ?? null
    const eligible = combatActor ? [combatActor.memberId] : await readyMemberIds(campaignId)
    const positionAt = new Date()
    const moved = await MaddoxCampaignModel.updateOne(
        { _id: campaignId, "turn.generating.token": token },
        {
            $set: {
                turn: { number: target, phase: "players", startedAt: positionAt, eligibleMemberIds: eligible, declaredMemberIds: [], generating: null, failedAt: null, checkRound: 0, awaitingChecks: false, combatActor, pauseUntil: null, opexActor: null },
                "rewind.atTurn": target,
                "rewind.positionAt": positionAt,
            },
        },
    )
    if (moved.modifiedCount === 0) return
    await notice(campaignId, target, "goto", rewind.originTurn)
    await recordAudit({
        userId: op.userId,
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(campaignId),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { turn: op.before.number, phase: op.before.phase },
        depois: { rewind: "goto", turn: target, origin: rewind.originTurn },
    })
    log.info({ campaignId: String(campaignId), from: op.before.number, to: target, origin: rewind.originTurn }, "[maddox] mesa voltou a um turno")
    await afterTableMoved(campaign, Boolean(combatActor))
}

async function performResume(campaign: CampaignDoc, token: string, op: MaddoxRewindOp): Promise<void> {
    const campaignId = campaign._id
    const rewind = campaign.rewind
    if (!rewind) throw new BeforeTableChange(new DomainError(409, REWIND_ERRORS.noPending, "NO_PENDING_REWIND"))
    const origin = await MaddoxCampaignSnapshotModel.findById(rewind.originSnapshotId).lean<IMaddoxCampaignSnapshot>()
    if (!origin) throw new Error("Retrato de origem da volta pendente não encontrado")
    await runPendingRepair(campaign, origin).catch((error: unknown) => {
        throw new BeforeTableChange(error)
    })
    const atSnapshot = await MaddoxCampaignSnapshotModel.findOne({ campaignId, kind: "turn", turnNumber: rewind.atTurn }).select("takenAt").lean<{ takenAt: Date }>()
    await rewindMemories(campaign, origin, { asOf: origin.takenAt.getTime(), deleteAfter: origin.takenAt.getTime() }, { asOf: atSnapshot?.takenAt.getTime() ?? null, keepAfter: new Date(rewind.positionAt).getTime() })

    const { cancelCampaignTimers } = await import("./tactical-combat")
    cancelCampaignTimers(String(campaignId))
    await dropNewActions(campaignId, rewind.id, new Date(rewind.positionAt))
    const { restorePendingWrites } = await import("@/features/engramind/server/campaign-rewind")
    await restorePendingWrites(origin.pendingWrites)
    await unmarkTable(campaignId, rewind.id)
    await restoreSnapshot(origin)

    const turn = { ...(origin.turn as unknown as CampaignDoc["turn"]), generating: null }
    const moved = await MaddoxCampaignModel.updateOne({ _id: campaignId, "turn.generating.token": token }, { $set: { turn, rewind: null } })
    if (moved.modifiedCount === 0) return
    await MaddoxCampaignSnapshotModel.deleteMany({ campaignId, kind: "origin" })
    await notice(campaignId, rewind.originTurn, "resume", rewind.originTurn)
    await recordAudit({
        userId: op.userId,
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(campaignId),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { turn: rewind.atTurn, rewind: "pending" },
        depois: { rewind: "resume", turn: rewind.originTurn, phase: rewind.originPhase },
    })
    log.info({ campaignId: String(campaignId), origin: rewind.originTurn }, "[maddox] dono retomou o turno de origem")
    await afterTableMoved(campaign, Boolean(turn.combatActor))
}

// ── Retomada da trava e perda definitiva ─────────────────────────────────────

/**
 * Trava de uma volta sem processo vivo (reinício): toma a trava e refaz a mesma operação em segundo plano. `true` = a
 * trava é de uma volta (o turno do mestre não a retoma).
 */
export function recoverRewind(campaign: CampaignDoc): boolean {
    const generating = campaign.turn?.generating
    const op = generating?.rewind
    if (!generating || !op) return false
    if (isCampaignBusy(String(campaign._id)) || Date.now() - new Date(generating.startedAt).getTime() < MADDOX_MASTER_LOCK_STALE_MS) return true
    void (async () => {
        const token = randomUUID()
        const taken = await MaddoxCampaignModel.updateOne({ _id: campaign._id, "turn.generating.token": generating.token }, { $set: { "turn.generating.token": token, "turn.generating.startedAt": new Date() } })
        if (taken.modifiedCount === 0) return
        log.info({ campaignId: String(campaign._id), op: op.kind }, "[maddox] retomando a volta a um turno interrompida")
        await runOp(campaign._id, token, op)
    })().catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] a volta a um turno retomada falhou"))
    return true
}

/**
 * Perda definitiva (o Maddox começou a narrar a partir do turno em que a mesa está): as memórias nascidas no trecho
 * descartado são excluídas (falha → fila de reparo, a narração segue), as mensagens descartadas são apagadas, as imagens
 * viram lápides (continuam no teto diário), os retratos posteriores somem e a volta pendente acaba. Roda dentro do job
 * da narração, com a trava do mestre. Idempotente.
 */
export async function commitRewind(campaignId: Types.ObjectId): Promise<void> {
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    const rewind = campaign?.rewind
    if (!campaign || !rewind) return
    const origin = await MaddoxCampaignSnapshotModel.findById(rewind.originSnapshotId).lean<IMaddoxCampaignSnapshot>()
    const atSnapshot = await MaddoxCampaignSnapshotModel.findOne({ campaignId, kind: "turn", turnNumber: rewind.atTurn }).select("takenAt").lean<{ takenAt: Date }>()

    if (origin && atSnapshot) {
        const window = { after: atSnapshot.takenAt.getTime(), upTo: origin.takenAt.getTime() }
        const boxOf = (npcId: string) => (origin.npcs.find((npc) => String(npc._id) === npcId) as { opex?: { engramind?: { tokenBox?: unknown } | null } | null } | undefined)?.opex?.engramind?.tokenBox ?? null
        let failed: { id: string; ref: MaddoxMemoryChannelRef; error: string }[] = []
        try {
            await runPendingRepair(campaign, origin)
            const { engramind, channels } = await memoryChannels(campaignId, origin)
            if (channels) failed = (await engramind.purgeDiscardedMemories(channels, origin.memories, window)).failed
        } catch (error) {
            failed = origin.memories.map((item) => ({ ...item, error: error instanceof Error ? error.message : String(error) }))
        }
        for (const item of failed) {
            await MaddoxMemoryRepairModel.updateOne(
                { _id: `${String(campaignId)}:${item.id}` },
                { $set: { campaignId, memoryId: item.id, ref: item.ref, tokenBox: item.ref.kind === "opex-npc" ? boxOf(item.ref.npcId) : null, window: { after: new Date(window.after), upTo: new Date(window.upTo) }, lastError: item.error.slice(0, 500) }, $setOnInsert: { attempts: 0 } },
                { upsert: true },
            )
        }
        if (failed.length) log.warn({ campaignId: String(campaignId), pending: failed.length }, "[maddox] exclusão das memórias descartadas pendente: a rotina tenta de novo")
        await retireVanishedOpexNpcs(campaignId, origin)
    }

    await MaddoxCampaignMessageModel.deleteMany({ campaignId, "discardedBy.rewindId": rewind.id })
    const images = await MaddoxSceneImageModel.find({ campaignId, "discardedBy.rewindId": { $in: [rewind.id, `${rewind.id}:novas`] } }).select("key").lean<{ _id: Types.ObjectId; key: string | null }[]>()
    if (images.length) {
        await MaddoxSceneImageModel.updateMany({ _id: { $in: images.map((image) => image._id) } }, { $set: { slot: "discarded", url: null, key: null } }, { ...INCLUDE_DISCARDED, timestamps: false })
        void deleteImageFiles(images.map((image) => image.key).filter((key): key is string => Boolean(key)))
    }
    await MaddoxCampaignSnapshotModel.deleteMany({ campaignId, $or: [{ kind: "origin" }, { kind: "turn", turnNumber: { $gt: rewind.atTurn } }] })
    await MaddoxCampaignModel.updateOne({ _id: campaignId, "rewind.id": rewind.id }, { $set: { rewind: null } })
    await recordAudit({
        userId: rewind.byUserId,
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: String(campaignId),
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { rewind: "pending", turn: rewind.atTurn, origin: rewind.originTurn },
        depois: { rewind: "commit", turn: rewind.atTurn, discardedTurns: `${rewind.atTurn + 1}..${rewind.originTurn}` },
    })
    log.info({ campaignId: String(campaignId), at: rewind.atTurn, origin: rewind.originTurn }, "[maddox] turnos descartados perdidos de vez: o Maddox narrou de novo")
}

async function deleteImageFiles(keys: string[]): Promise<void> {
    if (!keys.length) return
    try {
        const { deleteFile } = await import("@/lib/storage/s3")
        for (const key of keys) await deleteFile(key).catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : String(error), key }, "[maddox] arquivo da imagem descartada não excluído"))
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : String(error) }, "[maddox] armazenamento indisponível para excluir imagens descartadas")
    }
}

/** NPCs Opex do trecho descartado (sumiram ou deixaram de ser Opex): o agente é aposentado. */
async function retireVanishedOpexNpcs(campaignId: Types.ObjectId, origin: IMaddoxCampaignSnapshot): Promise<void> {
    const { MaddoxNpcModel } = await import("../models")
    const before = origin.npcs.filter((npc) => (npc as { opex?: { active?: boolean } | null }).opex?.active).map((npc) => String(npc._id))
    if (!before.length) return
    const now = await MaddoxNpcModel.find({ _id: { $in: before.map((id) => new Types.ObjectId(id)) }, "opex.active": true }).select("_id").lean<{ _id: Types.ObjectId }[]>()
    const still = new Set(now.map((npc) => String(npc._id)))
    const gone = before.filter((id) => !still.has(id))
    if (!gone.length) return
    const { retireOpexNpcAgent } = await import("@/features/engramind/server/opex-npcs")
    for (const npcId of gone) void retireOpexNpcAgent({ campaignId: String(campaignId), npcId })
}

/**
 * Rotina (junto da sincronização das memórias, a cada 15 min): reparos de voltas que falharam e exclusões pendentes da
 * perda definitiva. Nunca lança; devolve quantas foram resolvidas.
 */
export async function processRewindRepairs(limit = 50): Promise<number> {
    await dbConnect()
    let resolved = 0
    const campaigns = await MaddoxCampaignModel.find({ memoryRepair: { $ne: null } }).limit(limit).lean<CampaignDoc[]>()
    for (const campaign of campaigns) {
        if (campaign.turn?.generating?.rewind) continue
        try {
            const origin = campaign.rewind ? await MaddoxCampaignSnapshotModel.findById(campaign.rewind.originSnapshotId).lean<IMaddoxCampaignSnapshot>() : null
            await runPendingRepair(campaign, origin)
            resolved++
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : String(error), campaignId: String(campaign._id) }, "[maddox] reparo das memórias da volta ainda pendente")
        }
    }
    const rows = await MaddoxMemoryRepairModel.find({}).sort({ updatedAt: 1 }).limit(limit).lean()
    if (!rows.length) return resolved
    const { purgeMemoryNow } = await import("@/features/engramind/server/campaign-rewind")
    for (const row of rows) {
        try {
            const done = await purgeMemoryNow(String(row.campaignId), row.ref, row.memoryId, row.tokenBox, { after: new Date(row.window.after).getTime(), upTo: new Date(row.window.upTo).getTime() })
            if (done) {
                await MaddoxMemoryRepairModel.deleteOne({ _id: row._id })
                resolved++
            }
        } catch (error) {
            await MaddoxMemoryRepairModel.updateOne({ _id: row._id }, { $inc: { attempts: 1 }, $set: { lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } })
        }
    }
    return resolved
}
