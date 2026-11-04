import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import type { OpencodeClient } from "@/lib/ai/opencode-client"
import { loggerFor } from "@/lib/logger"
import { MADDOX_SESSION_AUDIT_ENTITY, type MaddoxSessionPurpose } from "../constants"
import { MaddoxCampaignModel } from "../models/maddox-campaign"
import { MaddoxOpencodeSessionModel, type IMaddoxOpencodeSession } from "../models/maddox-opencode-session"
import type { MaddoxOpencodeSessionDto } from "../types"
import { loadMaddoxSettings } from "./settings"

/**
 * Sessões do OpenCode do Agente Maddox — SOMENTE servidor. Copiado da limpeza de sessões do
 * refinamento do Opex: a sessão é criada sob demanda e reaproveitada enquanto existir no OpenCode; ao
 * liberar, fica `pending-deletion` e a exclusão é tentada na hora e, se falhar (OpenCode fora do ar…),
 * retomada pela rotina `maddox-opencode-sessions-cleanup`. A exclusão é idempotente: uma sessão que já
 * não existe conta como excluída.
 *
 * As sessões nunca são compartilhadas: o narrador tem uma por campanha (recriada se sumir), a entrevista de cenário
 * uma por campanha e a de personagem uma por membro; as das entrevistas são excluídas ao concluir. O modelo, a
 * variante e o agente são estado da sessão no OpenCode 2: definidos ao criar e realinhados a cada turno.
 */

const log = loggerFor({ module: "maddox", feature: "opencode-sessions" })
const DELETE_TIMEOUT_MS = 15_000

type SessionRow = Pick<IMaddoxOpencodeSession, "_id" | "campaignId" | "purpose" | "memberId" | "sessionId" | "directory" | "status" | "lastError" | "lastUsedAt" | "createdAt">

/** Módulo do cliente carregado sob demanda, uma vez (chamadas concorrentes compartilham o mesmo `import()`). */
let clientModule: Promise<typeof import("@/lib/ai/opencode-client")> | null = null
const opencodeClientModule = () => (clientModule ??= import("@/lib/ai/opencode-client"))

