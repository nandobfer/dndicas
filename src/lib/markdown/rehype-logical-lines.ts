import { splitLines } from "./lines"

/**
 * Plugin rehype das ações por linha: agrupa o conteúdo de parágrafos, títulos, itens de lista, linhas
 * de tabela e linhas de código pela linha do texto-fonte e envolve cada grupo num
 * `<span data-md-line data-md-line-end>` inline, que o `Markdown` troca pelo `MarkdownLine` (botão no
 * fim da linha). Não muda a renderização: os separadores originais (`\n` do texto, `<br>`) ficam entre
 * os grupos, então o texto quebra exatamente como sem a ação.
 */

interface Point {
    line: number
}
interface Position {
    start: Point
    end: Point
}
interface HastText {
    type: "text"
    value: string
    position?: Position
}
interface HastElement {
    type: "element"
    tagName: string
    properties: Record<string, unknown>
    children: HastNode[]
    position?: Position
}
interface HastOther {
    type: "root" | "comment" | "doctype" | "raw"
    children?: HastNode[]
    position?: Position
}
type HastNode = HastText | HastElement | HastOther

export const LINE_PROP = "dataMdLine"
export const LINE_END_PROP = "dataMdLineEnd"
export const LINE_CODE_PROP = "dataMdCode"

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])
/** Filhos de bloco de um item de lista (não entram no grupo de linhas do item). */
const BLOCK_TAGS = new Set(["p", "ul", "ol", "pre", "blockquote", "table", "div", "hr", "h1", "h2", "h3", "h4", "h5", "h6"])

export interface Group {
    start: number
    end: number
    /** Separadores originais antes do grupo (`\n`, `<br>`), mantidos fora do marcador da linha. */
    lead: HastNode[]
    nodes: HastNode[]
}

const isElement = (node: HastNode): node is HastElement => node.type === "element"
const isBlank = (nodes: HastNode[]) => nodes.every((node) => node.type === "text" && !node.value.trim())

function lineSpan(start: number, end: number, nodes: HastNode[], code = false): HastElement {
    const properties: Record<string, unknown> = { [LINE_PROP]: start, [LINE_END_PROP]: end }
    if (code) properties[LINE_CODE_PROP] = true
    return { type: "element", tagName: "span", properties, children: nodes }
}

/** Agrupa filhos inline por linha renderizada: só `<br>` (quebra forçada) encerra a linha. */
export function groupInline(children: HastNode[], fallbackLine: number): Group[] {
    const groups: Group[] = []
    let current: Group | null = null
    const open = (line: number, lead: HastNode[] = []) => {
        current = { start: line, end: line, lead, nodes: [] }
        groups.push(current)
        return current
    }
    const at = (line: number): Group => (current as Group | null) ?? open(line)
    let cursor = fallbackLine
    for (const child of children) {
        if (child.type === "text") {
            // Quebra simples (`\n` no texto) aparece como espaço: continua na mesma linha renderizada.
            const startLine = child.position?.start.line ?? cursor
            const group = at(startLine)
            group.nodes.push(child)
            // Texto sem posição (o `\n` que o remark-rehype põe entre elementos) não estende a linha.
            if (child.position) group.end = Math.max(group.end, child.position.end.line)
            cursor = group.end
            continue
        }
        if (isElement(child) && child.tagName === "br") {
            const line = child.position?.end.line ?? cursor + 1
            open(line, [child])
            cursor = line
            continue
        }
        const startLine = child.position?.start.line ?? cursor
        const group = at(startLine)
        group.nodes.push(child)
        group.end = Math.max(group.end, child.position?.end.line ?? startLine)
        cursor = group.end
    }
    return groups
}

/** Separadores + marcador de cada linha; espaços soltos (sem conteúdo) ficam como estavam. */
function emit(groups: Group[]): HastNode[] {
    return groups.flatMap((group) => [...group.lead, ...(isBlank(group.nodes) ? group.nodes : [lineSpan(group.start, group.end, group.nodes)])])
}

function wrapInline(element: HastElement) {
    const line = element.position?.start.line
    if (!line) return
    element.children = emit(groupInline(element.children, line))
}

/** Item de lista: só o conteúdo inline (texto, checkbox) vira linhas; sublistas e parágrafos seguem o próprio caminho. */
function wrapListItem(element: HastElement) {
    const line = element.position?.start.line
    if (!line) return
    const next: HastNode[] = []
    let inline: HastNode[] = []
    const flush = () => {
        if (inline.length) next.push(...emit(groupInline(inline, line)))
        inline = []
    }
    for (const child of element.children) {
        if (isElement(child) && BLOCK_TAGS.has(child.tagName)) {
            flush()
            next.push(child)
        } else inline.push(child)
    }
    flush()
    element.children = next
}

/** Linha de tabela: o conteúdo da última célula ganha o marcador da linha (o botão fica no fim da linha). */
function wrapTableRow(element: HastElement) {
    const line = element.position?.start.line
    if (!line) return
    const cells = element.children.filter(isElement).filter((cell) => cell.tagName === "td" || cell.tagName === "th")
    const last = cells[cells.length - 1]
    if (!last || isBlank(last.children)) return
    last.children = [lineSpan(line, line, last.children)]
}

/** Bloco de código: cada linha do fonte com conteúdo ganha o marcador; as quebras `\n` continuam no texto. */
function wrapCode(pre: HastElement, source: string[]) {
    const code = pre.children.find(isElement)
    const start = pre.position?.start.line
    if (!code || code.tagName !== "code" || !start) return
    if (!code.children.every((child) => child.type === "text")) return
    const fenced = /^\s{0,3}(`{3,}|~{3,})/.test(source[start - 1] ?? "")
    const first = start + (fenced ? 1 : 0)
    const text = code.children.map((child) => (child as HastText).value).join("")
    const nodes: HastNode[] = []
    text.split("\n").forEach((value, index) => {
        if (index > 0) nodes.push({ type: "text", value: "\n" })
        if (!value) return
        nodes.push(value.trim() ? lineSpan(first + index, first + index, [{ type: "text", value }], true) : { type: "text", value })
    })
    code.children = nodes
}

function walk(node: HastNode, source: string[]) {
    if (isElement(node)) {
        if (node.tagName === "pre") return wrapCode(node, source)
        if (node.tagName === "tr") return wrapTableRow(node)
        if (node.tagName === "p" || HEADINGS.has(node.tagName)) return wrapInline(node)
        if (node.tagName === "li") wrapListItem(node)
    }
    const children = "children" in node ? node.children : undefined
    children?.forEach((child) => walk(child, source))
}

export function rehypeLogicalLines() {
    return (tree: HastNode, file: { value?: unknown }) => {
        walk(tree, splitLines(typeof file.value === "string" ? file.value : String(file.value ?? "")))
    }
}
