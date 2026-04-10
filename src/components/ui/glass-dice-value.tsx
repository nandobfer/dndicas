/**
 * @fileoverview Glass-styled dice value display component.
 * Shows dice notation (e.g., "2d6") with icon and type-based coloring.
 *
 * @see specs/004-spells-catalog/plan.md - UI Component Architecture
 */

import { Dices } from 'lucide-react';
import { cn } from '@/core/utils';
import type { DiceValue, DiceType } from '@/features/spells/types/spells.types';
import { diceColors } from '@/lib/config/colors';

export interface GlassDiceValueProps {
    /** Dice value object with quantidade and tipo */
    value: DiceValue
    /** Show dice icon */
    showIcon?: boolean
    /** Flat bonus to display alongside the dice notation, e.g. 4 for "1d6 + 4" */
    bonus?: number
    /** Custom color configuration (overrides default dice type color) */
    colorOverride?: {
        text: string
        bgAlpha?: string
    }
    /** Custom class name */
    className?: string
}

/**
 * Glass Dice Value Component
 *
 * Displays dice notation with colored styling based on dice type.
 * Format: "2d6" or "1d20" with optional dice icon.
 *
 * Color mapping (from diceColors config):
 * - d4 → common (gray)
 * - d6 → uncommon (green)
 * - d8 → rare (blue)
 * - d10 → veryRare (purple)
 * - d12 → legendary (gold)
 * - d20 → artifact (red)
 *
 * @example
 * ```tsx
 * // Basic dice value
 * <GlassDiceValue value={{ quantidade: 2, tipo: 'd6' }} />
 * // Renders: "2d6" with green color
 *
 * // With custom damage color override
 * <GlassDiceValue value={{ quantidade: 1, tipo: 'd8' }} colorOverride={{ text: 'text-orange-500' }} />
 * ```
 */
export function GlassDiceValue({ value, showIcon = true, bonus, colorOverride, className }: GlassDiceValueProps) {
    const colorConfig = colorOverride || diceColors[value.tipo as DiceType]
    const notation = bonus !== undefined
        ? `${value.quantidade}${value.tipo} + ${bonus}`
        : `${value.quantidade}${value.tipo}`

    // Use inline style for text color if hex is provided to avoid Tailwind JIT issues with arbitrary values in strings
    const isCustomHex = colorOverride?.text?.includes("#")
    const customTextColor = isCustomHex ? colorOverride!.text.match(/#(?:[0-9a-fA-F]{3}){1,2}/)?.[0] : undefined

    return (
        <span
            className={cn("inline-flex items-center gap-1.5 transition-colors", !isCustomHex && (colorConfig?.text || "text-white/70"), className)}
            style={customTextColor ? { color: customTextColor } : undefined}
        >
            {showIcon && <Dices className="w-3.5 h-3.5" />}
            <span className="text-sm font-medium">{notation}</span>
        </span>
    )
}