async function client(): Promise<OpencodeClient> {
    const { getOpencodeClient } = await opencodeClientModule()
    return getOpencodeClient()
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Exclui uma sessão no OpenCode; `true` quando excluiu ou ela já não existia. */
async function removeSession(opencode: OpencodeClient, sessionId: string): Promise<{ ok: boolean; error: string | null }> {
    try {
        await opencode.session.remove({ sessionID: sessionId }, { signal: AbortSignal.timeout(DELETE_TIMEOUT_MS) })
        return { ok: true, error: null }
    } catch (error) {
        const { isOpencodeSessionNotFound } = await opencodeClientModule()
        if (await isOpencodeSessionNotFound(error)) return { ok: true, error: null }
        log.warn({ err: errorText(error), sessionId }, "[maddox] falha ao excluir a sessão do OpenCode")
        return { ok: false, error: errorText(error) }
    }
}

type ModelRef = { providerID: string; id: string; variant?: string }

/**
 * Referência do modelo para a sessão: `provedor/modelo` dividido na primeira `/` (ex.: `opencode-go/deepseek-v4.1-flash`).
 * Sem provedor (ou vazio), `null`: a sessão fica com o padrão do servidor.
 */
export function opencodeModelRef(model: string | null | undefined, variant?: string | null): ModelRef | null {
    const value = model?.trim() ?? ""
    const slash = value.indexOf("/")
    if (slash <= 0 || slash === value.length - 1) return null
    return { providerID: value.slice(0, slash), id: value.slice(slash + 1), ...(variant ? { variant } : {}) }
}

const sameModel = (a: ModelRef | null | undefined, b: ModelRef) => Boolean(a) && a!.providerID === b.providerID && a!.id === b.id && (a!.variant ?? null) === (b.variant ?? null)

type SessionState = { model?: ModelRef | null; agent?: string | null }

/**
 * Realinha o modelo e o agente de uma sessão reaproveitada com a configuração (o OpenCode guarda os dois na sessão e
 * o provider da AI SDK não os reenvia no modo `existing`). Agente vazio na configuração não troca o da sessão.
 */
async function alignSession(opencode: OpencodeClient, sessionId: string, info: SessionState, input: EnsureMaddoxSessionInput): Promise<void> {
    const model = opencodeModelRef(input.model, input.variant)
    try {
        if (model && !sameModel(info.model, model)) {
            await opencode.session.switchModel({ sessionID: sessionId, model })
            log.info({ sessionId, from: info.model ? `${info.model.providerID}/${info.model.id}` : null, to: `${model.providerID}/${model.id}` }, "[maddox] modelo da sessão do OpenCode trocado")
        }
        if (input.agent && info.agent !== input.agent) {
            await opencode.session.switchAgent({ sessionID: sessionId, agent: input.agent })
            log.info({ sessionId, from: info.agent ?? null, to: input.agent }, "[maddox] agente da sessão do OpenCode trocado")
        }
    } catch (error) {
        log.warn({ err: errorText(error), sessionId }, "[maddox] falha ao ajustar o modelo ou o agente da sessão do OpenCode")
        throw new DomainError(502, `Não foi possível ajustar a sessão do OpenCode para o modelo ${input.model ?? "configurado"}${input.agent ? ` e o agente ${input.agent}` : ""}: ${errorText(error)}`, "OPENCODE_SESSION_UNAVAILABLE")
    }
}

/** Sessão vencedora de uma corrida: confere o estado dela e realinha como uma reaproveitada. */
async function alignWinner(opencode: OpencodeClient, sessionId: string, input: EnsureMaddoxSessionInput): Promise<string> {
    const info = await opencode.session.get({ sessionID: sessionId }).catch(() => null)
    if (info) await alignSession(opencode, sessionId, info, input)
    return sessionId
}

export interface EnsureMaddoxSessionInput {
    campaignId: string
    purpose: MaddoxSessionPurpose
    /** Entrevista de personagem: o membro entrevistado. */
    memberId?: string | null
    title: string
    /** Agente do OpenCode da sessão (no OpenCode 2 o agente é estado da sessão). */
    agent?: string | null
    /** Modelo configurado (`provedor/modelo`) e variante: também estado da sessão. */
    model?: string | null
    variant?: string | null
}

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000

/** Melhor esforço: exclui a sessão recém-criada que perdeu a corrida (nunca lança). */
async function discardCreated(opencode: OpencodeClient, sessionId: string): Promise<void> {
    const result = await removeSession(opencode, sessionId).catch(() => ({ ok: false }))
    if (!result.ok) log.warn({ sessionId }, "[maddox] sessão duplicada criada numa corrida não pôde ser excluída")
}

/**
 * Sessão ativa da campanha/finalidade: a gravada (se ainda existir no OpenCode) ou uma nova. Só uma
 * sessão comprovadamente inexistente no OpenCode é substituída; qualquer outra falha (timeout, 401,
 * rede) é propagada sem tocar no registro. A nova sessão é criada antes de trocar o registro, e o
 * índice único parcial (uma ativa por campanha/finalidade/membro) resolve chamadas concorrentes.
 */
export async function ensureMaddoxSession(input: EnsureMaddoxSessionInput): Promise<string> {
    await dbConnect()
    const { settings } = await loadMaddoxSettings()
    const purpose = input.purpose
    const memberId = purpose === "character-interview" && input.memberId ? new Types.ObjectId(input.memberId) : null
    const filter = { campaignId: new Types.ObjectId(input.campaignId), purpose, memberId, status: "active" as const }
    const opencode = await client()

    const existing = await MaddoxOpencodeSessionModel.findOne(filter).lean<SessionRow>()
    if (existing) {
        try {
            const info = await opencode.session.get({ sessionID: existing.sessionId })
            await alignSession(opencode, existing.sessionId, info, input)
            await MaddoxOpencodeSessionModel.updateOne({ _id: existing._id }, { $set: { lastUsedAt: new Date(), lastError: null } })
            return existing.sessionId
        } catch (error) {
            if (error instanceof DomainError) throw error
            const { isOpencodeSessionNotFound } = await opencodeClientModule()
            if (!(await isOpencodeSessionNotFound(error))) {
                log.warn({ err: errorText(error), sessionId: existing.sessionId }, "[maddox] falha ao consultar a sessão do OpenCode")
                throw new DomainError(502, `Não foi possível consultar a sessão do OpenCode: ${errorText(error)}`, "OPENCODE_SESSION_UNAVAILABLE")
            }
            // Sumiu do OpenCode (excluída por fora): o registro é reaproveitado para a nova sessão.
        }
    }

    const directory = settings.opencode.directory || (await getOpencodeConnection()).directory || null
    const model = opencodeModelRef(input.model, input.variant)
    if (input.model && !model) log.warn({ model: input.model }, "[maddox] modelo sem provedor: a sessão do OpenCode fica com o modelo padrão do servidor")
    const session = await opencode.session.create({
        title: input.title.slice(0, 120),
        ...(input.agent ? { agent: input.agent } : {}),
        ...(model ? { model } : {}),
        ...(directory ? { location: { directory } } : {}),
        metadata: { app: "dndicas", kind: "maddox", purpose, campaignId: input.campaignId },
    })

    if (existing) {
        // Troca condicional: se outra chamada já trocou a sessão sumida, vale a dela.
        const swapped = await MaddoxOpencodeSessionModel.updateOne(
            { _id: existing._id, sessionId: existing.sessionId, status: "active" },
            { $set: { sessionId: session.id, directory, lastUsedAt: new Date(), lastError: null } },
        )
        if (swapped.modifiedCount === 0) {
            await discardCreated(opencode, session.id)
            const winner = await MaddoxOpencodeSessionModel.findOne(filter).lean<SessionRow>()
            if (!winner) throw new DomainError(409, "A sessão do OpenCode da campanha mudou durante a operação. Tente novamente.", "OPENCODE_SESSION_CONFLICT")
            return alignWinner(opencode, winner.sessionId, input)
        }
    } else {
        try {
            await MaddoxOpencodeSessionModel.create({ ...filter, sessionId: session.id, directory, lastUsedAt: new Date() })
        } catch (error) {
            if (!isDuplicateKey(error)) throw error
            // Outra chamada criou a sessão ativa primeiro: descarta a nossa e usa a dela.
            await discardCreated(opencode, session.id)
            const winner = await MaddoxOpencodeSessionModel.findOne(filter).lean<SessionRow>()
            if (!winner) throw error
            return alignWinner(opencode, winner.sessionId, input)
        }
    }
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

/** Fim de uma entrevista: libera a sessão própria dela (a do narrador nunca é tocada). Nunca lança. */
export async function releaseInterviewSession(campaignId: string, purpose: Exclude<MaddoxSessionPurpose, "narrator">, memberId: string | null): Promise<void> {
    try {
        await dbConnect()
        const rows = await MaddoxOpencodeSessionModel.find({
            campaignId: new Types.ObjectId(campaignId),
            purpose,
            memberId: purpose === "character-interview" && memberId ? new Types.ObjectId(memberId) : null,
            status: "active",
        }).lean<SessionRow[]>()
        for (const row of rows) await releaseRow(row)
    } catch (error) {
        log.warn({ err: errorText(error), campaignId, purpose }, "[maddox] falha ao liberar a sessão da entrevista")
    }
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

/** Campanhas encerradas: terminadas, arquivadas ou que já não existem. */
const ENDED_CAMPAIGN_STATUSES: readonly string[] = ["ended", "archived"]

/**
 * "Excluir ao encerrar a campanha": põe na fila de exclusão as sessões ativas de campanhas terminadas, arquivadas ou
 * excluídas. Devolve quantas entraram na fila (0 com a política desligada).
 */
async function queueEndedCampaignSessions(): Promise<number> {
    const { settings } = await loadMaddoxSettings()
    if (!settings.opencode.deleteOnCampaignEnd) return 0
    const active = await MaddoxOpencodeSessionModel.find({ status: "active" }).lean<SessionRow[]>()
    if (!active.length) return 0
    const ids = [...new Set(active.map((row) => String(row.campaignId)))]
    const campaigns = await MaddoxCampaignModel.find({ _id: { $in: ids } }).select("status").lean<Array<{ _id: unknown; status?: string }>>()
    const statusById = new Map(campaigns.map((campaign) => [String(campaign._id), campaign.status ?? null]))
    const ended = active.filter((row) => {
        const id = String(row.campaignId)
        return !statusById.has(id) || ENDED_CAMPAIGN_STATUSES.includes(statusById.get(id) ?? "")
    })
    for (const row of ended) await MaddoxOpencodeSessionModel.updateOne({ _id: row._id, status: "active" }, { $set: { status: "pending-deletion" } })
    if (ended.length) log.info({ count: ended.length }, "[maddox] sessões de campanhas encerradas na fila de exclusão")
    return ended.length
}

/**
 * Rotina `maddox-opencode-sessions-cleanup`: põe na fila as sessões das campanhas encerradas (se a política mandar) e
 * retoma as exclusões pendentes em lote, isolando a falha de uma sessão das demais. Nunca lança; devolve o resumo
 * para a tela de Crons.
 */
export async function processPendingMaddoxSessionDeletions(limit = 20): Promise<string> {
    if (running) return "Já em execução"
    running = true
    try {
        await dbConnect()
        const queued = await queueEndedCampaignSessions()
        const prefix = queued ? `${queued} sessão(ões) de campanhas encerradas na fila · ` : ""
        const rows = await MaddoxOpencodeSessionModel.find({ status: "pending-deletion" }).sort({ updatedAt: 1 }).limit(limit).lean<SessionRow[]>()
        if (!rows.length) return "Nenhuma sessão pendente"
        let opencode: OpencodeClient
        try {
            opencode = await client()
        } catch (error) {
            log.warn({ err: errorText(error) }, "[maddox] OpenCode indisponível para retomar as exclusões pendentes")
            return `${prefix}OpenCode indisponível: ${rows.length} sessão(ões) continuam pendentes`
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
        return prefix + (left ? `${removed} sessão(ões) excluída(s) · ${left} continuam pendentes` : `${removed} sessão(ões) excluída(s)`)
    } catch (error) {
        log.error({ err: errorText(error) }, "[maddox] falha ao retomar as exclusões pendentes")
        return "Falha ao retomar as exclusões pendentes"
    } finally {
        running = false
    }
}

