import { DomainError } from "@/lib/api/route"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import { loggerFor } from "@/lib/logger"
import { MADDOX_MCP_PATH, MADDOX_MCP_SERVER_NAME } from "../constants"
import type { MaddoxSettings } from "../schemas"
import type { MaddoxMcpStatusDto } from "../types"

/**
 * Registro do MCP do Maddox no servidor OpenCode (Maddox 4) — SOMENTE servidor. Com o OpenCode como narrador, as
 * ferramentas de persistência chegam ao agente pelo MCP `dndicas-maddox` (`/api/maddox/mcp`). Antes de narrar, o
 * servidor confere (e, se faltar, adiciona e conecta) o MCP no diretório das sessões; sem ele a narração não começa
 * (409 `MADDOX_UNAVAILABLE`). Um resultado positivo fica em cache por um minuto.
 */

const log = loggerFor({ module: "maddox", feature: "opencode-mcp" })
const CACHE_MS = 60_000

const globalCache = globalThis as unknown as { __maddoxMcpReady?: { key: string; at: number } | null }

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "")

/** URL que o OpenCode chama: a configurada na aba ou a do app + `/api/maddox/mcp`; `null` sem nenhuma das duas. */
export function maddoxMcpUrl(settings: Pick<MaddoxSettings, "opencode">): string | null {
    const configured = settings.opencode.mcpUrl?.trim()
    if (configured) return configured
    const base = appUrl()
    return base ? `${base}${MADDOX_MCP_PATH}` : null
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function sessionDirectory(settings: Pick<MaddoxSettings, "opencode">): Promise<string | null> {
    return settings.opencode.directory || (await getOpencodeConnection()).directory || null
}

async function inspect(settings: Pick<MaddoxSettings, "opencode">, register: boolean): Promise<MaddoxMcpStatusDto> {
    const url = maddoxMcpUrl(settings)
    if (!url) return { url: null, server: MADDOX_MCP_SERVER_NAME, status: "missing", error: "Defina a URL pública do app (NEXT_PUBLIC_APP_URL) ou a URL do MCP do Maddox na seção OpenCode." }
    const { getOpencodeClient } = await import("@/lib/ai/opencode-client")
    const opencode = await getOpencodeClient()
    const directory = await sessionDirectory(settings)
    const location = directory ? { directory } : undefined
    const find = async () => (await opencode.mcp.list({ ...(location ? { location } : {}) })).data.find((server) => server.name === MADDOX_MCP_SERVER_NAME) ?? null
    let server = await find()
    if (!server && register) {
        await opencode.mcp.add({ server: MADDOX_MCP_SERVER_NAME, ...(location ? { location } : {}), config: { type: "remote", url, oauth: false } })
        log.info({ url, directory }, "[maddox] MCP do Maddox adicionado ao OpenCode")
        server = await find()
    }
    if (server && server.status.status !== "connected" && server.status.status !== "disabled" && register) {
        await opencode.mcp.connect({ server: MADDOX_MCP_SERVER_NAME, ...(location ? { location } : {}) }).catch((error: unknown) => log.warn({ err: errorText(error) }, "[maddox] falha ao conectar o MCP do Maddox"))
        server = await find()
    }
    if (!server) return { url, server: MADDOX_MCP_SERVER_NAME, status: "missing", error: null }
    const status = server.status
    return { url, server: MADDOX_MCP_SERVER_NAME, status: status.status, error: "error" in status ? status.error : null }
}

/** Situação do MCP do Maddox no OpenCode (card da aba); `register` adiciona e conecta se faltar. Nunca lança. */
export async function maddoxMcpStatus(settings: Pick<MaddoxSettings, "opencode">, register = false): Promise<MaddoxMcpStatusDto> {
    try {
        return await inspect(settings, register)
    } catch (error) {
        log.warn({ err: errorText(error) }, "[maddox] falha ao consultar o MCP do Maddox no OpenCode")
        return { url: maddoxMcpUrl(settings), server: MADDOX_MCP_SERVER_NAME, status: "unknown", error: errorText(error) }
    }
}

/** Antes de narrar com o OpenCode: o MCP precisa estar conectado (adiciona e conecta se faltar). */
export async function ensureMaddoxMcp(settings: Pick<MaddoxSettings, "opencode">): Promise<void> {
    const key = `${maddoxMcpUrl(settings)}|${settings.opencode.directory ?? ""}`
    const cached = globalCache.__maddoxMcpReady
    if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) return
    const status = await maddoxMcpStatus(settings, true)
    if (status.status !== "connected") {
        globalCache.__maddoxMcpReady = null
        const reason = status.error ? ` (${status.error})` : ""
        throw new DomainError(409, `O MCP do Maddox não está conectado no OpenCode${reason}. Confira a seção OpenCode da aba "Agente Maddox".`, "MADDOX_UNAVAILABLE")
    }
    globalCache.__maddoxMcpReady = { key, at: Date.now() }
}
