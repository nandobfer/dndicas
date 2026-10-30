import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import type { OpexSession, OpexUser } from "../types"

const userSchema = z.object({ id: z.string(), username: z.string(), email: z.string().nullable(), admin: z.boolean(), active: z.boolean(), isDefault: z.boolean(), portalPath: z.string() })
const sessionSchema = z.object({ clientId: z.string(), clientName: z.string(), isAdmin: z.boolean(), user: z.object({ id: z.string(), username: z.string(), email: z.string().nullable() }) })

export function normalizeOpexUrl(raw: string): string {
    const parsed = z.string().url().safeParse(raw)
    if (!parsed.success) throw new DomainError(409, "Configure uma URL válida na integração Opex.", "OPEX_NOT_CONFIGURED")
    const url = new URL(parsed.data)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new DomainError(409, "A URL do Opex deve usar HTTP ou HTTPS, sem credenciais ou parâmetros.", "OPEX_NOT_CONFIGURED")
    return url.toString().replace(/\/+$/, "")
}

/** Never forward remote exceptions or URLs: both can carry portal credentials. */
export class OpexClient {
    readonly baseUrl: string
    constructor(baseUrl: string) { this.baseUrl = normalizeOpexUrl(baseUrl) }

    async login(token: string): Promise<string> {
        try {
            const response = await fetch(`${this.baseUrl}/api/auth/client-login?t=${encodeURIComponent(token)}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15_000) })
            const cookies = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""]
            const cookie = cookies.flatMap((line) => line.split(/,(?=\s*opex_session=)/)).map((line) => line.trim()).find((line) => line.startsWith("opex_session="))?.split(";")[0]
            if (![302, 303, 307, 308].includes(response.status) || !cookie || cookie === "opex_session=") throw new DomainError(502, "O Opex recusou o token de acesso. Confira a integração.", "OPEX_CLIENT_TOKEN_INVALID")
            return cookie
        } catch (error) {
            if (error instanceof DomainError) throw error
            throw new DomainError(502, "Não foi possível conectar ao Opex. Tente novamente.", "OPEX_UNAVAILABLE")
        }
    }

    async request<T>(path: string, cookie: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
        try {
            const response = await fetch(`${this.baseUrl}${path}`, { method: body === undefined ? "GET" : "POST", redirect: "manual", cache: "no-store", headers: { Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) })
            const envelope = z.object({ success: z.boolean(), data: z.unknown().optional(), code: z.string().optional() }).parse(await response.json())
            if (!response.ok || !envelope.success) {
                const conflict = ["USERNAME_IN_USE", "EMAIL_IN_USE", "USER_EXISTS"].includes(envelope.code ?? "")
                throw new DomainError(conflict ? 409 : 502, conflict ? "Já existe um usuário com esses dados no Opex." : "O Opex não pôde atender à solicitação. Confira o acesso do cliente.", conflict ? envelope.code : "OPEX_UNAVAILABLE")
            }
            return schema.parse(envelope.data)
        } catch (error) {
            if (error instanceof DomainError) throw error
            throw new DomainError(502, "Resposta inválida ou conexão indisponível com o Opex.", "OPEX_UNAVAILABLE")
        }
    }
    session(cookie: string): Promise<OpexSession> { return this.request("/api/cliente/session", cookie, sessionSchema) }
    users(cookie: string): Promise<OpexUser[]> { return this.request("/api/cliente/usuarios", cookie, z.array(userSchema)) }
    async createUser(cookie: string, input: { username: string; email?: string; admin: false }): Promise<OpexUser> {
        return (await this.request("/api/cliente/usuarios", cookie, z.object({ item: userSchema }), input)).item
    }
    async selectClient(cookie: string, clientId: string): Promise<string> {
        // This endpoint reissues the cookie. Keep it within this isolated server-side jar.
        try {
            const response = await fetch(`${this.baseUrl}/api/auth/client-select`, { method: "POST", redirect: "manual", cache: "no-store", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ clientId }), signal: AbortSignal.timeout(15_000) })
            const next = (response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""]).find((line) => line.startsWith("opex_session="))?.split(";")[0]
            if (!response.ok || !next) throw new Error("session")
            return next
        } catch { throw new DomainError(502, "Não foi possível selecionar o cliente no Opex.", "OPEX_UNAVAILABLE") }
    }
}

export function portalToken(path: string): string {
    // Only accept the documented login path; never follow a remotely supplied arbitrary URL.
    const url = new URL(path, "https://portal.invalid")
    const token = url.searchParams.get("t")
    if (url.origin !== "https://portal.invalid" || url.pathname !== "/cliente" || !token?.startsWith("usr_")) throw new DomainError(409, "O usuário do Opex não possui um link individual válido.", "OPEX_USER_CONFLICT")
    return token
}
