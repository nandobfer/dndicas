import { formatAttachmentSize } from "@/lib/attachments"
import { OPEX_FILE_CONTENT_MAX_BYTES, OPEX_FILE_TEXT_MAX_BYTES, type OpexProviderId } from "./constants"

/**
 * Arquivos do chat (módulo puro: tela e servidor). O tipo decide como o arquivo chega ao modelo:
 * conteúdo (imagem/PDF/áudio/vídeo como parte do pedido, texto inline) ou só a referência — textos
 * maiores o agente lê em janelas com `read_chat_file` pelo `fileId`.
 */

export const OPEX_FILE_KINDS = ["image", "pdf", "text", "audio", "video", "other"] as const
export type OpexFileKind = (typeof OPEX_FILE_KINDS)[number]

const TEXT_EXTENSIONS = new Set([
    "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "log", "xml", "yml", "yaml", "toml", "ini", "env", "sql", "html", "htm", "css", "scss",
    "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "cs", "php", "sh", "bash", "zsh", "ps1", "vue", "svelte", "graphql", "gql", "diff", "patch",
])
const TEXT_MIMES = new Set(["application/json", "application/xml", "application/x-yaml", "application/yaml", "application/sql", "application/x-sh", "application/javascript", "application/typescript", "application/x-ndjson"])
/** Imagens que os provedores leem (SVG é conteúdo ativo e não entra). */
const MODEL_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"])

const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ""

/** Tipo do arquivo pelo MIME, com a extensão como reserva (o navegador nem sempre informa o MIME). */
export function opexFileKind(mediaType: string | null | undefined, name: string): OpexFileKind {
    const mime = (mediaType ?? "").split(";")[0]!.trim().toLowerCase()
    const extension = extensionOf(name)
    if (MODEL_IMAGE_MIMES.has(mime) || ((!mime || mime === "application/octet-stream") && ["png", "jpg", "jpeg", "webp", "gif"].includes(extension))) return "image"
    if (mime === "application/pdf" || extension === "pdf") return "pdf"
    if (mime.startsWith("audio/")) return "audio"
    if (mime.startsWith("video/")) return "video"
    if (mime.startsWith("text/") || TEXT_MIMES.has(mime) || TEXT_EXTENSIONS.has(extension)) return "text"
    return "other"
}

/** Como cada provedor recebe cada tipo: parte de arquivo (`content`), texto inline ou só referência. */
export type OpexFileDelivery = "content" | "inline-text" | "reference"

const PROVIDER_KINDS: Record<OpexProviderId, ReadonlySet<OpexFileKind>> = {
    gemini: new Set(["image", "pdf", "audio", "video"]),
    anthropic: new Set(["image", "pdf"]),
    openai: new Set(["image", "pdf"]),
    deepseek: new Set(),
}

/**
 * Entrega do arquivo ao modelo. Arquivos acima do teto (`OPEX_FILE_CONTENT_MAX_BYTES` para conteúdo,
 * `OPEX_FILE_TEXT_MAX_BYTES` para texto) não são baixados do storage no turno: vão só como referência.
 */
export function opexFileDelivery(provider: OpexProviderId, kind: OpexFileKind, size = 0): OpexFileDelivery {
    if (kind === "text") return size > OPEX_FILE_TEXT_MAX_BYTES ? "reference" : "inline-text"
    if (!PROVIDER_KINDS[provider].has(kind)) return "reference"
    return size > OPEX_FILE_CONTENT_MAX_BYTES ? "reference" : "content"
}

/** Peso aproximado (em caracteres) do arquivo no orçamento do histórico. */
export function opexFileWeight(kind: OpexFileKind, size: number): number {
    if (kind === "image") return 8_000
    if (kind === "text") return Math.min(size, 100_000)
    if (kind === "pdf") return Math.min(Math.round(size / 3), 150_000)
    if (kind === "audio" || kind === "video") return Math.min(Math.round(size / 10), 150_000)
    return 300
}

/** Rota do app que serve o arquivo (sem `basePath`). */
export const opexFilePath = (id: string, download = false) => `/api/opex/files/${id}${download ? "?download=1" : ""}`

export const OPEX_FILE_KIND_LABELS: Record<OpexFileKind, string> = {
    image: "imagem",
    pdf: "PDF",
    text: "texto",
    audio: "áudio",
    video: "vídeo",
    other: "arquivo",
}

/** Linha de referência enviada ao modelo junto (ou no lugar) do conteúdo. */
export function opexFileReference(file: { id: string; name: string; mediaType: string; size: number; kind: OpexFileKind }, delivery: OpexFileDelivery): string {
    const base = `[Arquivo do chat: "${file.name}" (${OPEX_FILE_KIND_LABELS[file.kind]}, ${file.mediaType}, ${formatAttachmentSize(file.size)}) — fileId ${file.id}`
    if (delivery === "reference") return `${base}. O conteúdo não foi enviado ao modelo (tipo não lido pelo modelo atual ou arquivo grande demais); se for texto, leia com read_chat_file pelo fileId.]`
    return `${base}]`
}

/** Limite de tamanho configurado, em bytes. */
export const opexMaxBytes = (maxSizeMb: number) => Math.round(maxSizeMb * 1024 * 1024)
