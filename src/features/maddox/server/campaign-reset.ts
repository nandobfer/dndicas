import { randomUUID } from "node:crypto"
import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { MADDOX_CAMPAIGN_AUDIT_ENTITY, MADDOX_RESET_OPEX_WAIT_MS, MADDOX_RESET_STATUSES, MADDOX_RESET_TEXTS, MADDOX_SHEET_RIGORS } from "../constants"
import {
    INCLUDE_DISCARDED,
    MaddoxCampaignMemberModel,
    MaddoxCampaignMessageModel,
    MaddoxCampaignModel,
    MaddoxCampaignSnapshotModel,
    MaddoxCharacterModel,
    MaddoxCombatModel,
    MaddoxCombatPrepModel,
    MaddoxMemoryRepairModel,
    MaddoxNpcModel,
    MaddoxSceneImageModel,
    type IMaddoxCampaign,
    type IMaddoxCampaignSnapshot,
    type IMaddoxCharacter,
    type IMaddoxSheetSnapshot,
    type MaddoxCampaignReset,
} from "../models"
import type { MaddoxCampaignDetailDto } from "../campaign-types"
import { changed, getCampaignDetail, loadMembership } from "./campaigns"
import { cancelCampaignJobs, enqueueMaddoxJob } from "./game-live"
import { waitForOpexKeys } from "./opex-runtime"

/**
 * Reiniciar a campanha (DND-50) — SOMENTE servidor; `userId` é o usuário EFETIVO.
 *
 * Só o dono, com a campanha já iniciada (ativa, pausada, encerrada ou arquivada). A campanha volta na hora ao lobby do fim
 * das entrevistas (o motor do jogo só anda com `status: "active"`, então nenhuma ação nova é aceita daí em diante), a
 * geração em andamento é interrompida (`cancelCampaignJobs`) e a limpeza roda na fila da campanha, depois dela:
 * mensagens, NPCs, combates, preparações, retratos de turno, reparos, gravações pendentes, imagens (viram registros sem
 * arquivo que seguem no teto diário), execuções da mesa dos Personagens Opex, condição e status dos personagens, fichas
 * (cópia do início ou ajuste pelo Maddox), sessão do narrador e memórias no Engramind.
 *
 * Idempotente: repetir com a campanha já no lobby refaz a limpeza que não terminou (`reset.status: "cleaning"`) ou só as
 * memórias que ficaram para trás (`reset.memories: "pending"`). Uma falha no Engramind não tira a campanha do lobby.
 */

const log = loggerFor({ module: "maddox", feature: "campaign-reset" })

type CampaignDoc = IMaddoxCampaign

const cleaning = globalThis as typeof globalThis & { __maddoxResetCleaning?: Map<string, Promise<void>> }
const runningCleanups = () => (cleaning.__maddoxResetCleaning ??= new Map())

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

const EMPTY_TURN = { number: 0, phase: "master", startedAt: null, eligibleMemberIds: [], declaredMemberIds: [], generating: null, failedAt: null, checkRound: 0, awaitingChecks: false, combatActor: null, pauseUntil: null, opexActor: null }
const EMPTY_STATE = { scene: "", location: "", situation: "", pendingDecision: "", updatedTurn: null, updatedAt: null, publicFields: [] }

/** O dono pode reiniciar agora (botão no cabeçalho). */
export const canResetCampaign = (campaign: Pick<CampaignDoc, "status" | "ownerId">, userId: string) => campaign.ownerId === userId && MADDOX_RESET_STATUSES.includes(campaign.status)

