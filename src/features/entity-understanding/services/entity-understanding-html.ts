const ALLOWED_TAGS = new Set(["p", "strong", "em", "ul", "ol", "li", "br", "span"])
const MENTION_ATTRS = new Set(["data-type", "data-id", "data-label", "data-entity-type"])

const escapeHtml = (value: string): string => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const stripDangerousContent = (html: string): string => html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")

const stripInvalidMentionSpans = (html: string): string => html.replace(/<span\b([^>]*)data-type\s*=\s*["']mention["']([^>]*)>([\s\S]*?)<\/span>/gi, (fullMatch, beforeAttrs: string, afterAttrs: string, content: string) => {
    const attrs = `${beforeAttrs} ${afterAttrs}`
    if (/data-id\s*=/.test(attrs) && /data-label\s*=/.test(attrs) && /data-entity-type\s*=/.test(attrs)) {
        return fullMatch
    }

    return content
})

const sanitizeAttributes = (tagName: string, rawAttributes: string): string => {
    if (tagName !== "span") return ""

    const attrs = new Map<string, string>()
    const attrRegex = /([a-zA-Z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
    let match: RegExpExecArray | null

    while ((match = attrRegex.exec(rawAttributes)) !== null) {
        const name = match[1].toLowerCase()
        if (!MENTION_ATTRS.has(name)) continue

        const rawValue = match[3] ?? match[4] ?? match[5] ?? ""
        attrs.set(name, escapeHtml(rawValue))
    }

    if (attrs.get("data-type") !== "mention") return ""
    if (!attrs.get("data-id") || !attrs.get("data-label") || !attrs.get("data-entity-type")) return ""

    return Array.from(attrs.entries())
        .map(([name, value]) => ` ${name}="${value}"`)
        .join("")
}

export function sanitizeEntityUnderstandingHtml(html: string): string {
    const withoutDangerousContent = stripInvalidMentionSpans(stripDangerousContent(html || ""))

    return withoutDangerousContent.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (fullTag, rawTagName: string, rawAttributes: string) => {
        const tagName = rawTagName.toLowerCase()
        if (!ALLOWED_TAGS.has(tagName)) return ""

        const isClosing = /^<\//.test(fullTag)
        if (isClosing) return `</${tagName}>`
        if (tagName === "br") return "<br>"

        return `<${tagName}${sanitizeAttributes(tagName, rawAttributes || "")}>`
    })
}

export function getPlainTextFromHtml(html: string): string {
    return sanitizeEntityUnderstandingHtml(html)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim()
}

export function isMeaningfulHtml(html: string): boolean {
    return getPlainTextFromHtml(html).length > 0
}
