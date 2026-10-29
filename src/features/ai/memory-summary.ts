/**
 * Uso "Resumo de memórias" (módulo PURO): instruções, interpretação da resposta do modelo e o resumo
 * de reserva quando a IA não está disponível. Copiado do uso "Resumo" do Ciliar.
 */

export interface FormattedMemory {
    texto: string
    resumo: string
}

export function buildSummaryInstructions(instructions: string, maxLength: number): string {
    return `${instructions.trim()}

Responda SOMENTE com um JSON, sem cercas de código, no formato:
{"texto": "<texto revisado>", "resumo": "<resumo de uma linha, no máximo ${maxLength} caracteres>"}`
}

/** Normaliza espaços sem perder as quebras de parágrafo. */
export function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

/** Corta em limite de palavra, com reticências (ex.: nunca "integraç…"). */
export function truncateAtWord(text: string, maxLength: number): string {
    const collapsed = text.replace(/\s+/g, " ").trim()
    if (collapsed.length <= maxLength) return collapsed
    const slice = collapsed.slice(0, maxLength - 1)
    const lastSpace = slice.lastIndexOf(" ")
    return `${(lastSpace > maxLength / 2 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`
}

/** Resumo de reserva: a primeira frase do texto, cortada no tamanho. */
export function fallbackSummary(text: string, maxLength: number): string {
    const first = normalizeText(text).split(/(?<=[.!?])\s|\n/)[0] ?? text
    return truncateAtWord(first.replace(/[.!?;:,]+$/, ""), maxLength)
}

function cleanLine(line: string): string {
    return line
        .replace(/^#+\s*/, "")
        .replace(/^[-*•]\s*/, "")
        .replace(/[*_`]/g, "")
        .trim()
}

/**
 * Interpreta a resposta do modelo (`{"texto","resumo"}`, tolerando cercas de código e texto em
 * volta). Sem JSON válido, `null` — quem chama usa o texto original e o resumo de reserva.
 */
export function parseFormattedMemory(raw: string, maxLength: number): FormattedMemory | null {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start < 0 || end <= start) return null
    try {
        const parsed = JSON.parse(raw.slice(start, end + 1)) as { texto?: unknown; resumo?: unknown }
        if (typeof parsed.texto !== "string" || typeof parsed.resumo !== "string") return null
        const texto = normalizeText(parsed.texto)
        const resumo = truncateAtWord(cleanLine(parsed.resumo.split("\n")[0] ?? ""), maxLength)
        if (!texto || !resumo) return null
        return { texto, resumo }
    } catch {
        return null
    }
}