export async function resetCampaign(campaignId: string, userId: string): Promise<MaddoxCampaignDetailDto> {
    const { campaign } = await loadMembership(campaignId, userId)
    if (campaign.ownerId !== userId) throw new DomainError(403, MADDOX_RESET_TEXTS.forbidden, "FORBIDDEN")
    if (!MADDOX_RESET_STATUSES.includes(campaign.status)) {
        // Reinício repetido (ou retomado depois de uma falha no meio): termina o que faltou, sem erro.
        if (campaign.reset && (campaign.status === "lobby" || campaign.status === "interview")) {
            await finishPendingReset(campaign as CampaignDoc)
            return getCampaignDetail(campaignId, userId)
        }
        throw new DomainError(409, MADDOX_RESET_TEXTS.notStarted, "CAMPAIGN_NOT_STARTED")
    }

    // A origem das fichas é decidida antes de apagar qualquer coisa: o retrato do 1º turno vira a cópia do início.
    await adoptFirstTurnSheets(campaign._id)

    const reset: MaddoxCampaignReset = { id: randomUUID(), status: "cleaning", previousStatus: campaign.status, previousTurn: campaign.turn?.number ?? 0, byUserId: userId, startedAt: new Date(), completedAt: null, memories: "pending", npcTokenBoxes: {}, lastError: null }
    const flipped = await MaddoxCampaignModel.updateOne(
        { _id: campaign._id, status: { $in: [...MADDOX_RESET_STATUSES] } },
        { $set: { status: "lobby", reset, turn: EMPTY_TURN, rewind: null, memoryRepair: null, state: EMPTY_STATE, startedAt: null } },
    )
    if (flipped.modifiedCount === 0) {
        // Outro reinício venceu a corrida: termina o dele.
        const fresh = await MaddoxCampaignModel.findById(campaign._id).lean<CampaignDoc>()
        if (fresh?.reset) await finishPendingReset(fresh)
        return getCampaignDetail(campaignId, userId)
    }
    log.info({ campaignId, previousStatus: campaign.status, resetId: reset.id }, "[maddox] campanha reiniciada: limpando a partida")
    // A interrupção vem antes de a limpeza entrar na fila (o que entrou antes dela é descartado).
    const affected = cancelCampaignJobs(campaignId)
    if (affected) log.info({ campaignId, affected }, "[maddox] gerações da mesa interrompidas pelo reinício")
    const { cancelCampaignTimers } = await import("./tactical-combat")
    cancelCampaignTimers(campaignId)
    await runCleanup(campaign._id, reset.id)
    return getCampaignDetail(campaignId, userId)
}

/** Campanha já no lobby com reinício: limpeza que não terminou (falha ou processo reiniciado) ou memórias pendentes. */
async function finishPendingReset(campaign: CampaignDoc): Promise<void> {
    const reset = campaign.reset
    if (!reset) return
    if (reset.status === "cleaning") {
        await runCleanup(campaign._id, reset.id)
        return
    }
    if (reset.memories === "pending") await purgeMemories(campaign._id, reset.id)
}

/** Leitura do detalhe: a limpeza parada sem processo vivo (reinício do processo) é retomada em segundo plano. Nunca lança. */
export function recoverReset(campaign: Pick<CampaignDoc, "_id" | "reset" | "status">): void {
    if (campaign.reset?.status !== "cleaning" || runningCleanups().has(String(campaign._id))) return
    void runCleanup(campaign._id, campaign.reset.id).catch((error: unknown) => log.warn({ err: errorText(error), campaignId: String(campaign._id) }, "[maddox] retomada da limpeza do reinício falhou"))
}

/**
 * Roda a limpeza na fila da campanha (depois do job interrompido) e espera; uma limpeza por campanha neste processo. Antes,
 * espera (com teto) as execuções vivas dos Personagens Opex, que já não conseguem agir com a campanha fora de `active`.
 */
function runCleanup(campaignId: Types.ObjectId, resetId: string): Promise<void> {
    const key = String(campaignId)
    const current = runningCleanups().get(key)
    if (current) return current
    let failure: unknown = null
    const run = enqueueMaddoxJob(key, "reinício da campanha", async () => {
        try {
            await waitForOpexKeys([`table:${key}`, `combat:${key}`], MADDOX_RESET_OPEX_WAIT_MS)
            await cleanup(campaignId, resetId)
        } catch (error) {
            failure = error
        }
    })
        .then(() => {
            if (failure) {
                log.error({ err: errorText(failure), campaignId: key, resetId }, "[maddox] limpeza do reinício interrompida: pode ser repetida")
                throw failure
            }
        })
        .finally(() => runningCleanups().delete(key))
    runningCleanups().set(key, run)
    return run
}

