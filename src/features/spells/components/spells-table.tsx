/**
 * @fileoverview Spells table component with formatted chips and preview.
 * Displays paginated spell list with glassmorphism styling.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004
 */

"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { MoreHorizontal, Pencil, Trash2, Wand, Eye } from 'lucide-react';
import { useAuth } from '@/core/hooks/useAuth';
import { cn } from '@/core/utils';
import { GlassCard } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import {
  GlassDropdownMenu,
  GlassDropdownMenuContent,
  GlassDropdownMenuItem,
  GlassDropdownMenuTrigger,
} from '@/components/ui/glass-dropdown-menu';
import { GlassLevelChip } from '@/components/ui/glass-level-chip';
import { GlassSpellSchool } from '@/components/ui/glass-spell-school';
import { GlassAttributeChip } from '@/components/ui/glass-attribute-chip';
import { GlassDiceValue } from '@/components/ui/glass-dice-value';
import { GlassEmptyValue } from '@/components/ui/glass-empty-value';
import { SimpleGlassTooltip, GlassTooltipProvider } from "@/components/ui/glass-tooltip"
import { EntityPreviewTooltip } from "@/features/rules/components/entity-preview-tooltip"
import { motionConfig } from "@/lib/config/motion-configs"
import { spellComponentConfig } from "@/lib/config/colors"
import type { Spell } from "../types/spells.types"

const spellStatusVariantMap: Record<string, "uncommon" | "common"> = {
    active: "uncommon",
    inactive: "common",
}

export interface SpellsTableProps {
    /** Array of spells to display */
    spells: Spell[]
    /** Total number of spells (for pagination) */
    total: number
    /** Current page number */
    page: number
    /** Items per page */
    limit: number
    /** Loading state */
    isLoading?: boolean
    /** Whether filters are currently active */
    hasActiveFilters?: boolean
    /** Edit handler (admin only) */
    onEdit: (spell: Spell) => void
    /** Delete handler (admin only) */
    onDelete: (spell: Spell) => void
    /** Page change handler */
    onPageChange: (page: number) => void
}

/**
 * Spells Table Component
 *
 * Displays a paginated table of spells with:
 * - Status chip (admin only)
 * - Circle chip with rarity color
 * - Spell name
 * - School chip with mapped color
 * - Save attribute chip
 * - Base dice display
 * - Extra dice per level display
 * - Description preview
 * - Preview button with tooltip
 * - Actions dropdown (admin only)
 *
 * @example
 * ```tsx
 * <SpellsTable
 *   spells={data?.spells || []}
 *   total={data?.total || 0}
 *   page={page}
 *   limit={limit}
 *   isLoading={isLoading}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 *   onPageChange={setPage}
 * />
 * ```
 */
