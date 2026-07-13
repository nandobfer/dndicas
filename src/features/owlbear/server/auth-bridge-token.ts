import crypto from "node:crypto"

const OWLBEAR_AUTH_BRIDGE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
const OWLBEAR_AUTH_BRIDGE_TOKEN_PURPOSE = "owlbear-auth-bridge"

interface OwlbearAuthBridgePayload {
    purpose: typeof OWLBEAR_AUTH_BRIDGE_TOKEN_PURPOSE
    sub: string
    iat: number
    exp: number
}

function getBridgeSecret() {
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) throw new Error("AUTH_SECRET não configurado para bridge Owlbear")
    return secret
}

function base64UrlEncode(value: string | Buffer) {
    return Buffer.from(value).toString("base64url")
}

function signTokenPayload(encodedPayload: string) {
    return crypto
        .createHmac("sha256", getBridgeSecret())
        .update(encodedPayload)
        .digest("base64url")
}

function safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function createOwlbearAuthBridgeToken(userId: string) {
    const now = Math.floor(Date.now() / 1000)
    const payload: OwlbearAuthBridgePayload = {
        purpose: OWLBEAR_AUTH_BRIDGE_TOKEN_PURPOSE,
        sub: userId,
        iat: now,
        exp: now + OWLBEAR_AUTH_BRIDGE_TOKEN_TTL_SECONDS,
    }
    const encodedPayload = base64UrlEncode(JSON.stringify(payload))
    const signature = signTokenPayload(encodedPayload)
    return `${encodedPayload}.${signature}`
}

export function verifyOwlbearAuthBridgeToken(token: string | null | undefined) {
    if (!token) return null

    const [encodedPayload, signature, extra] = token.split(".")
    if (!encodedPayload || !signature || extra) return null

    const expectedSignature = signTokenPayload(encodedPayload)
    if (!safeEqual(signature, expectedSignature)) return null

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<OwlbearAuthBridgePayload>
        const now = Math.floor(Date.now() / 1000)
        if (payload.purpose !== OWLBEAR_AUTH_BRIDGE_TOKEN_PURPOSE) return null
        if (!payload.sub || typeof payload.sub !== "string") return null
        if (typeof payload.exp !== "number" || payload.exp <= now) return null
        return payload.sub
    } catch {
        return null
    }
}
