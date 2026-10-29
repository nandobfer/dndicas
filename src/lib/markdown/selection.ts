/**
 * Seleção de texto num `Markdown` com ação por linha: liga a seleção do navegador às linhas
 * renderizadas (`[data-md-line]`, ver `rehype-logical-lines`) e, no caminho inverso, reencontra um
 * trecho salvo dentro da linha (para o sublinhado e o flash). Só DOM, sem React.
 */

export const LINE_SELECTOR = "[data-md-line]"
export const LINE_ACTION_SELECTOR = "[data-md-line-action]"

/** Trecho selecionado: texto como aparece na tela, quantas linhas cobre e qual ocorrência na 1ª linha. */
export interface MarkdownSelection {
    text: string
    /** Linhas renderizadas cobertas (1 = só a linha âncora). */
    lines: number
    /** Ocorrência (0 = primeira) do começo do trecho dentro da primeira linha. */
    occurrence: number
    /** Linha do texto-fonte onde o trecho começa. */
    startLine: number
}

export interface SelectedLines {
    /** Última linha coberta: onde o comentário fica ancorado. */
    anchor: HTMLElement
    first: HTMLElement
    range: Range
    selection: MarkdownSelection
}

const flat = (text: string) => text.replace(/\s+/g, " ")

/** Texto de cada linha selecionada sem espaços repetidos; linhas vazias saem. */
export function normalizeSelectedText(raw: string): string {
    return raw
        .split(/\n/)
        .map((line) => flat(line).trim())
        .filter(Boolean)
        .join("\n")
}

/** Começo do trecho usado para achá-lo na primeira linha (o texto todo quando é uma linha só). */
export function selectionNeedle(selection: Pick<MarkdownSelection, "text" | "lines">): string {
    return flat(selection.lines === 1 ? selection.text : (selection.text.split("\n")[0] ?? "")).trim()
}

export function countOccurrences(haystack: string, needle: string): number {
    if (!needle) return 0
    let count = 0
    let index = haystack.indexOf(needle)
    while (index !== -1) {
        count++
        index = haystack.indexOf(needle, index + needle.length)
    }
    return count
}

/** Nós de texto de `root`, sem os dos botões de ação (badge). */
function textNodes(root: Node): Text[] {
    const doc = root.ownerDocument ?? document
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (node.parentElement?.closest(LINE_ACTION_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    })
    const nodes: Text[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)
    return nodes
}

/** Texto coberto pelo intervalo, ignorando os botões de ação. */
export function rangeText(range: Range): string {
    const container = range.commonAncestorContainer
    const scope = container.nodeType === Node.TEXT_NODE ? (container.parentNode ?? container) : container
    if (container.nodeType === Node.TEXT_NODE && (container.parentElement?.closest(LINE_ACTION_SELECTOR) ?? null)) return ""
    let text = ""
    for (const node of textNodes(scope)) {
        if (!range.intersectsNode(node)) continue
        const start = node === range.startContainer ? range.startOffset : 0
        const end = node === range.endContainer ? range.endOffset : node.data.length
        text += node.data.slice(start, end)
    }
    return text
}

export function lineElements(root: ParentNode): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(LINE_SELECTOR))
}

/** Parte do intervalo dentro de `element`. */
function clampTo(range: Range, element: Node): Range {
    const doc = element.ownerDocument ?? document
    const part = doc.createRange()
    part.selectNodeContents(element)
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset)
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset)
    return part
}

/**
 * Seleção atual dentro de `root`: corta o que estiver fora, liga às linhas cobertas (com texto
 * selecionado de fato) e calcula a ocorrência. `null` quando vazia ou fora das linhas.
 */