export function SpellsTable({ spells, total, page, limit, isLoading = false, hasActiveFilters = false, onEdit, onDelete, onPageChange }: SpellsTableProps) {
    const { isAdmin } = useAuth()
    const totalPages = Math.ceil(total / limit)

    if (isLoading && spells.length === 0) {
        return (
            <GlassCard className="p-12 flex justify-center">
                <LoadingState variant="spinner" message="Carregando magias..." />
            </GlassCard>
        )
    }

    if (!isLoading && spells.length === 0) {
        return (
            <GlassCard className="p-12">
                <EmptyState
                    title="Nenhuma magia encontrada"
                    description={
                        hasActiveFilters
                            ? "Nenhuma magia corresponde aos filtros aplicados. Tente ajustar ou limpar os filtros."
                            : "Nenhuma magia cadastrada ainda. Clique em 'Nova Magia' para começar."
                    }
                    icon={Wand}
                />
            </GlassCard>
        )
        {
            /* Result Count */
        }
        {
            total > 0 && (
                <div className="px-6 py-3 border-b border-white/5 bg-white/5">
                    <p className="text-sm text-white/60">
                        {hasActiveFilters ? (
                            <>
                                Encontrada{total === 1 ? "" : "s"} <span className="font-medium text-white">{total}</span> magia{total === 1 ? "" : "s"} com os filtros aplicados
                            </>
                        ) : (
                            <>
                                Total de <span className="font-medium text-white">{total}</span> magia{total === 1 ? "" : "s"} cadastrada{total === 1 ? "" : "s"}
                            </>
                        )}
                    </p>
                </div>
            )
        }
    }

    return (
        <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/5 bg-white/5">
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Status</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[120px]">Círculo</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[140px]">Escola</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[200px]">Componentes</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[120px]">Resistência</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Dado Base</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Por Nível</th>
                            <th className="px-6 py-4 text-center text-xs font-semibold text-white/50 uppercase tracking-wider w-[80px]">Preview</th>
                            {isAdmin && <th className="px-6 py-4 text-right text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Ações</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout">
                            {spells.map((spell, index) => (
                                <motion.tr
                                    key={spell._id}
                                    variants={motionConfig.variants.tableRow}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ delay: index * 0.05 }}
                                    className="group hover:bg-white/5 transition-colors"
                                >
                                    {/* Status */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <Chip variant={spellStatusVariantMap[spell.status] || "common"}>{spell.status === "active" ? "Ativo" : "Inativo"}</Chip>
                                    </td>

                                    {/* Circle */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <GlassLevelChip level={spell.circle} type="circle" />
                                    </td>

                                    {/* School */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <GlassSpellSchool school={spell.school} />
                                    </td>

                                    {/* Name */}
                                    <td className="px-6 py-4 whitespace-nowrap text-white font-medium">{spell.name}</td>

                                    {/* Components */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <GlassTooltipProvider>
                                            <div className="flex flex-wrap gap-1">
                                                {spell.component?.length > 0 ? (
                                                    spell.component.map((comp) => (
                                                        <SimpleGlassTooltip key={comp} content={comp} side="top">
                                                            <div
                                                                className={cn(
                                                                    "w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold border cursor-help transition-all hover:scale-110",
                                                                    spellComponentConfig[comp as keyof typeof spellComponentConfig]?.badge || "bg-white/10 text-white/60",
                                                                    spellComponentConfig[comp as keyof typeof spellComponentConfig]?.border || "border-white/10",
                                                                )}
                                                            >
                                                                {comp.charAt(0)}
                                                            </div>
                                                        </SimpleGlassTooltip>
                                                    ))
                                                ) : (
                                                    <GlassEmptyValue />
                                                )}
                                            </div>
                                        </GlassTooltipProvider>
                                    </td>

                                    {/* Save Attribute */}
                                    <td className="px-6 py-4 whitespace-nowrap">{spell.saveAttribute ? <GlassAttributeChip attribute={spell.saveAttribute} /> : <GlassEmptyValue />}</td>

                                    {/* Base Dice */}
                                    <td className="px-6 py-4 whitespace-nowrap">{spell.baseDice ? <GlassDiceValue value={spell.baseDice} /> : <GlassEmptyValue />}</td>

                                    {/* Extra Dice Per Level */}
                                    <td className="px-6 py-4 whitespace-nowrap">{spell.extraDicePerLevel ? <GlassDiceValue value={spell.extraDicePerLevel} /> : <GlassEmptyValue />}</td>

                                    {/* Preview */}
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <EntityPreviewTooltip entityId={spell._id} entityType="Magia">
                                            <button className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </EntityPreviewTooltip>
                                    </td>

                                    {/* Actions (Admin Only) */}
                                    {isAdmin && (
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <GlassDropdownMenu>
                                                <GlassDropdownMenuTrigger asChild>
                                                    <button className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </button>
                                                </GlassDropdownMenuTrigger>
                                                <GlassDropdownMenuContent align="end">
                                                    <GlassDropdownMenuItem onClick={() => onEdit(spell)}>
                                                        <Pencil className="mr-2 h-4 w-4" />
                                                        Editar
                                                    </GlassDropdownMenuItem>
                                                    <GlassDropdownMenuItem onClick={() => onDelete(spell)} className="text-red-400 hover:text-red-300 focus:text-red-300">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Excluir
                                                    </GlassDropdownMenuItem>
                                                </GlassDropdownMenuContent>
                                            </GlassDropdownMenu>
                                        </td>
                                    )}
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-white/5">
                <DataTablePagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={onPageChange} itemLabel="magias" />
            </div>
        </GlassCard>
    )
}
