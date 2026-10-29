import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { loggerFor } from "@/lib/logger"
import { MADDOX_SESSION_AUDIT_ENTITY, type MaddoxSessionPurpose } from "../constants"
import { MaddoxCampaignModel } from "../models/maddox-campaign"
import { MaddoxOpencodeSessionModel, type IMaddoxOpencodeSession } from "../models/maddox-opencode-session"
import type { MaddoxOpencodeSettings } from "../schemas"
import type { MaddoxOpencodeSessionDto } from "../types"
import { loadMaddoxSettings } from "./settings"

/**
 * Sessões do OpenCode do Agente Maddox — SOMENTE servidor. Copiado da limpeza de sessões do
 * refinamento do Opex: a sessão é criada sob demanda e reaproveitada enquanto existir no OpenCode; ao
 * liberar, fica `pending-deletion` e a exclusão é tentada na hora e, se falhar (OpenCode fora do ar…),
 * retomada pela rotina `maddox-opencode-sessions-cleanup`. A exclusão é idempotente: uma sessão que já
 * não existe conta como excluída.
 *
 * Nesta entrega nada cria sessões ainda: o primeiro uso é o Maddox narrador (Maddox 4).
 */

const log = loggerFor({ module: "maddox", feature: "opencode-sessions" })
const DELETE_TIMEOUT_MS = 15_000

type SessionRow = Pick<IMaddoxOpencodeSession, "_id" | "campaignId" | "purpose" | "memberId" | "sessionId" | "directory" | "status" | "lastError" | "lastUsedAt" | "createdAt">

async function client(): Promise<OpencodeClient> {
    const { getOpencodeClient } = await import("@/lib/ai/opencode-client")
    return getOpencodeClient()
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Exclui uma sessão no OpenCode; `true` quando excluiu ou ela já não existia. */
async function removeSession(opencode: OpencodeClient, sessionId: string): Promise<{ ok: boolean; error: string | null }> {
    try {
        await opencode.session.remove({ sessionID: sessionId }, { signal: AbortSignal.timeout(DELETE_TIMEOUT_MS) })
        return { ok: true, error: null }
    } catch (error) {
        const { isOpencodeSessionNotFound } = await import("@/lib/ai/opencode-client")
        if (await isOpencodeSessionNotFound(error)) return { ok: true, error: null }
        log.warn({ err: errorText(error), sessionId }, "[maddox] falha ao excluir a sessão do OpenCode")
        return { ok: false, error: errorText(error) }
    }
}

/**
 * Finalidade efetivamente usada pela política: com "uma sessão por campanha", as entrevistas usam a
 * sessão do narrador.
 */
export function sessionPurposeFor(policy: Pick<MaddoxOpencodeSettings, "sessionScope">, purpose: MaddoxSessionPurpose): MaddoxSessionPurpose {
    return policy.sessionScope === "campaign" ? "narrator" : purpose
}

export interface EnsureMaddoxSessionInput {
    campaignId: string
    purpose: MaddoxSessionPurpose
    /** Entrevista de personagem: o membro entrevistado. */
    memberId?: string | null
    title: string
}

/** Sessão ativa da campanha/finalidade: a gravada (se ainda existir no OpenCode) ou uma nova. */
export async function ensureMaddoxSession(input: EnsureMaddoxSessionInput): Promise<string> {
    await dbConnect()
    const { settings } = await loadMaddoxSettings()
    const purpose = sessionPurposeFor(settings.opencode, input.purpose)
    const memberId = purpose === "character-interview" && input.memberId ? new Types.ObjectId(input.memberId) : null
    const filter = { campaignId: new Types.ObjectId(input.campaignId), purpose, memberId, status: "active" as const }
    const opencode = await client()

    const existing = await MaddoxOpencodeSessionModel.findOne(filter).lean<SessionRow>()
    if (existing) {
        const info = await opencode.session.get({ sessionID: existing.sessionId }).catch(() => null)
        if (info) {
            await MaddoxOpencodeSessionModel.updateOne({ _id: existing._id }, { $set: { lastUsedAt: new Date(), lastError: null } })
            return existing.sessionId
        }
        // Sumiu do OpenCode (excluída por fora): o registro some e uma nova é criada.
        await MaddoxOpencodeSessionModel.deleteOne({ _id: existing._id })
    }

    const directory = settings.opencode.directory || (await getOpencodeConnection()).directory || null
    const session = await opencode.session.create({
        title: input.title.slice(0, 120),
        ...(directory ? { location: { directory } } : {}),
        metadata: { app: "dndicas", kind: "maddox", purpose, campaignId: input.campaignId },
    })
    await MaddoxOpencodeSessionModel.create({ ...filter, sessionId: session.id, directory, lastUsedAt: new Date() })
    log.info({ campaignId: input.campaignId, purpose, sessionId: session.id }, "[maddox] sessão do OpenCode criada")
    return session.id
}

/** Marca como pendente e tenta excluir agora. `true` = excluída; `false` = ficou para a rotina. */
async function releaseRow(row: SessionRow): Promise<boolean> {
    await MaddoxOpencodeSessionModel.updateOne({ _id: row._id }, { $set: { status: "pending-deletion" } })
    let opencode: OpencodeClient
    try {
        opencode = await client()
    } catch (error) {
        await MaddoxOpencodeSessionModel.updateOne({ _id: row._id }, { $set: { lastError: errorText(error) } })
        return false
    }
    const result = await removeSession(opencode, row.sessionId)
    if (!result.ok) {
        await MaddoxOpencodeSessionModel.updateOne({ _id: row._id }, { $set: { lastError: result.error } })
        return false
    }
    await MaddoxOpencodeSessionModel.deleteOne({ _id: row._id })
    return true
}

/** Fim ou arquivamento da campanha: libera todas as sessões dela, se a política mandar excluir. */
export async function releaseCampaignSessions(campaignId: string): Promise<number> {
    await dbConnect()
    const { settings } = await loadMaddoxSettings()
    if (!settings.opencode.deleteOnCampaignEnd) return 0
    const rows = await MaddoxOpencodeSessionModel.find({ campaignId: new Types.ObjectId(campaignId), status: "active" }).lean<SessionRow[]>()
    let removed = 0
    for (const row of rows) if (await releaseRow(row)) removed++
    return removed
}

/** Painel da aba: exclui uma sessão (no OpenCode e o registro). Falha no OpenCode = fica pendente. */
export async function deleteMaddoxSession(id: string, actorId: string): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Sessão não encontrada", "MADDOX_SESSION_NOT_FOUND")
    await dbConnect()
    const row = await MaddoxOpencodeSessionModel.findById(id).lean<SessionRow>()
    if (!row) throw new DomainError(404, "Sessão não encontrada", "MADDOX_SESSION_NOT_FOUND")
    const deleted = await releaseRow(row)
    await recordAudit({
        userId: actorId,
        entidade: MADDOX_SESSION_AUDIT_ENTITY,
        entidadeId: row.sessionId,
        acao: AcaoAuditoria.EXCLUIR,
        antes: { campaignId: String(row.campaignId), purpose: row.purpose, sessionId: row.sessionId, status: row.status },
        depois: deleted ? undefined : { status: "pending-deletion" },
    })
    return { deleted }
}

