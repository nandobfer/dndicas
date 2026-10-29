/**
 * Contrato PURO dos anexos (servidor, cliente, portal e UI genérica).
 *
 * O conteúdo de um anexo é servido **somente** pela rota autenticada
 * `/api/attachments/{id}/content` — nunca pela URL assinada do storage, que expira. A descrição da
 * tarefa guarda essa referência **estável** (sem `basePath`) e a renderização aplica o subcaminho
 * público, para que a referência sobreviva a mudanças de publicação.
 */

export const ATTACHMENT_KINDS = ["image", "video", "audio", "file"] as const
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

/** Caminho estável do conteúdo do anexo (sem `basePath`). */
export const attachmentContentPath = (id: string) => `/api/attachments/${id}/content`

/** Reconhece a URL estável de um anexo, com o fragmento de mídia opcional. */
const CONTENT_PATH = /\/api\/attachments\/([a-f0-9]{24})\/content(?:#(audio|video))?$/i

export interface ParsedAttachmentUrl {
    id: string
    /** Mídia pretendida pelo autor da referência (`#audio`/`#video` no Markdown). */
    media: "audio" | "video" | null
}

/** `null` quando não é uma URL de anexo do Opex. Aceita `basePath` na frente. */
export function parseAttachmentUrl(src: string | null | undefined): ParsedAttachmentUrl | null {
    if (!src) return null
    const match = CONTENT_PATH.exec(src.trim())
    if (!match) return null
    const [, id, fragment] = match
    return { id: id!, media: (fragment as ParsedAttachmentUrl["media"]) ?? null }
}

/** Tipo de exibição derivado do mime. SVG é conteúdo ativo: tratado como arquivo (nunca inline). */
export function attachmentKindOf(mimeType: string | null | undefined): AttachmentKind {
    const mime = (mimeType ?? "").split(";")[0]!.trim().toLowerCase()
    if (mime === "image/svg+xml" || mime === "image/svg") return "file"
    if (mime.startsWith("image/")) return "image"
    if (mime.startsWith("video/")) return "video"
    if (mime.startsWith("audio/")) return "audio"
    return "file"
}

/** Somente estes tipos podem ser servidos inline (o restante sempre baixa). */
export function isInlineAttachmentMime(mimeType: string | null | undefined): boolean {
    const kind = attachmentKindOf(mimeType)
    return kind === "image" || kind === "video" || kind === "audio"
}

/** Referência em Markdown de um anexo (estável; a UI resolve imagem, áudio e vídeo). */
export function attachmentMarkdown(input: { id: string; name: string; mimeType: string | null | undefined }): string {
    const label = input.name.replace(/[[\]]/g, "").trim() || "anexo"
    const url = attachmentContentPath(input.id)
    const kind = attachmentKindOf(input.mimeType)
    if (kind === "image") return `![${label}](${url})`
    if (kind === "audio") return `![${label}](${url}#audio)`
    if (kind === "video") return `![${label}](${url}#video)`
    return `[${label}](${url})`
}

/** Nome de exibição sem separadores de caminho nem caracteres de controle. */
export function safeAttachmentName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? name
    const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160)
    return clean || "arquivo"
}

/** Extensão segura derivada do mime (`[a-z0-9]`, até 8 caracteres); vazia quando não há uma útil. */
function safeExtension(mimeType: string | null | undefined): string {
    const subtype = (mimeType ?? "").split(";")[0]!.trim().toLowerCase().split("/")[1] ?? ""
    const clean = subtype.replace(/^x-/, "").replace(/[^a-z0-9]/g, "")
    if (!clean || clean === "octetstream") return ""
    return `.${clean.slice(0, 8)}`
}

/**
 * Nome para um arquivo que chega **sem nome** — mídia colada da área de transferência, em que o
 * navegador não informa nome. O storage precisa de uma chave estável e a referência, de um rótulo.
 */
export function fallbackAttachmentName(mimeType: string | null | undefined): string {
    const kind = attachmentKindOf(mimeType)
    const base = kind === "image" ? "imagem-colada" : kind === "video" ? "video-colado" : kind === "audio" ? "audio-colado" : "arquivo-colado"
    return `${base}${safeExtension(mimeType)}`
}

/** Tamanho legível (pt-BR). */
export function formatAttachmentSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
    const units = ["B", "KB", "MB", "GB"] as const
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / 1024 ** index
    const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",")
    return `${text} ${units[index]}`
}

/** `true` quando a descrição referencia o anexo (aviso antes de remover). */
export function isAttachmentReferenced(markdown: string | null | undefined, id: string): boolean {
    return Boolean(markdown && markdown.includes(attachmentContentPath(id)))
}
