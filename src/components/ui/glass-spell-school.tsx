/**
 * @fileoverview Glass-styled spell school chip component.
 * Displays D&D spell schools with mapped rarity colors.
 *
 * @see specs/004-spells-catalog/plan.md - UI Component Architecture
 * @see specs/004-spells-catalog/research.md - School-to-color mapping
 */

import { Chip } from './chip';
import type { RarityColor } from '@/lib/config/colors';
import { spellSchoolColors, type SpellSchool } from '@/lib/config/colors';

export interface GlassSpellSchoolProps {
  /** Spell school name */
  school: SpellSchool;
  /** Custom size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom class name */
  className?: string;
}

/**
 * Glass Spell School Component
 *
 * Displays D&D spell school with configured rarity color mapping.
 *
 * Color mapping (from spellSchoolColors config):
 * - Abjuração → rare (blue)
 * - Adivinhação → legendary (gold)
 * - Conjuração → uncommon (green)
 * - Encantamento → veryRare (purple)
 * - Evocação → artifact (red)
 * - Ilusão → common (gray)
 * - Necromancia → veryRare (purple)
 * - Transmutação → uncommon (green)
 *
 * @example
 * ```tsx
 * // Basic school chip
 * <GlassSpellSchool school="Evocação" />
 * // Renders: "Evocação" with red (artifact) color
 *
 * // Small size
 * <GlassSpellSchool school="Abjuração" size="sm" />
 * // Renders: "Abjuração" with blue (rare) color in small size
 *
 * // Custom styling
 * <GlassSpellSchool
 *   school="Necromancia"
 *   className="font-bold"
 * />
 * ```
 */
export function GlassSpellSchool({
  school,
  size = 'md',
  className,
}: GlassSpellSchoolProps) {
  const variant = spellSchoolColors[school] || 'common';

  return (
    <Chip variant={variant} size={size} className={className}>
      {school}
    </Chip>
  );
}
