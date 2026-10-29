import { createHmac, randomUUID, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"

/**
 * Identidade do **visitante anônimo** do Agente Opex: um id aleatório num cookie httpOnly assinado
 * (HMAC-SHA256 com o `AUTH_SECRET`). O id escopa as sessões do visitante no servidor e o canal
 * `private-opex-a-{id}` do Pusher. Trocar de navegador ou limpar os cookies começa do zero.
 * SOMENTE servidor.
 */

export const OPEX_ANON_COOKIE = "dndicas_opex_anon"
/** Validade do cookie (as sessões anônimas expiram antes, pelo TTL configurado). */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const ID_PATTERN = /^[0-9a-f-]{36}$/

function signingKey(): string {
    const secret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()
    if (!secret) throw new Error("AUTH_SECRET não configurado: não é possível identificar visitantes do Agente Opex.")
    return secret
}

function sign(id: string): string {
    return createHmac("sha256", signingKey()).update(`opex-anon:${id}`).digest("base64url")
}

/** `id.assinatura` → id quando a assinatura confere; senão `null`. Módulo testável sem cookies. */
export function verifyAnonymousToken(token: string | undefined | null): string | null {
    if (!token) return null
    const [id, signature] = token.split(".")
    if (!id || !signature || !ID_PATTERN.test(id)) return null
    const expected = Buffer.from(sign(id))
    const received = Buffer.from(signature)
    if (expected.length !== received.length) return null
    return timingSafeEqual(expected, received) ? id : null
}

export function createAnonymousToken(id: string = randomUUID()): { id: string; token: string } {
    return { id, token: `${id}.${sign(id)}` }
}

/** Id anônimo do cookie atual (validado), sem criar. */
export async function readAnonymousId(): Promise<string | null> {
    const store = await cookies()
    return verifyAnonymousToken(store.get(OPEX_ANON_COOKIE)?.value)
}

/**
 * Id anônimo do cookie atual; sem cookie válido, cria um e grava na resposta (só funciona em
 * Route Handlers / Server Actions, onde os cookies são graváveis).
 */
export async function ensureAnonymousId(): Promise<string> {
    const current = await readAnonymousId()
    if (current) return current
    const { id, token } = createAnonymousToken()
    const store = await cookies()
    store.set(OPEX_ANON_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
    })
    return id
}
