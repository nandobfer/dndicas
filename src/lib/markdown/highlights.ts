/**
 * Realces de trecho pela CSS Custom Highlight API (`::highlight(nome)`): pinta intervalos sem criar
 * elementos, então a renderização do Markdown não muda. Cada `Markdown` registra os seus intervalos
 * com um dono; sem suporte do navegador, nada acontece.
 *
 * O estilo é injetado em tempo de execução (e não no `globals.css`): o minificador de CSS do build
 * do Next não reconhece o pseudo-elemento `::highlight()` e falha.
 */

export const COMMENT_HIGHLIGHT = "md-line-comment"
export const FLASH_HIGHLIGHT = "md-line-flash"

const STYLE_ID = "md-highlight-styles"
export const HIGHLIGHT_CSS = [
    `::highlight(${COMMENT_HIGHLIGHT}) { background-color: hsl(var(--primary) / 0.14); text-decoration: underline; text-decoration-color: hsl(var(--primary) / 0.85); text-decoration-thickness: 2px; text-underline-offset: 3px; }`,
    `::highlight(${FLASH_HIGHLIGHT}) { background-color: hsl(var(--primary) / 0.4); }`,
].join("\n")

const owners = new Map<string, Map<object, Range[]>>()

export function supportsHighlights(): boolean {
    return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined"
}

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = HIGHLIGHT_CSS
    document.head.appendChild(style)
}

export function setHighlightRanges(name: string, owner: object, ranges: Range[]): void {
    if (!supportsHighlights()) return
    ensureStyles()
    const byOwner = owners.get(name) ?? new Map<object, Range[]>()
    if (ranges.length) byOwner.set(owner, ranges)
    else byOwner.delete(owner)
    owners.set(name, byOwner)
    const all = [...byOwner.values()].flat()
    if (all.length) CSS.highlights.set(name, new Highlight(...all))
    else CSS.highlights.delete(name)
}
