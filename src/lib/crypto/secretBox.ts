import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

/**
 * Criptografia simétrica dos campos privados das integrações.
 *
 * AES-256-GCM com IV aleatório de 12 bytes e tag de autenticação de 16 bytes. A chave vem
 * de `INTEGRATIONS_ENCRYPTION_KEY` e aceita qualquer texto não vazio: base64 de 32 bytes ou hex
 * de 64 caracteres são usados diretamente (compatibilidade); qualquer outro valor é derivado para
 * 32 bytes com SHA-256. Recomendado: `openssl rand -base64 32`. O
 * valor persistido carrega `v` para permitir rotação futura de algoritmo/chave sem migrar
 * tudo de uma vez.
 *
 * Fail-closed: sem chave (variável ausente ou vazia), `encryptSecret` e `decryptSecret` lançam
 * `SecretBoxKeyError` — nunca gravamos segredo em texto puro nem "adivinhamos" uma chave.
 */

export const SECRET_BOX_VERSION = 1 as const

export interface EncryptedSecret {
    v: typeof SECRET_BOX_VERSION
    iv: string
    tag: string
    ct: string
}

export class SecretBoxKeyError extends Error {
    constructor(message = "Chave de criptografia das integrações ausente (INTEGRATIONS_ENCRYPTION_KEY)") {
        super(message)
        this.name = "SecretBoxKeyError"
    }
}

export class SecretBoxDecryptError extends Error {
    constructor() {
        super("Não foi possível descriptografar o segredo: valor corrompido ou chave diferente da usada na gravação")
        this.name = "SecretBoxDecryptError"
    }
}

function resolveKey(raw: string | undefined = process.env.INTEGRATIONS_ENCRYPTION_KEY): Buffer | null {
    const value = raw?.trim()
    if (!value) return null
    const decoded = Buffer.from(value, "base64")
    if (decoded.length === 32) return decoded
    // Chave em hex (64 caracteres) também é aceita — é o formato de `openssl rand -hex 32`.
    if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex")
    // Qualquer outro texto (frase, senha curta etc.) é derivado para 32 bytes, de forma determinística.
    return createHash("sha256").update(value, "utf8").digest()
}

export function isSecretBoxConfigured(): boolean {
    return resolveKey() !== null
}

/** Impressão digital curta da chave, para diagnosticar divergência entre instâncias sem expô-la. */
export function secretBoxKeyFingerprint(): string | null {
    const key = resolveKey()
    if (!key) return null
    return createHash("sha256").update(key).digest("hex").slice(0, 8)
}

/**
 * Subchave derivada da chave das integrações para outro uso (ex.: assinar tokens HMAC), sem expor a
 * chave original. `null` quando `INTEGRATIONS_ENCRYPTION_KEY` não está definida.
 */
export function deriveSubkey(purpose: string): Buffer | null {
    const key = resolveKey()
    if (!key) return null
    return createHash("sha256").update(key).update(`:${purpose}`, "utf8").digest()
}

export function encryptSecret(plain: string): EncryptedSecret {
    const key = resolveKey()
    if (!key) throw new SecretBoxKeyError()
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
    return {
        v: SECRET_BOX_VERSION,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ct: ct.toString("base64"),
    }
}

export function isEncryptedSecret(value: unknown): value is EncryptedSecret {
    if (!value || typeof value !== "object") return false
    const v = value as Record<string, unknown>
    return v.v === SECRET_BOX_VERSION && typeof v.iv === "string" && typeof v.tag === "string" && typeof v.ct === "string"
}

export function decryptSecret(box: EncryptedSecret): string {
    const key = resolveKey()
    if (!key) throw new SecretBoxKeyError()
    try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"))
        decipher.setAuthTag(Buffer.from(box.tag, "base64"))
        return Buffer.concat([decipher.update(Buffer.from(box.ct, "base64")), decipher.final()]).toString("utf8")
    } catch {
        throw new SecretBoxDecryptError()
    }
}
