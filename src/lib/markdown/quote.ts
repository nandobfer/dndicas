/** Citação em Markdown (`> linha`) de um texto, linha a linha. */
export function toQuote(text: string): string {
    return text
        .split("\n")
        .map((line) => `> ${line}`.trimEnd())
        .join("\n")
}

/**
 * Insere a citação de `text` na posição `position` de `value`, sem apagar o que já foi digitado:
 * separa por linha em branco do texto anterior e deixa uma linha em branco depois (cursor ali).
 */
export function insertQuote(value: string, position: number, text: string): { value: string; cursor: number } {
    const at = Math.max(0, Math.min(position, value.length))
    const before = value.slice(0, at)
    const after = value.slice(at).replace(/^\n+/, "")
    const lead = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n"
    const inserted = `${lead}${toQuote(text)}\n\n`
    return { value: `${before}${inserted}${after}`, cursor: before.length + inserted.length }
}
