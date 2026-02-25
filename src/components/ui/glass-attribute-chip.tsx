/**
 * @fileoverview Glass-styled attribute chip for displaying D&D attributes (Força, Destreza, etc.).
 * Uses configured attribute colors and abbreviations.
 *
 * @see specs/004-spells-catalog/plan.md - UI Component Architecture
 */

import { Chip } from './chip';
import { cn } from '@/core/utils';
import { attributeColors, type AttributeType } from '@/lib/config/colors';

export interface GlassAttributeChipProps {
  /** Attribute name (full or abbreviation) */
  attribute: AttributeType;
  /** Optional bonus value to display (e.g., +2) */
  bonus?: number;
  /** Custom size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom class name */
  className?: string;
}

/**
 * Glass Attribute Chip Component
 *
 * Displays D&D attribute with configured color scheme and abbreviation.
 * Optionally shows a bonus value (e.g., "FOR +2").
 *
 * Color mapping (from attributeColors config):
 * - Força → legendary (amber/gold)
 * - Destreza → uncommon (green)
 * - Constituição → artifact (red)
 * - Inteligência → rare (blue)
 * - Sabedoria → common (gray)
 * - Carisma → veryRare (purple)
 *
 * @example
 * ```tsx
 * // Basic attribute chip
 * <GlassAttributeChip attribute="Força" />
 * // Renders: "FOR" with amber color
 *
 * // With bonus
 * <GlassAttributeChip attribute="Destreza" bonus={2} />
 * // Renders: "DES +2" with green color
 *
 * // Small size for compact displays
 * <GlassAttributeChip attribute="Inteligência" size="sm" />
 * // Renders: "INT" with blue color in small size
 * ```
 */
export function GlassAttributeChip({
  attribute,
  bonus,
  size = 'sm',
  className,
}: GlassAttributeChipProps) {
  const config = attributeColors[attribute];

  if (!config) {
    // Fallback for unknown attributes
    return (
      <Chip size={size} className={cn('bg-white/10 text-white/70 border-white/10', className)}>
        {attribute.slice(0, 3).toUpperCase()}
        {bonus !== undefined && ` +${bonus}`}
      </Chip>
    );
  }

  return (
    <Chip
      size={size}
      className={cn(
        'text-[10px] py-0.5 px-1.5 h-auto border shrink-0',
        config.badge,
        config.border,
        className
      )}
    >
      {config.abbreviation}
      {bonus !== undefined && ` +${bonus}`}
    </Chip>
  );
}
