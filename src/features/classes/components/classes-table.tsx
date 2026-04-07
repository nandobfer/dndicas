"use client";

import { motion, AnimatePresence } from "framer-motion"
import { MoreHorizontal, Pencil, Trash2, GraduationCap, Sword, TableProperties } from "lucide-react"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"
import { GlassCard } from "@/components/ui/glass-card"
import { Chip } from "@/components/ui/chip"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import {
    GlassDropdownMenu,
    GlassDropdownMenuContent,
    GlassDropdownMenuItem,
    GlassDropdownMenuTrigger,
} from "@/components/ui/glass-dropdown-menu"
import { GlassEmptyValue } from "@/components/ui/glass-empty-value"
import { GlassPopover, GlassPopoverTrigger, GlassPopoverContent } from "@/components/ui/glass-popover"
import { EntityTitleLink } from "@/features/rules/components/entity-title-link"
import { motionConfig } from "@/lib/config/motion-configs"
import { diceColors } from "@/lib/config/colors"
import { ClassProgressionTable } from "./class-progression-table"
import type { CharacterClass } from "../types/classes.types"

const classStatusVariantMap: Record<string, "uncommon" | "common"> = {
    active: "uncommon",
    inactive: "common",
}

const spellcastingColorMap: Record<string, string> = {
    true: "text-amber-400",
    false: "text-slate-400",
}

export interface ClassesTableProps {
    classes: CharacterClass[]
    total: number
    page: number
    limit: number
    isLoading?: boolean
    hasActiveFilters?: boolean
    onEdit: (characterClass: CharacterClass) => void
    onDelete: (characterClass: CharacterClass) => void
    onPageChange: (page: number) => void
}

