/**
 * @fileoverview Spell preview component for tooltip/popover display.
 * Shows spell details including circle, school, dice, description.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004
 */

"use client";

import { Wand, BookOpen, Info, Shield, Sparkles } from 'lucide-react';
import { GlassLevelChip } from '@/components/ui/glass-level-chip';
import { GlassSpellSchool } from '@/components/ui/glass-spell-school';
import { GlassAttributeChip } from '@/components/ui/glass-attribute-chip';
import { GlassDiceValue } from '@/components/ui/glass-dice-value';
import { GlassEmptyValue } from '@/components/ui/glass-empty-value';
import { Chip } from '@/components/ui/chip';
import { MentionContent } from '@/features/rules/components/mention-badge';
import { entityConfig } from "@/lib/config/colors"
import { cn } from '@/core/utils';
import type { Spell } from '../types/spells.types';

export interface SpellPreviewProps {
  /** Spell data to display */
  spell: Spell;
}

/**
 * Spell Preview Component
 *
 * Displays spell details in a preview card format.
 * Used in tooltips, popovers, and modals.
 *
 * Shows:
 * - Circle chip with rarity color ("Truque" for 0, "Nº Círculo" for 1-9)
 * - School chip with mapped color
 * - Save attribute (if applicable)
 * - Base dice value
 * - Extra dice per level (if applicable)
 * - Description with mention support
 * - Source
 *
 * @example
 * ```tsx
 * <SpellPreview spell={spellData} />
 * ```
 */
export function SpellPreview({ spell }: SpellPreviewProps) {
  return (
      <div className="space-y-4 min-w-[320px] max-w-[500px]">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                  <div className={cn("p-1.5 rounded-lg border", entityConfig.Magia.badge, entityConfig.Magia.border)}>
                      <Wand className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                      <h3 className="text-sm font-bold text-white leading-tight">{spell.name}</h3>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Magia D&D 5e</p>
                  </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                  <GlassLevelChip level={spell.circle} type="circle" size="sm" />
                  {spell.status === "inactive" && (
                      <Chip variant="common" size="sm" className="opacity-50">
                          Inativa
                      </Chip>
                  )}
              </div>
          </div>

          {/* School & Properties */}
          <div className="space-y-2 pb-2 border-b border-white/5">
              <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  <Sparkles className="h-3 w-3" />
                  <span>Propriedades</span>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                  {/* School */}
                  <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">Escola:</span>
                      <GlassSpellSchool school={spell.school} size="sm" />
                  </div>

                  {/* Save Attribute */}
                  {spell.saveAttribute && (
                      <div className="flex items-center gap-2">
                          <Shield className="h-3 w-3 text-white/40" />
                          <span className="text-xs text-white/50">Resistência:</span>
                          <GlassAttributeChip attribute={spell.saveAttribute} size="sm" />
                      </div>
                  )}
              </div>
          </div>

          {/* Dice Values */}
          {(spell.baseDice || spell.extraDicePerLevel) && (
              <div className="space-y-2 pb-2 border-b border-white/5">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      <Sparkles className="h-3 w-3" />
                      <span>Dados</span>
                  </div>
                  <div className="flex flex-col gap-2">
                      {/* Base Dice */}
                      {spell.baseDice ? (
                          <div className="flex items-center gap-2">
                              <span className="text-xs text-white/50 w-24">Dado Base:</span>
                              <GlassDiceValue value={spell.baseDice} />
                          </div>
                      ) : (
                          <div className="flex items-center gap-2">
                              <span className="text-xs text-white/50 w-24">Dado Base:</span>
                              <GlassEmptyValue />
                          </div>
                      )}

                      {/* Extra Dice Per Level */}
                      {spell.extraDicePerLevel ? (
                          <div className="flex items-center gap-2">
                              <span className="text-xs text-white/50 w-24">Por Nível:</span>
                              <GlassDiceValue value={spell.extraDicePerLevel} />
                          </div>
                      ) : (
                          <div className="flex items-center gap-2">
                              <span className="text-xs text-white/50 w-24">Por Nível:</span>
                              <GlassEmptyValue />
                          </div>
                      )}
                  </div>
              </div>
          )}

          {/* Description */}
          <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  <Info className="h-3 w-3" />
                  <span>Descrição</span>
              </div>
              <div className="text-sm text-white/80 leading-relaxed max-h-[200px] overflow-y-auto glass-scrollbar">
                  <MentionContent html={spell.description} mode="block" className="[&_p]:text-sm [&_p]:text-white/80 [&_ul]:text-sm [&_ol]:text-sm" />
              </div>
          </div>

          {/* Source */}
          {spell.source && (
              <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-white/40">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Fonte: {spell.source}</span>
              </div>
          )}
      </div>
  )
}
