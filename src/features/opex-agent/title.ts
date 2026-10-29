import { OPEX_DEFAULT_TITLE, OPEX_SUMMARY_MAX, OPEX_TITLE_MAX } from "./constants"
import { opexTitleOutputSchema } from "./schemas"

/** Corta no limite sem quebrar palavra (com reticências). */
export function clampWords(text: string, max: number): string {
    const clean = text.replace(/\s+/g, " ").trim()
    if (clean.length <= max) return clean
    const cut = clean.slice(0, max - 1)
    const space = cut.lastIndexOf(" ")
    return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, "")}…`
}

/** Lê o JSON do subagente (aceita cercas de código e texto ao redor). */
export function parseTitleOutput(text: string): { title: string; summary: string } | null {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start < 0 || end <= start) return null
    try {
        const parsed = opexTitleOutputSchema.safeParse(JSON.parse(text.slice(start, end + 1)))
        if (!parsed.success) return null
        const title = clampWords(parsed.data.title.replace(/^["'“”]+|["'“”.]+$/g, ""), OPEX_TITLE_MAX)
        if (!title) return null
        return { title, summary: clampWords(parsed.data.summary, OPEX_SUMMARY_MAX) }
    } catch {
        return null
    }
}

/** Título de reserva: o começo da primeira mensagem do usuário. */
export function fallbackTitle(userText: string): string {
    return clampWords(userText, OPEX_TITLE_MAX) || OPEX_DEFAULT_TITLE
}