export function readSelection(root: HTMLElement, selection: Selection | null): SelectedLines | null {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
    const original = selection.getRangeAt(0)
    if (!original.intersectsNode(root)) return null
    const range = original.cloneRange()
    if (!root.contains(range.startContainer)) range.setStart(root, 0)
    if (!root.contains(range.endContainer)) range.setEnd(root, root.childNodes.length)
    let lines = lineElements(root).filter((element) => range.intersectsNode(element) && rangeText(clampTo(range, element)).trim())
    if (!lines.length) {
        // Linha de tabela: só a última célula tem o marcador da linha.
        const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
        const row = start?.closest("tr")
        const marked = row && root.contains(row) ? row.querySelector<HTMLElement>(LINE_SELECTOR) : null
        lines = marked ? [marked] : []
    }
    const first = lines[0]
    const anchor = lines[lines.length - 1]
    if (!first || !anchor) return null
    const text = normalizeSelectedText(rangeText(range))
    if (!text) return null
    const partial: Pick<MarkdownSelection, "text" | "lines"> = { text, lines: lines.length }
    const prefix = (first.ownerDocument ?? document).createRange()
    prefix.selectNodeContents(first)
    if (prefix.comparePoint(range.startContainer, range.startOffset) === 0) prefix.setEnd(range.startContainer, range.startOffset)
    else prefix.collapse(true)
    const occurrence = countOccurrences(flat(rangeText(prefix)), selectionNeedle(partial))
    return { anchor, first, range, selection: { ...partial, occurrence, startLine: Number(first.dataset.mdLine) || 0 } }
}

/** Intervalo da `occurrence`-ésima ocorrência de `needle` no texto de `element` (espaços colapsados). */
export function findTextRange(element: HTMLElement, needle: string, occurrence = 0, fromEnd = false): Range | null {
    const target = flat(needle).trim()
    if (!target) return null
    const map: { node: Text; offset: number }[] = []
    let text = ""
    let space = false
    for (const node of textNodes(element)) {
        for (let offset = 0; offset < node.data.length; offset++) {
            const isSpace = /\s/.test(node.data[offset]!)
            if (isSpace && space) continue
            text += isSpace ? " " : node.data[offset]
            space = isSpace
            map.push({ node, offset })
        }
    }
    let index = fromEnd ? text.lastIndexOf(target) : text.indexOf(target)
    for (let skip = 0; !fromEnd && skip < occurrence && index !== -1; skip++) index = text.indexOf(target, index + target.length)
    if (index === -1) return null
    const start = map[index]!
    const end = map[index + target.length - 1]!
    const range = (element.ownerDocument ?? document).createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset + 1)
    return range
}

/** Reencontra um trecho salvo a partir da linha âncora (`null` se o texto mudou e ele sumiu). */
export function selectionRange(root: HTMLElement, anchor: HTMLElement, selection: Pick<MarkdownSelection, "text" | "lines" | "occurrence">): Range | null {
    const elements = lineElements(root)
    const index = elements.indexOf(anchor)
    const first = index >= 0 ? (elements[Math.max(0, index - selection.lines + 1)] ?? anchor) : anchor
    const start = findTextRange(first, selectionNeedle(selection), selection.occurrence)
    if (!start) return null
    if (selection.lines === 1) return start
    const last = selection.text.split("\n").at(-1) ?? ""
    const end = findTextRange(anchor, last, 0, true)
    const range = start.cloneRange()
    if (end) range.setEnd(end.endContainer, end.endOffset)
    else range.setEnd(anchor, anchor.childNodes.length)
    return range
}

/** Retângulo do fim do intervalo (onde fica o botão flutuante); `null` sem layout (ex.: jsdom). */
export function rangeEndRect(range: Range): DOMRect | null {
    if (typeof range.getClientRects !== "function") return null
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width || rect.height)
    return rects[rects.length - 1] ?? (typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null)
}

/** Ponto do documento sob o cursor (para clicar num trecho sublinhado). */
export function caretAt(x: number, y: number): { node: Node; offset: number } | null {
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null }
    const position = doc.caretPositionFromPoint?.(x, y)
    if (position) return { node: position.offsetNode, offset: position.offset }
    const range = doc.caretRangeFromPoint?.(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
}
