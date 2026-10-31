import { createHmac, timingSafeEqual } from "node:crypto"
import { MADDOX_TURN_TOKEN_TTL_MS } from "../constants"

/**
 * Token de turno do MCP do Maddox (Maddox 4) — SOMENTE servidor. Com o OpenCode como narrador, as ferramentas
 * chegam pelo MCP (`/api/maddox/mcp`) e cada chamada traz este token: `payload.assinatura`, HMAC-SHA256 com o
 * `AUTH_SECRET`. O payload leva a campanha, o job da geração, o turno e a validade; a rota exige ainda que o job
 * esteja rodando no barramento (`isActiveMaddoxJob`). A campanha vem do token, nunca do modelo.
 */

export interface MaddoxTurnTokenPayload {
    campaignId: string
    jobId: string
    turnNumber: number
    /** Expiração (ms desde a época). */
    exp: number
}

function signingKey(): string {
    const secret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()
    if (!secret) throw new Error("AUTH_SECRET não configurado: não é possível assinar o token de turno do Maddox.")
    return secret
}

const sign = (payload: string) => createHmac("sha256", signingKey()).update(`maddox-turn:${payload}`).digest("base64url")

export function createMaddoxTurnToken(input: Omit<MaddoxTurnTokenPayload, "exp">, now = Date.now()): string {
    const payload = Buffer.from(JSON.stringify({ ...input, exp: now + MADDOX_TURN_TOKEN_TTL_MS } satisfies MaddoxTurnTokenPayload)).toString("base64url")
    return `${payload}.${sign(payload)}`
}

/** Payload quando a assinatura confere e o token não expirou; senão `null`. */
export function verifyMaddoxTurnToken(token: string | null | undefined, now = Date.now()): MaddoxTurnTokenPayload | null {
    if (!token || typeof token !== "string") return null
    const [payload, signature] = token.trim().split(".")
    if (!payload || !signature) return null
    const expected = Buffer.from(sign(payload))
    const received = Buffer.from(signature)
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
    try {
        const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<MaddoxTurnTokenPayload>
        if (typeof parsed.campaignId !== "string" || typeof parsed.jobId !== "string" || typeof parsed.turnNumber !== "number" || typeof parsed.exp !== "number") return null
        if (parsed.exp < now) return null
        return parsed as MaddoxTurnTokenPayload
    } catch {
        return null
    }
}
