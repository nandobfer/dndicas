import { DomainError } from "@/lib/api/route"
import { getOpencodeConnection } from "@/lib/ai/opencode"
import { loggerFor } from "@/lib/logger"
import { MADDOX_MCP_PATH, MADDOX_MCP_SERVER_NAME } from "../constants"
import type { MaddoxSettings } from "../schemas"
import type { MaddoxMcpStatusDto } from "../types"

/**
 * Registro do MCP do Maddox no servidor OpenCode (Maddox 4) — SOMENTE servidor. Com o OpenCode como narrador, as
 * ferramentas de persistência chegam ao agente pelo MCP `dndicas-maddox` (`/api/maddox/mcp`). Antes de narrar, o
 * servidor confere (e, se faltar ou se a URL mudou, adiciona/troca e conecta) o MCP no diretório das sessões; sem ele a narração não começa
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

type OpencodeClient = Awaited<ReturnType<typeof import("@/lib/ai/opencode-client").getOpencodeClient>>
type Location = { directory: string } | undefined

const registeredUrls = globalThis as unknown as { __maddoxMcpRegisteredUrls?: Map<string, string> }
const registeredByUs = (registeredUrls.__maddoxMcpRegisteredUrls ??= new Map())

/**
 * URL com que o MCP do Maddox está registrado no OpenCode: a dos documentos de configuração (`config.get`, quando o
 * servidor está no `opencode.json`) ou a que este processo registrou. `null` = o OpenCode não informa.
 */
async function registeredUrlOf(opencode: OpencodeClient, location: Location): Promise<string | null> {
    try {
        const entries = await opencode.config.get(location ? { location } : undefined)
        for (const entry of entries) {
            if (entry.type !== "document") continue
            const server = entry.info?.mcp?.servers?.[MADDOX_MCP_SERVER_NAME]
            if (server && server.type === "remote" && server.url) return server.url.trim()
        }
    } catch (error) {
        log.warn({ err: errorText(error) }, "[maddox] não foi possível ler a configuração do OpenCode")
    }
    return registeredByUs.get(location?.directory ?? "") ?? null
}

/**
 * `register`: `false` só consulta; `"ensure"` (antes de narrar) adiciona se faltar e troca se a URL registrada for outra;
 * `"explicit"` (botão do card) também refaz o registro quando o OpenCode não informa a URL registrada.
 */
type RegisterMode = false | "ensure" | "explicit"

async function inspect(settings: Pick<MaddoxSettings, "opencode">, register: RegisterMode): Promise<MaddoxMcpStatusDto> {
    const url = maddoxMcpUrl(settings)
    if (!url) return { url: null, registeredUrl: null, server: MADDOX_MCP_SERVER_NAME, status: "missing", error: "Defina a URL pública do app (NEXT_PUBLIC_APP_URL) ou a URL do MCP do Maddox na seção OpenCode." }
    const { getOpencodeClient } = await import("@/lib/ai/opencode-client")
    const opencode = await getOpencodeClient()
    const directory = await sessionDirectory(settings)
    const location: Location = directory ? { directory } : undefined
    const at = location ? { location } : {}
    const find = async () => (await opencode.mcp.list(at)).data.find((server) => server.name === MADDOX_MCP_SERVER_NAME) ?? null
    const add = async () => {
        await opencode.mcp.add({ server: MADDOX_MCP_SERVER_NAME, ...at, config: { type: "remote", url, oauth: false } })
        registeredByUs.set(directory ?? "", url)
        log.info({ url, directory }, "[maddox] MCP do Maddox adicionado ao OpenCode")
    }
    let server = await find()
    let registeredUrl = server ? await registeredUrlOf(opencode, location) : null
    // A URL mudou na aba: o registro antigo chamaria o endereço velho. Ao registrar, troca; ao só consultar, avisa.
    const stale = server && (registeredUrl ? registeredUrl !== url : register === "explicit")
    if (server && stale) {
        if (!register) return { url, registeredUrl, server: MADDOX_MCP_SERVER_NAME, status: "outdated", error: `O OpenCode ainda chama ${registeredUrl}. Clique em "Registrar no OpenCode" para trocar.` }
        await opencode.mcp.remove({ server: MADDOX_MCP_SERVER_NAME, ...at })
        log.info({ from: registeredUrl, to: url, directory }, "[maddox] registro do MCP do Maddox trocado no OpenCode")
        await add()
        server = await find()
        registeredUrl = url
    }
    if (!server && register) {
        await add()
        server = await find()
        registeredUrl = url
    }
    if (server && server.status.status !== "connected" && server.status.status !== "disabled" && register) {
        await opencode.mcp.connect({ server: MADDOX_MCP_SERVER_NAME, ...at }).catch((error: unknown) => log.warn({ err: errorText(error) }, "[maddox] falha ao conectar o MCP do Maddox"))
        server = await find()
    }
    if (!server) return { url, registeredUrl: null, server: MADDOX_MCP_SERVER_NAME, status: "missing", error: null }
    const status = server.status
    return { url, registeredUrl, server: MADDOX_MCP_SERVER_NAME, status: status.status, error: "error" in status ? status.error : null }
}

/** Situação do MCP do Maddox no OpenCode (card da aba); `register` adiciona/troca e conecta (ver `RegisterMode`). Nunca lança. */
export async function maddoxMcpStatus(settings: Pick<MaddoxSettings, "opencode">, register: RegisterMode = false): Promise<MaddoxMcpStatusDto> {
    try {
        return await inspect(settings, register)
    } catch (error) {
        log.warn({ err: errorText(error) }, "[maddox] falha ao consultar o MCP do Maddox no OpenCode")
        return { url: maddoxMcpUrl(settings), registeredUrl: null, server: MADDOX_MCP_SERVER_NAME, status: "unknown", error: errorText(error) }
    }
}

/** Antes de narrar com o OpenCode: o MCP precisa estar conectado (adiciona e conecta se faltar). */
export async function ensureMaddoxMcp(settings: Pick<MaddoxSettings, "opencode">): Promise<void> {
    const key = `${maddoxMcpUrl(settings)}|${settings.opencode.directory ?? ""}`
    const cached = globalCache.__maddoxMcpReady
    if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) return
    const status = await maddoxMcpStatus(settings, "ensure")
    if (status.status !== "connected") {
        globalCache.__maddoxMcpReady = null
        const reason = status.error ? ` (${status.error})` : ""
        throw new DomainError(409, `O MCP do Maddox não está conectado no OpenCode${reason}. Confira a seção OpenCode da aba "Agente Maddox".`, "MADDOX_UNAVAILABLE")
    }
    globalCache.__maddoxMcpReady = { key, at: Date.now() }
}
