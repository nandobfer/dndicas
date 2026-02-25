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
  value: DiceValue;
  /** Show dice icon */
  showIcon?: boolean;
  /** Custom class name */
  className?: string;
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
 * // With icon
 * <GlassDiceValue value={{ quantidade: 1, tipo: 'd20' }} showIcon />
 * // Renders: <DiceIcon> "1d20" with red color
 *
 * // Custom styling
 * <GlassDiceValue
 *   value={{ quantidade: 3, tipo: 'd8' }}
 *   className="text-base font-bold"
 * />
 * ```
 */
export function GlassDiceValue({
  value,
  showIcon = true,
  className,
}: GlassDiceValueProps) {
  const colorConfig = diceColors[value.tipo as DiceType];
  const notation = `${value.quantidade}${value.tipo}`;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5',
        colorConfig?.text || 'text-white/70',
        className
      )}
    >
      {showIcon && <Dices className="w-3.5 h-3.5" />}
      <span className="text-sm font-medium">{notation}</span>
    </div>
  );
}