export async function listMaddoxSessions(): Promise<MaddoxOpencodeSessionDto[]> {
    await dbConnect()
    const rows = await MaddoxOpencodeSessionModel.find().sort({ updatedAt: -1 }).limit(500).lean<SessionRow[]>()
    const campaignIds = [...new Set(rows.map((row) => String(row.campaignId)))]
    const campaigns = campaignIds.length ? await MaddoxCampaignModel.find({ _id: { $in: campaignIds } }).select("name").lean<Array<{ _id: unknown; name: string }>>() : []
    const byId = new Map(campaigns.map((campaign) => [String(campaign._id), campaign.name]))
    return rows.map((row) => ({
        id: String(row._id),
        campaignId: String(row.campaignId),
        campaignName: byId.get(String(row.campaignId)) ?? null,
        purpose: row.purpose,
        memberId: row.memberId ? String(row.memberId) : null,
        sessionId: row.sessionId,
        directory: row.directory ?? null,
        status: row.status,
        lastError: row.lastError ?? null,
        lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
        createdAt: new Date(row.createdAt).toISOString(),
    }))
}

let running = false

/**
 * Rotina `maddox-opencode-sessions-cleanup`: retoma as exclusões pendentes em lote, isolando a falha
 * de uma sessão das demais. Nunca lança; devolve o resumo para a tela de Crons.
 */
export async function processPendingMaddoxSessionDeletions(limit = 20): Promise<string> {
    if (running) return "Já em execução"
    running = true
    try {
        await dbConnect()
        const rows = await MaddoxOpencodeSessionModel.find({ status: "pending-deletion" }).sort({ updatedAt: 1 }).limit(limit).lean<SessionRow[]>()
        if (!rows.length) return "Nenhuma sessão pendente"
        let opencode: OpencodeClient
        try {
            opencode = await client()
        } catch (error) {
            log.warn({ err: errorText(error) }, "[maddox] OpenCode indisponível para retomar as exclusões pendentes")
            return `OpenCode indisponível: ${rows.length} sessão(ões) continuam pendentes`
        }
        let removed = 0
        for (const row of rows) {
            const result = await removeSession(opencode, row.sessionId)
            if (result.ok) {
                await MaddoxOpencodeSessionModel.deleteOne({ _id: row._id })
                removed++
            } else {
                await MaddoxOpencodeSessionModel.updateOne({ _id: row._id }, { $set: { lastError: result.error } })
            }
        }
        const left = rows.length - removed
        return left ? `${removed} sessão(ões) excluída(s) · ${left} continuam pendentes` : `${removed} sessão(ões) excluída(s)`
    } catch (error) {
        log.error({ err: errorText(error) }, "[maddox] falha ao retomar as exclusões pendentes")
        return "Falha ao retomar as exclusões pendentes"
    } finally {
        running = false
    }
}