export function ClassesTable({ classes, total, page, limit, isLoading = false, hasActiveFilters = false, onEdit, onDelete, onPageChange }: ClassesTableProps) {
    const { isAdmin } = useAuth()
    const totalPages = Math.ceil(total / limit)

    if (isLoading && classes.length === 0) {
        return (
            <GlassCard className="p-12 flex justify-center">
                <LoadingState variant="spinner" message="Carregando classes..." />
            </GlassCard>
        )
    }

    if (!isLoading && classes.length === 0) {
        return (
            <GlassCard className="p-12">
                <EmptyState
                    title="Nenhuma classe encontrada"
                    description={
                        hasActiveFilters
                            ? "Nenhuma classe corresponde aos filtros aplicados. Tente ajustar ou limpar os filtros."
                            : "Nenhuma classe cadastrada ainda. Clique em 'Nova Classe' para começar."
                    }
                    icon={GraduationCap}
                />
            </GlassCard>
        )
    }

    return (
        <GlassCard className="overflow-hidden">
            {/* Result count */}
            {total > 0 && (
                <div className="px-6 py-3 border-b border-white/5 bg-white/5">
                    <p className="text-sm text-white/60">
                        {hasActiveFilters ? (
                            <>
                                Encontrada{total === 1 ? "" : "s"} <span className="font-medium text-white">{total}</span> classe{total === 1 ? "" : "s"} com os filtros aplicados
                            </>
                        ) : (
                            <>
                                Total de <span className="font-medium text-white">{total}</span> classe{total === 1 ? "" : "s"} cadastrada{total === 1 ? "" : "s"}
                            </>
                        )}
                    </p>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/5 bg-white/5">
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Status</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[80px]">Dado</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">
                                <div className="flex items-center gap-1.5">
                                    <Sword className="h-3 w-3" />
                                    Nome
                                </div>
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[120px]">Conjuração</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Subclasses</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[120px]">Fonte</th>
                            <th className="px-6 py-4 text-center text-xs font-semibold text-white/50 uppercase tracking-wider w-[60px]">Prog.</th>
                            {isAdmin && <th className="px-6 py-4 text-right text-xs font-semibold text-white/50 uppercase tracking-wider w-[80px]">Ações</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence>
                            {classes.map((c, index) => {
                                const diceColor = diceColors[c.hitDice as keyof typeof diceColors]
                                return (
                                    <motion.tr
                                        key={c._id}
                                        variants={motionConfig.variants.fadeInUp}
                                        initial="initial"
                                        animate="animate"
                                        exit={{ opacity: 0 }}
                                        transition={{ delay: index * 0.02 }}
                                        className="hover:bg-white/3 group"
                                    >
                                        {/* Status */}
                                        <td className="px-6 py-4">
                                            <Chip variant={classStatusVariantMap[c.status] || "common"} size="sm">
                                                {c.status === "active" ? "Ativo" : "Inativo"}
                                            </Chip>
                                        </td>

                                        {/* Hit Dice */}
                                        <td className="px-6 py-4">
                                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-bold", diceColor?.bg, diceColor?.text)}>{c.hitDice}</span>
                                        </td>

                                        {/* Name */}
                                        <td className="px-6 py-4">
                                            <EntityTitleLink name={c.name} entityType="Classe" />
                                        </td>

                                        {/* Spellcasting */}
                                        <td className="px-6 py-4">
                                            <span className={cn("text-sm font-medium", spellcastingColorMap[String(c.spellcasting)] || "text-white/60")}>
                                                {c.spellcasting ? (
                                                    <span className="flex items-center gap-1.5">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                                        Sim
                                                    </span>
                                                ) : (
                                                    "Não"
                                                )}
                                            </span>
                                        </td>

                                        {/* Subclasses count */}
                                        <td className="px-6 py-4">
                                            {c.subclasses && c.subclasses.length > 0 ? <span className="text-sm text-white/60">{c.subclasses.length}</span> : <GlassEmptyValue />}
                                        </td>

                                        {/* Source */}
                                        <td className="px-6 py-4">{c.source ? <span className="text-sm text-white/50 truncate max-w-[100px] block">{c.source}</span> : <GlassEmptyValue />}</td>

                                        {/* Progression Table Popover */}
                                        <td className="px-6 py-4 text-center">
                                            <GlassPopover>
                                                <GlassPopoverTrigger asChild>
                                                    <button
                                                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
                                                        title="Ver tabela de progressão"
                                                    >
                                                        <TableProperties className="h-3.5 w-3.5" />
                                                    </button>
                                                </GlassPopoverTrigger>
                                                <GlassPopoverContent
                                                    align="end"
                                                    sideOffset={8}
                                                    className="w-[min(90vw,860px)] p-0"
                                                >
                                                    <div className="p-2">
                                                        <ClassProgressionTable
                                                            traits={c.traits || []}
                                                            spellcasting={c.spellcasting}
                                                            progressionData={c.progressionTable}
                                                            isEditable={false}
                                                            compact
                                                        />
                                                    </div>
                                                </GlassPopoverContent>
                                            </GlassPopover>
                                        </td>

                                        {/* Actions */}
                                        {isAdmin && (
                                            <td className="px-6 py-4 text-right">
                                                <GlassDropdownMenu>
                                                    <GlassDropdownMenuTrigger asChild>
                                                        <button className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors opacity-0 group-hover:opacity-100">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </button>
                                                    </GlassDropdownMenuTrigger>
                                                    <GlassDropdownMenuContent align="end">
                                                        <GlassDropdownMenuItem onClick={() => onEdit(c)}>
                                                            <Pencil className="h-4 w-4 mr-2" />
                                                            Editar
                                                        </GlassDropdownMenuItem>
                                                        <GlassDropdownMenuItem onClick={() => onDelete(c)} className="text-rose-400 hover:text-rose-300">
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Excluir
                                                        </GlassDropdownMenuItem>
                                                    </GlassDropdownMenuContent>
                                                </GlassDropdownMenu>
                                            </td>
                                        )}
                                    </motion.tr>
                                )
                            })}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <DataTablePagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={onPageChange} itemLabel="classes" className="border-t border-white/5" />
            )}
        </GlassCard>
    )
}
