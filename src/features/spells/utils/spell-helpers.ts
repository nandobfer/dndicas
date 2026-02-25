/**
 * @fileoverview Helper functions for spell formatting and display.
 *
 * @see specs/004-spells-catalog/spec.md - FR-011, FR-012, FR-013
 */

import { SpellSchool, AttributeType, DiceType } from '../types/spells.types';
import { spellSchoolColors, diceColors } from '@/lib/config/colors';

/**
 * Formats a spell circle number into a human-readable label.
 * Circle 0 is "Truque".
 * Circles 1-9 are "1º Círculo", etc.
 */
export function formatCircle(circle: number): string {
  if (circle === 0) return "Truque";
  return `${circle}º Círculo`;
}

/**
 * Maps a spell school to its designated rarity color key.
 */
export function getSchoolColor(school: SpellSchool) {
  return spellSchoolColors[school] || 'common';
}

/**
 * Maps a dice type to its designated rarity color and styles.
 */
export function getDiceColor(type: DiceType) {
  return diceColors[type] || diceColors.d4;
}

/**
 * Formats a dice value into a notation string like "2d6".
 */
export function formatDiceValue(quantidade: number, tipo: string): string {
  if (!quantidade || !tipo) return "—";
  return `${quantidade}${tipo}`;
}
