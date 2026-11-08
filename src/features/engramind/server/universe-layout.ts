import { DEFAULT_UNIVERSE_LAYOUT, parseUniverseLayout, sameUniverseLayout, type UniverseLayoutConfig } from "@engramind/client"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { UNIVERSE_LAYOUT_EVENT_TYPE, UNIVERSE_LAYOUT_LIVE_EVENT } from "../constants"
import type { UniverseLayoutDto } from "../types"
import { engramindBus } from "./live"
import { ENGRAMIND_STATE_ID, EngramindState, type IEngramindState } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf, publishEngramind } from "./shared"

/**
 * Layout dos universos de memórias (DND-34, SOMENTE servidor): a configuração única que a rede de
 * `/memorias` usa, importada/exportada em JSON no formato do Opex (`engramind-universe-layout`, versão 1).
 * Fica no estado da instalação (`engramind_state`); sem ela, vale o padrão da lib (anéis concêntricos).
 */

/** Configuração gravada, revalidada na leitura (gravação antiga inválida cai no padrão). */
async function readStored(): Promise<{ config: UniverseLayoutConfig; updatedAt: string | null } | null> {
    await dbConnect()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ universeLayout: 1 }).lean<Pick<IEngramindState, "universeLayout">>()
    const stored = state?.universeLayout
    if (!stored) return null
    const parsed = parseUniverseLayout(stored.config)
    if (!parsed.ok) {
        engramindLog.warn({ erros: parsed.errors.map((error) => error.path) }, "[engramind] layout do universo gravado é inválido; usando o padrão")
        return null
    }
    return { config: parsed.config, updatedAt: stored.updatedAt ? new Date(stored.updatedAt).toISOString() : null }
}

export async function getUniverseLayout(): Promise<UniverseLayoutDto> {
    const stored = await readStored()
    return stored ? { config: stored.config, isDefault: false, updatedAt: stored.updatedAt } : { config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null }
}

/** Para as páginas da rede: a configuração gravada ou `null` (padrão). Nunca lança: falha vira aviso e padrão. */
export async function readUniverseLayoutForPage(): Promise<UniverseLayoutConfig | null> {
    try {
        const layout = await getUniverseLayout()
        return layout.isDefault ? null : layout.config
    } catch (error) {
        engramindLog.warn({ err: messageOf(error) }, "[engramind] layout do universo não lido; usando o padrão")
        return null
    }
}

/** Avisa as telas abertas: a rede (`/memorias`, pelo SSE) e a aba Visualização (Pusher). Nunca lança. */
async function announce(): Promise<void> {
    try {
        await engramindBus().publish({ type: UNIVERSE_LAYOUT_LIVE_EVENT })
    } catch (error) {
        engramindLog.debug({ err: messageOf(error) }, "[engramind] aviso do layout não publicado no SSE")
    }
    await publishEngramind({ type: UNIVERSE_LAYOUT_EVENT_TYPE })
}

/** Grava a configuração (modo restritivo: campo desconhecido ou fora do intervalo é recusado sem gravar nada). */
export async function saveUniverseLayout(input: unknown, actorId: string): Promise<UniverseLayoutDto> {
    const parsed = parseUniverseLayout(input)
    if (!parsed.ok) throw new DomainError(400, `Configuração inválida: ${parsed.errors.map((error) => error.message).join("; ")}`, "UNIVERSE_LAYOUT_INVALID", parsed.errors)
    const before = await getUniverseLayout()
    const updatedAt = new Date()
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { universeLayout: { config: parsed.config, updatedAt } } }, { upsert: true })
    await auditEngramind(actorId, "universe-layout", AcaoAuditoria.ATUALIZAR, { ...parsed.config }, { ...before.config })
    engramindLog.info({ iguaisAoPadrao: sameUniverseLayout(parsed.config, DEFAULT_UNIVERSE_LAYOUT) }, "[engramind] layout do universo gravado")
    await announce()
    return { config: parsed.config, isDefault: false, updatedAt: updatedAt.toISOString() }
}

/** Volta ao padrão da lib (apaga a configuração gravada). */
export async function resetUniverseLayout(actorId: string): Promise<UniverseLayoutDto> {
    const before = await getUniverseLayout()
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { universeLayout: null } }, { upsert: true })
    await auditEngramind(actorId, "universe-layout", AcaoAuditoria.ATUALIZAR, { ...DEFAULT_UNIVERSE_LAYOUT }, { ...before.config })
    engramindLog.info("[engramind] layout do universo restaurado ao padrão")
    await announce()
    return { config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null }
}