/** Ficha guardada no início para cada `sheetId` (cópia `start`). */
async function startCopyOf(campaignId: Types.ObjectId): Promise<Map<string, IMaddoxSheetSnapshot>> {
    const copy = await MaddoxCampaignSnapshotModel.findOne({ campaignId, kind: "start" }).select("sheets").lean<Pick<IMaddoxCampaignSnapshot, "sheets">>()
    return new Map((copy?.sheets ?? []).map((entry) => [String(entry.sheetId), entry]))
}

/**
 * Campanhas iniciadas antes do DND-50: a ficha que não está na cópia do início, mas está no retrato do 1º turno, entra na
 * cópia agora (os retratos são apagados na limpeza; repetir o reinício encontra a mesma origem).
 */
async function adoptFirstTurnSheets(campaignId: Types.ObjectId): Promise<void> {
    const first = await MaddoxCampaignSnapshotModel.findOne({ campaignId, kind: "turn", turnNumber: 1 }).select("sheets").lean<Pick<IMaddoxCampaignSnapshot, "sheets">>()
    if (!first?.sheets?.length) return
    const copy = await startCopyOf(campaignId)
    const missing = first.sheets.filter((entry) => entry.sheet && !copy.has(String(entry.sheetId)))
    if (!missing.length) return
    await MaddoxCampaignSnapshotModel.updateOne(
        { campaignId, kind: "start" },
        { $push: { sheets: { $each: missing } }, $setOnInsert: { turnNumber: 0, rewindId: null, takenAt: new Date(), boundaryMessageId: null, excerpt: "", state: null, turn: null, npcs: [], characters: [], combats: [], combatIds: [], preps: [], messages: [], opexRuns: [], memories: [], pendingWrites: [], phase: null } },
        { upsert: true },
    )
}

async function cleanup(campaignId: Types.ObjectId, resetId: string): Promise<void> {
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findById(campaignId).lean<CampaignDoc>()
    const reset = campaign?.reset
    if (!campaign || !reset || reset.id !== resetId || reset.status !== "cleaning") return
    const id = String(campaignId)

    // Canais arquivados voltam antes de apagar os NPCs (o NPC Opex arquivado só é encontrado enquanto existe).
    if (reset.previousStatus === "archived") {
        const { syncCampaignChannelLifecycle } = await import("@/features/engramind/server/campaign-channels")
        await syncCampaignChannelLifecycle({ id, name: campaign.name, status: "lobby" }, reset.byUserId)
    }

    // Tokens dos NPCs Opex: guardados antes de apagar os NPCs (os canais deles ainda precisam ser limpos).
    const { npcTokenBoxesOf } = await import("@/features/engramind/server/campaign-rewind")
    const boxes = await npcTokenBoxesOf(id)
    if (boxes.size) {
        await MaddoxCampaignModel.updateOne({ _id: campaignId, "reset.id": resetId }, { $set: Object.fromEntries([...boxes].map(([npcId, box]) => [`reset.npcTokenBoxes.${npcId}`, box])) })
    }

    await MaddoxCampaignMessageModel.deleteMany({ campaignId }).setOptions(INCLUDE_DISCARDED)
    await MaddoxNpcModel.deleteMany({ campaignId })
    await MaddoxCombatModel.deleteMany({ campaignId })
    await MaddoxCombatPrepModel.deleteMany({ campaignId })
    await MaddoxMemoryRepairModel.deleteMany({ campaignId })
    await MaddoxCampaignSnapshotModel.deleteMany({ campaignId, kind: { $ne: "start" } })
    const { PendingWrite } = await import("@/features/engramind/server/pending-writes")
    await PendingWrite.deleteMany({ campaignId: id })
    await discardSceneImages(campaignId, resetId)
    await MaddoxCampaignMemberModel.updateMany({ campaignId, kind: "opex", "opex.run.stage": "table" }, { $set: { "opex.run": { status: "idle", stage: "table", error: null, updatedAt: new Date() } } })

    const sources = await restoreCharacters(campaign, resetId)

    const { rotateNarratorSession } = await import("./opencode-sessions")
    await rotateNarratorSession(id)

    const done = await MaddoxCampaignModel.updateOne({ _id: campaignId, "reset.id": resetId, "reset.status": "cleaning" }, { $set: { "reset.status": "done", "reset.completedAt": new Date() } })
    if (done.modifiedCount === 0) return
    await recordAudit({
        userId: reset.byUserId,
        entidade: MADDOX_CAMPAIGN_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { status: reset.previousStatus, turn: reset.previousTurn ?? null },
        depois: { reset: "lobby", status: "lobby", fichas: sources },
    })
    log.info({ campaignId: id, resetId, sheets: sources }, "[maddox] limpeza do reinício concluída")

    await purgeMemories(campaignId, resetId)
    await changed(campaignId)
    const { notifyJournalChanged } = await import("@/features/engramind/server/campaign-memories")
    await notifyJournalChanged(id).catch(() => undefined)
    const { scheduleSheetRestores } = await import("./sheet-restore")
    void scheduleSheetRestores(campaignId)
}

