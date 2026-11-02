/**
 * Busca do Diário da campanha (Maddox 9): regex que ignora acentos e caixa, trecho em volta da ocorrência e
 * texto sem a marcação do catálogo. Módulo puro (servidor e tela).
 */

const ACCENT_GROUPS: Record<string, string> = {
    a: "aáàâãä",
    e: "eéèêë",
    i: "iíìîï",
    o: "oóòôõö",
    u: "uúùûü",
    c: "cç",
    n: "nñ",
}

const ACCENT_OF: Record<string, string> = Object.fromEntries(Object.entries(ACCENT_GROUPS).flatMap(([base, group]) => [...group].map((char) => [char, base])))

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\/-]/

/** Remove os acentos (pt-BR) e a caixa. */
export function foldAccents(value: string): string {
    return [...value.toLowerCase()].map((char) => ACCENT_OF[char] ?? char).join("")
}

/** Fonte do regex (para o `$regex` do MongoDB, com a opção `i`): cada letra aceita as variantes acentuadas. */
export function accentInsensitivePattern(query: string): string {
    return [...foldAccents(query.trim())]
        .map((char) => {
            const group = ACCENT_GROUPS[char]
            if (group) return `[${group}]`
            return REGEX_SPECIAL.test(char) ? `\\${char}` : char
        })
        .join("")
}

export function accentInsensitiveRegex(query: string): RegExp {
    return new RegExp(accentInsensitivePattern(query), "i")
}

/** `{{Tipo:Nome}}` (marcação do catálogo) → `Nome`. */
export function stripCatalogMarkup(text: string): string {
    return text.replace(/\{\{\s*[^{}:]+:\s*([^{}]+?)\s*\}\}/g, "$1")
}

/** Texto corrido para o trecho: sem a marcação do catálogo e sem a ênfase, títulos e citações do Markdown. */
export function plainText(text: string): string {
    return stripCatalogMarkup(text)
        .replace(/(\*\*|__|\*|`)/g, "")
        .replace(/^\s{0,3}(#{1,6}|>)\s?/gm, "")
        .replace(/\s+/g, " ")
        .trim()
}

/** Tamanho do trecho mostrado no resultado da busca. */
export const MADDOX_JOURNAL_EXCERPT_CHARS = 160

/** Trecho (texto corrido, `plainText`) em volta da primeira ocorrência; sem ocorrência = o começo do texto. */
export function excerptAround(text: string, query: string, size = MADDOX_JOURNAL_EXCERPT_CHARS): string {
    const plain = plainText(text)
    if (plain.length <= size) return plain
    const index = foldAccents(plain).indexOf(foldAccents(query.trim()))
    if (index < 0) return `${plain.slice(0, size).trimEnd()}…`
    const start = Math.max(0, Math.min(index - Math.floor((size - query.length) / 2), plain.length - size))
    const end = Math.min(plain.length, start + size)
    return `${start > 0 ? "…" : ""}${plain.slice(start, end).trim()}${end < plain.length ? "…" : ""}`
}
