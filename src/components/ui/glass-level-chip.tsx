/**
 * @fileoverview Glass-styled level/circle chip for displaying feat levels or spell circles.
 * Supports rarity-based coloring and special handling for "Truque" (circle 0).
 *
 * @see specs/004-spells-catalog/plan.md - UI Component Architecture
 */

import { Chip } from './chip';
import { getLevelRarityVariant, getItemRarityVariant } from "@/lib/config/colors"

export interface GlassLevelChipProps {
    /** Level (1-20 for feats) or Circle (0-9 for spells) or Item Rarity (string) */
    level: number | string
    /** Type of content - affects display text */
    type?: "level" | "circle" | "rarity"
    /** Custom size variant */
    size?: "sm" | "md" | "lg"
    /** Custom class name */
    className?: string
}

/**
 * Glass Level Chip Component
 *
 * Displays level or circle with appropriate rarity color.
 * Automatically handles "Truque" label for circle 0.
 *
 * @example
 * ```tsx
 * // Feat level
 * <GlassLevelChip level={12} type="level" />
 * // Renders: "Nv. 12" with rare (blue) color
 *
 * // Spell circle
 * <GlassLevelChip level={0} type="circle" />
 * // Renders: "Truque" with common (gray) color
 *
 * // Spell circle 5
 * <GlassLevelChip level={5} type="circle" />
 * // Renders: "5º Círculo" with uncommon (green) color
 *
 * // Item Rarity
 * <GlassLevelChip level="raro" type="rarity" />
 * // Renders: "Raro" with rare (blue) color
 * ```
 */
export function GlassLevelChip({ level, type = "level", size = "md", className }: GlassLevelChipProps) {
    const variant = type === "rarity" ? getItemRarityVariant(level as string) : getLevelRarityVariant(level as number, type as "level" | "circle")

    // Generate display text
    const displayText = type === "rarity" ? (level as string).charAt(0).toUpperCase() + (level as string).slice(1) : type === "circle" ? (level === 0 ? "Truque" : `${level}º Círculo`) : `Nv. ${level}`

    return (
        <Chip variant={variant} size={size} className={className}>
            {displayText}
        </Chip>
    )
}
