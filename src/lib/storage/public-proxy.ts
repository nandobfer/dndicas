/**
 * Regras do proxy público de arquivos (`GET /api/upload?key=`), que serve sem login as imagens das
 * regras, fichas e artes geradas.
 */

/**
 * Prefixos privados do bucket que nunca saem pelo proxy público: os arquivos do chat do Agente Opex
 * têm rota própria, autenticada e com escopo de sessão (`/api/opex/files/[id]`).
 */
const PRIVATE_KEY_PREFIXES = ["opex/"]

/** Tipos servidos inline (imagens raster); o resto sai como download binário. */
const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])

/** Chave privada (ou com `..`): o proxy responde como se não existisse. */
export function isPrivateUploadKey(key: string): boolean {
    const normalized = key.trim().replace(/^\/+/, "")
    return normalized.split("/").includes("..") || PRIVATE_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

/** Tipo de resposta: imagens raster inline; qualquer outro (HTML, SVG...) vira download binário. */
export function publicProxyContentType(stored: string | null | undefined): { contentType: string; inline: boolean } {
    const mime = (stored ?? "").split(";")[0]!.trim().toLowerCase()
    return INLINE_TYPES.has(mime) ? { contentType: mime, inline: true } : { contentType: "application/octet-stream", inline: false }
}