/** Imagens das cenas e retratos de NPC: viram registros sem arquivo (seguem no teto diário) e os arquivos são excluídos. */
async function discardSceneImages(campaignId: Types.ObjectId, resetId: string): Promise<void> {
    const images = await MaddoxSceneImageModel.find({ campaignId, slot: { $ne: "discarded" } }).setOptions(INCLUDE_DISCARDED).select("key").lean<{ _id: Types.ObjectId; key: string | null }[]>()
    if (!images.length) return
    await MaddoxSceneImageModel.updateMany({ _id: { $in: images.map((image) => image._id) } }, { $set: { slot: "discarded", url: null, key: null, discardedBy: { rewindId: `reset:${resetId}`, at: new Date() } } }, { ...INCLUDE_DISCARDED, timestamps: false })
    const keys = images.map((image) => image.key).filter((key): key is string => Boolean(key))
    if (keys.length) void deleteImageFiles(keys)
}

async function deleteImageFiles(keys: string[]): Promise<void> {
    try {
        const { deleteFile } = await import("@/lib/storage/s3")
        for (const key of keys) await deleteFile(key).catch((error: unknown) => log.warn({ err: errorText(error), key }, "[maddox] arquivo da imagem apagada no reinício não excluído"))
    } catch (error) {
        log.warn({ err: errorText(error) }, "[maddox] armazenamento indisponível para excluir as imagens do reinício")
    }
}

type SheetSource = "copia" | "maddox" | "sem-ficha"

/**
 * Personagens: condição vazia e status ativo; fichas pela cópia do início (com o retrato atual do personagem) ou, sem
 * cópia, marcadas para o ajuste pelo Maddox. Devolve a origem de cada ficha (auditoria).
 */
async function restoreCharacters(campaign: CampaignDoc, resetId: string): Promise<Record<string, SheetSource>> {
    const campaignId = campaign._id
    await MaddoxCharacterModel.updateMany({ campaignId }, { $set: { currentState: "", currentStatePublic: false, status: "active" } })
    const sources: Record<string, SheetSource> = {}
    if (!MADDOX_SHEET_RIGORS.includes(campaign.rigor)) return sources
    const characters = await MaddoxCharacterModel.find({ campaignId, "interview.status": "done" }).lean<IMaddoxCharacter[]>()
    const copy = await startCopyOf(campaignId)
    const fromCopy: IMaddoxSheetSnapshot[] = []
    const now = new Date()
    for (const character of characters) {
        const label = character.name || String(character._id)
        if (!character.sheetId) {
            sources[label] = "sem-ficha"
            continue
        }
        const entry = copy.get(String(character.sheetId))
        if (entry?.sheet) {
            // O retrato do personagem pode ter sido gerado de novo depois da cópia: a ficha fica com o atual.
            fromCopy.push(character.portraitUrl ? { ...entry, sheet: { ...entry.sheet, photo: character.portraitUrl } } : entry)
            sources[label] = "copia"
            continue
        }
        sources[label] = "maddox"
        if (character.sheetRestore?.resetId === resetId) continue
        await MaddoxCharacterModel.updateOne({ _id: character._id }, { $set: { sheetRestore: { resetId, status: "pending", error: null, startedAt: now, updatedAt: now } } })
    }
    const { restoreSheets } = await import("./turn-snapshots")
    await restoreSheets(fromCopy)
    return sources
}

