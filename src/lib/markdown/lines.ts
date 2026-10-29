/**
 * Linhas lógicas de um Markdown (uma por linha do texto-fonte), usadas pelas ações por linha do
 * componente `Markdown` (comentar a linha, citá-la no campo do agente). Funções puras: rodam igual
 * no servidor e no navegador.
 */

export interface SourceLine {
    /** Número da linha no texto-fonte (1 = primeira), o mesmo das posições do react-markdown. */
    line: number
    raw: string
    normalized: string
    hash: string
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const TABLE_DELIMITER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/
const THEMATIC_BREAK = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const HTML_COMMENT = /^\s*<!--.*-->\s*$/

export function splitLines(markdown: string): string[] {
    return markdown.split(/\r?\n/)
}

/** Tira os marcadores de bloco (citação, lista, tarefa, título, pipes de tabela) do começo da linha. */
export function stripBlockMarkers(raw: string): string {
    let text = raw.trim()
    let previous = ""
    while (previous !== text) {
        previous = text
        text = text
            .replace(/^>\s?/, "")
            .replace(/^([-*+]|\d{1,9}[.)])\s+/, "")
            .replace(/^\[[ xX]\]\s+/, "")
            .replace(/^#{1,6}\s+/, "")
            .trim()
    }
    if (text.startsWith("|")) text = text.slice(1)
    if (text.endsWith("|")) text = text.slice(0, -1)
    return text.trim()
}

/** Texto comparável da linha: sem marcadores de bloco, pipes, espaços repetidos nem maiúsculas. */
export function normalizeLine(raw: string): string {
    return stripBlockMarkers(raw).replace(/\|/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
}

/** Hash curto (FNV-1a de 32 bits, 8 dígitos hex) do texto normalizado da linha. */
export function lineHash(raw: string): string {
    const text = normalizeLine(raw)
    let hash = 0x811c9dc5
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
}

const BLOCK_START = /^\s{0,3}([-*+]\s|\d{1,9}[.)]\s|#{1,6}\s|\||```|~~~|<!--)/
const QUOTE_PREFIX = /^\s{0,3}(>\s?)+/
const HARD_BREAK = /( {2,}|\\)$/

/**
 * Linhas renderizadas que recebem ação (uma por botão): cada linha de código, título, item de lista e
 * linha de tabela; num parágrafo (ou citação), as linhas unidas por quebra simples — que o Markdown
 * mostra na mesma linha — formam uma só, de `line` a `endLine`. Quebra forçada (dois espaços ou `\`)
 * separa. Ignora vazias, cercas, separador de tabela, `---` e comentários HTML. `raw` traz as linhas
 * juntas; o hash é o do texto citado (`quoteOf`), o mesmo que o botão grava.
 */
export function sourceLines(markdown: string): (SourceLine & { endLine: number })[] {
    const units: { line: number; endLine: number; code: boolean }[] = []
    let fence: string | null = null
    let previous: { depth: number; open: boolean } | null = null
    const lines = splitLines(markdown)
    lines.forEach((raw, index) => {
        const marker = FENCE.exec(raw)?.[1]
        if (marker && (fence === null || marker[0] === fence[0])) {
            fence = fence === null ? marker : null
            previous = null
            return
        }
        if (!raw.trim()) {
            previous = null
            return
        }
        if (fence !== null) {
            units.push({ line: index + 1, endLine: index + 1, code: true })
            return
        }
        if (TABLE_DELIMITER.test(raw) || THEMATIC_BREAK.test(raw) || HTML_COMMENT.test(raw)) {
            previous = null
            return
        }
        const content = raw.replace(QUOTE_PREFIX, "")
        const depth = QUOTE_PREFIX.exec(raw)?.[0].match(/>/g)?.length ?? 0
        const last = units[units.length - 1]
        // Continuação: mesma citação (ou continuação preguiçosa sem `>`), sem começar outro bloco.
        const continues = previous?.open && last && content.trim() && !BLOCK_START.test(content) && (depth === 0 || depth === previous.depth)
        if (continues) last.endLine = index + 1
        else units.push({ line: index + 1, endLine: index + 1, code: false })
        previous = { depth: continues && depth === 0 ? previous!.depth : depth, open: !HARD_BREAK.test(raw) && !/^\s{0,3}(#{1,6}\s|\|)/.test(content) && Boolean(content.trim()) }
    })
    return units.map(({ line, endLine, code }) => {
        const text = code ? (lines[line - 1] ?? "") : quoteOf(markdown, line, endLine)
        return { line, endLine, raw: lines.slice(line - 1, endLine).join("\n"), normalized: normalizeLine(text), hash: lineHash(text) }
    })
}

/** Texto da linha (ou do intervalo) para citar: sem marcadores de bloco; linhas de código ficam como estão. */
export function quoteOf(markdown: string, start: number, end: number = start, options: { code?: boolean } = {}): string {
    const lines = splitLines(markdown).slice(start - 1, Math.max(start, end))
    if (options.code) return lines.map((line) => line.replace(/\s+$/, "")).join("\n")
    return lines
        .map(stripBlockMarkers)
        .filter(Boolean)
        .join(" ")
}

/** Corta o texto em `max` caracteres (com reticências). */
export function clipLine(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
