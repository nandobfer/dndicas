/**
 * Extracts the book name from a raw source string.
 * Handles variations: "pág.", "pag.", "pg." (with or without trailing dot/space).
 *
 * Examples:
 *   "LDJ pág. 42"   → "LDJ"
 *   "LDJ pag. 10"   → "LDJ"
 *   "LDJ pg. 5"     → "LDJ"
 *   "Mordenkainen Apresenta pág. 100" → "Mordenkainen Apresenta"
 */
export const extractBookName = (source: string): string =>
    source.split(/\s+p(?:á|a)?g\.?\s*/i)[0].trim()

/**
 * Maps internal book abbreviations/identifiers to their display names.
 * Add new entries here as new books are registered in the system.
 */
export const BOOK_DISPLAY_NAMES: Record<string, string> = {
    LDJ: "Livro do Jogador",
}

/**
 * Returns the display-friendly name for a book value.
 * Falls back to the original value if no mapping exists.
 */
export const getBookDisplayName = (value: string): string =>
    BOOK_DISPLAY_NAMES[value] ?? value
