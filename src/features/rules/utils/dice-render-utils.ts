/**
 * @fileoverview Shared dice rendering utilities.
 *
 * Contains the Fuse.js instance and helpers for detecting dice notation and damage
 * type context from rich text. Used by both MentionContent (mention-badge.tsx) and
 * the RichTextEditor (rich-text-editor.tsx).
 */

import Fuse from "fuse.js"
import { damageTypeColors } from "@/lib/config/colors"
import type { DiceType } from "@/features/spells/types/spells.types"

export interface DiceColorOverride {
    text: string
    bgAlpha?: string
}

export interface DiceMatch {
    /** Parsed quantity, e.g. 2 for "2d6" */
    quantidade: number
    /** Parsed die type, e.g. "d6" */
    tipo: DiceType
    /** Optional flat bonus, e.g. 4 for "2d6 + 4" */
    bonus?: number
    /** Optional damage-type color override */
    colorOverride?: DiceColorOverride
    /** Hex color string if resolved */
    hex?: string
}

// ─── Fuse setup ──────────────────────────────────────────────────────────────

export const fuseData = Object.entries(damageTypeColors).flatMap(([id, config]) =>
    config.keys.map((key) => ({
        id,
        key,
        color: { text: config.text, bgAlpha: config.bgAlpha },
        hex: config.hex,
    })),
)

export const diceFuse = new Fuse(fuseData, {
    keys: ["key"],
    threshold: 0.25,
    ignoreLocation: true,
    minMatchCharLength: 4,
})

// ─── Unified regex ────────────────────────────────────────────────────────────

/**
 * Unified regex that matches:
 * - `NdX[type]`  — dice with bracket damage type (type is hidden, used for color)
 * - `NdX + N`    — dice with optional flat bonus modifier
 * - `NdX`        — plain dice notation
 * - `pontos de dano X` / `dano[s] [de] X` / `de dano[s] [de] X` — natural language damage description
 *
 * Groups: qty(1), faces(2), bracketType(3), bonus(4), naturalType(5)
 */
export const DICE_UNIFIED_REGEX =
    /(\d+)d(4|6|8|10|12|20|100)(?:\s*\[([^\]]+)\])?(?:\s*\+\s*(\d+))?|(?:pontos de dano|(?:de )?danos?) (?:de )?([a-zA-Záàâãéèêíïóôõöúçñ]+)/gi

/**
 * Regex used to look ahead for natural damage context right after a dice match.
 * Covers: `dano X`, `danos X`, `dano de X`, `danos de X`, `de dano X`,
 *         `de danos X`, `de dano de X`, `de danos de X`, `pontos de dano X`,
 *         `pontos de dano de X`.
 */
export const DICE_LOOKAHEAD_REGEX =
    /^\s*(?:(?:de\s+)?danos?(?:\s+de)?|pontos\s+de\s+dano(?:\s+de)?)\s+([a-zA-Záàâãéèêíïóôõöúçñ]+)/i

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the damage color override for a given type string.
 * Returns undefined if no match is found.
 */
export function getDiceColorOverride(typeStr: string): DiceColorOverride | undefined {
    const results = diceFuse.search(typeStr)
    if (results.length === 0) return undefined
    const item = results[0].item
    return { text: `text-[${item.hex}]`, bgAlpha: item.color.bgAlpha }
}

/**
 * Resolves the hex color for a given type string via Fuse.js.
 * Returns undefined if no match is found.
 */
export function getDiceHex(typeStr: string): string | undefined {
    const results = diceFuse.search(typeStr)
    return results.length > 0 ? results[0].item.hex : undefined
}

/**
 * Browser-safe HTML entity decoder.
 */
export function decodeHTMLEntities(text: string): string {
    if (typeof document === "undefined") return text.replace(/&amp;/g, "&")
    const textArea = document.createElement("textarea")
    textArea.innerHTML = text
    return textArea.value
}
