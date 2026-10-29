/**
 * Menções de entidades nas respostas do Agente Opex (módulo PURO). O agente cita entidades do
 * catálogo como `<span data-type="mention" data-id data-label data-entity-type>`; o Markdown do chat
 * não renderiza HTML, então as menções viram links `#mention:{tipo}:{id}` que a tela troca pelo
 * badge do DnDicas (`MentionBadge`, o mesmo do `MentionContent`).
 */

export const MENTION_HREF_PREFIX = "#mention:"

const MENTION_SPAN = /<span\b([^>]*\bdata-type=["']mention["'][^>]*)>([\s\S]*?)<\/span>/gi
const ATTR = (name: string) => new RegExp(`\\b${name}=["']([^"']*)["']`, "i")

const attr = (attrs: string, name: string) => ATTR(name).exec(attrs)?.[1]?.trim() ?? ""

/** Sem colchetes nem quebras: o rótulo vai dentro do texto do link Markdown. */
const linkText = (value: string) => value.replace(/<[^>]*>/g, "").replace(/[[\]\n\r]/g, " ").replace(/\s+/g, " ").trim()

/** Troca as menções em HTML por links Markdown `[Nome](#mention:Tipo:id)`. */
export function mentionsToMarkdown(text: string): string {
    if (!text.includes("data-type")) return text
    return text.replace(MENTION_SPAN, (whole, attrs: string, inner: string) => {
        const id = attr(attrs, "data-id")
        const label = linkText(attr(attrs, "data-label") || inner)
        const type = attr(attrs, "data-entity-type") || "Regra"
        if (!id || !label) return linkText(inner) || whole
        return `[${label}](${MENTION_HREF_PREFIX}${encodeURIComponent(type)}:${encodeURIComponent(id)})`
    })
}

/** Lê tipo e id de um link de menção; `null` para links comuns. */
export function parseMentionHref(href: string | undefined): { type: string; id: string } | null {
    if (!href?.startsWith(MENTION_HREF_PREFIX)) return null
    const [type, id] = href.slice(MENTION_HREF_PREFIX.length).split(":")
    if (!type || !id) return null
    return { type: decodeURIComponent(type), id: decodeURIComponent(id) }
}