/**
 * Memórias da partida anterior no Engramind. Falha (rede fora) fica registrada e é refeita no próximo reinício, na rotina
 * de sincronização e em "Iniciar campanha". Depois de limpos, os agentes dos NPCs Opex apagados são aposentados. Nunca lança.
 */
async function purgeMemories(campaignId: Types.ObjectId, resetId: string): Promise<boolean> {
    const campaign = await MaddoxCampaignModel.findById(campaignId).select("reset").lean<Pick<CampaignDoc, "reset">>()
    const reset = campaign?.reset
    if (!reset || reset.id !== resetId) return true
    if (reset.memories === "done") return true
    const boxes = new Map(Object.entries(reset.npcTokenBoxes ?? {}))
    try {
        const { purgeCampaignMemories } = await import("@/features/engramind/server/campaign-rewind")
        const deleted = await purgeCampaignMemories(String(campaignId), boxes)
        await MaddoxCampaignModel.updateOne({ _id: campaignId, "reset.id": resetId }, { $set: { "reset.memories": "done", "reset.npcTokenBoxes": {}, "reset.lastError": null } })
        if (deleted !== null) log.info({ campaignId: String(campaignId), deleted }, "[maddox] memórias da partida apagadas no reinício")
        if (boxes.size) {
            const { retireOpexNpcAgent } = await import("@/features/engramind/server/opex-npcs")
            for (const npcId of boxes.keys()) void retireOpexNpcAgent({ campaignId: String(campaignId), npcId }).catch(() => undefined)
        }
        return true
    } catch (error) {
        const reason = error instanceof Error && error.cause !== undefined ? errorText(error.cause) : errorText(error)
        await MaddoxCampaignModel.updateOne({ _id: campaignId, "reset.id": resetId }, { $set: { "reset.lastError": reason.slice(0, 500) } }).catch(() => undefined)
        log.warn({ err: reason, campaignId: String(campaignId) }, "[maddox] memórias da partida ainda não apagadas no reinício: nova tentativa depois")
        return false
    }
}

/**
 * "Iniciar campanha" depois de um reinício: a limpeza precisa ter terminado e as memórias da partida anterior precisam ter
 * sido apagadas (tenta de novo agora). Lança 409 com o motivo.
 */
export async function assertResetSettled(campaign: Pick<CampaignDoc, "_id" | "reset">): Promise<void> {
    const reset = campaign.reset
    if (!reset) return
    if (reset.status === "cleaning") throw new DomainError(409, MADDOX_RESET_TEXTS.inProgress, "RESET_IN_PROGRESS")
    if (reset.memories === "pending" && !(await purgeMemories(campaign._id, reset.id))) throw new DomainError(409, MADDOX_RESET_TEXTS.memoriesPending, "ENGRAMIND_UNAVAILABLE")
}

/** Rotina (junto da sincronização das memórias): memórias dos reinícios que ficaram para trás. Nunca lança. */
export async function processPendingResetPurges(limit = 20): Promise<number> {
    await dbConnect()
    const campaigns = await MaddoxCampaignModel.find({ "reset.status": "done", "reset.memories": "pending" }).select("reset").limit(limit).lean<Pick<CampaignDoc, "_id" | "reset">[]>()
    let resolved = 0
    for (const campaign of campaigns) if (campaign.reset && (await purgeMemories(campaign._id, campaign.reset.id))) resolved++
    return resolved
}

/** Testes: espera as limpezas em andamento. */
export async function waitForCampaignResets(): Promise<void> {
    for (let round = 0; round < 20 && runningCleanups().size > 0; round++) await Promise.allSettled([...runningCleanups().values()])
}
