/**
 * Defesa contra a narração reescrita (DND-52). Com várias etapas de ferramentas, o modelo às vezes escreve a cena, chama uma
 * ferramenta (ex.: `update_campaign_state`) e reescreve tudo na etapa seguinte; os dois textos chegavam somados na mesma
 * mensagem. Aqui, quando um parágrafo repete (igual ou quase igual) um anterior, a versão antiga sai junto com o que veio
 * entre as duas, e fica a reescrita, escrita depois das ferramentas. Puro: roda no servidor e na tela ao vivo.
 */

/** Semelhança mínima (Dice sobre pares de palavras) para tratar dois parágrafos como versões do mesmo texto. */
export const MADDOX_REWRITE_SIMILARITY = 0.5
/** Abaixo deste número de pares de palavras, só conta como repetição o parágrafo igual depois de normalizado. */
const MIN_PAIRS = 6

const PARAGRAPH_BREAK = /\n[ \t]*\n/

function words(paragraph: string): string[] {
    return paragraph
        .replace(/\{\{[^:}]*:([^}]*)\}\}/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(" ")
        .filter(Boolean)
}

function pairs(list: string[]): Set<string> {
    const result = new Set<string>()
    for (let index = 0; index < list.length - 1; index += 1) result.add(`${list[index]} ${list[index + 1]}`)
    return result
}

interface Shape {
    normalized: string
    pairs: Set<string>
}

function shapeOf(paragraph: string): Shape {
    const list = words(paragraph)
    return { normalized: list.join(" "), pairs: pairs(list) }
}

/** Dois parágrafos são versões do mesmo texto: iguais depois de normalizados ou, se longos, com Dice ≥ o limite. */
export function sameParagraph(a: string, b: string): boolean {
    return similar(shapeOf(a), shapeOf(b))
}

function similar(a: Shape, b: Shape): boolean {
    if (!a.normalized || !b.normalized) return false
    if (a.normalized === b.normalized) return true
    if (a.pairs.size < MIN_PAIRS || b.pairs.size < MIN_PAIRS) return false
    let shared = 0
    for (const pair of a.pairs) if (b.pairs.has(pair)) shared += 1
    return (2 * shared) / (a.pairs.size + b.pairs.size) >= MADDOX_REWRITE_SIMILARITY
}

/**
 * Tira a primeira versão de cada trecho reescrito: se o parágrafo `j` repete o parágrafo `i` (i < j), saem os parágrafos de
 * `i` até `j - 1`. Repete até não sobrar repetição. Devolve o texto (os parágrafos que ficaram, juntados por linha em branco;
 * a quebra no fim continua, para o texto ao vivo seguir no parágrafo novo) e quantos parágrafos saíram; sem repetição, o
 * texto volta intacto.
 */
export function dropRewrittenParagraphs(text: string): { text: string; dropped: number } {
    const parts = text.split(PARAGRAPH_BREAK)
    let kept = parts.map((raw) => ({ raw, shape: shapeOf(raw) }))
    let dropped = 0
    for (;;) {
        let cut: { from: number; to: number } | null = null
        for (let later = 1; later < kept.length && !cut; later += 1) {
            for (let earlier = 0; earlier < later; earlier += 1) {
                if (similar(kept[earlier].shape, kept[later].shape)) {
                    cut = { from: earlier, to: later }
                    break
                }
            }
        }
        if (!cut) break
        const removed = kept.slice(cut.from, cut.to).filter((item) => item.shape.normalized).length
        dropped += removed
        kept = [...kept.slice(0, cut.from), ...kept.slice(cut.to)]
    }
    if (!dropped) return { text, dropped: 0 }
    return { text: kept.map((item) => item.raw).join("\n\n"), dropped }
}
