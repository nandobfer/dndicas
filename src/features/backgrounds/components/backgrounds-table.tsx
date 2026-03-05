/**
 * @fileoverview Backgrounds table component for the catalog.
 * Displays a paginated table of backgrounds with administrative actions.
 */

"use client";

import { motion, AnimatePresence } from "framer-motion"
import { MoreHorizontal, Pencil, Trash2, ShieldCheck, ScrollText } from "lucide-react"
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
import { EntityTitleLink } from "@/features/rules/components/entity-title-link"
import { motionConfig } from "@/lib/config/motion-configs"
import type { Background } from "../types/backgrounds.types"
import { Button } from "@/core/ui/button"

interface BackgroundsTableProps {
    data: Background[]
    isLoading: boolean
    onEdit: (background: Background) => void
    onDelete: (background: Background) => void
}

export function BackgroundsTable({ data, isLoading, onEdit, onDelete }: BackgroundsTableProps) {
    const { isAdmin } = useAuth()

    if (isLoading) return <LoadingState message="Carregando origens..." />
    if (!data.length) return <EmptyState title="Nenhuma origem encontrada" description="Tente ajustar seus filtros ou crie uma nova origem." />

    return (
        <div className="space-y-4">
            <div className="w-full overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-white/5 uppercase text-[10px] font-bold tracking-widest text-white/40">
                            <th className="px-6 py-4 rounded-tl-xl">Origem / Origem</th>
                            <th className="px-6 py-4">Perícias</th>
                            <th className="px-6 py-4">Atributos Sugeridos</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 rounded-tr-xl text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout">
                            {data.map((background, idx) => (
                                <motion.tr 
                                    key={background._id}
                                    variants={motionConfig.variants.fadeInUp}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ delay: idx * 0.03 }}
                                    className="group hover:bg-white/[0.02] transition-colors"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {background.image ? (
                                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 shrink-0">
                                                    <img src={background.image} alt={background.name} className="w-full h-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                                                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                                                </div>
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <EntityTitleLink 
                                                    name={background.name} 
                                                    entityType="Origem"
                                                    className="font-bold text-white group-hover:text-blue-400 transition-colors truncate"
                                                />
                                                <span className="text-[10px] text-white/30 truncate flex items-center gap-1">
                                                    <ScrollText className="w-2.5 h-2.5" />
                                                    {background.source}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                                            {background.skillProficiencies?.slice(0, 2).map(skill => (
                                                <Chip key={skill} variant="rare" size="sm">
                                                    {skill}
                                                </Chip>
                                            ))}
                                            {background.skillProficiencies?.length > 2 && (
                                                <span className="text-xs text-white/20">+{background.skillProficiencies.length - 2}</span>
                                            )}
                                            {(!background.skillProficiencies || background.skillProficiencies.length === 0) && <GlassEmptyValue />}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {background.suggestedAttributes?.map(attr => (
                                                <span key={attr} className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-white/60">
                                                    {attr}
                                                </span>
                                            )) || <GlassEmptyValue />}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={cn(
                                            "inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border",
                                            background.status === "active" 
                                                ? "bg-green-500/10 text-green-400 border-green-500/20" 
                                                : "bg-red-500/10 text-red-400 border-red-500/20"
                                        )}>
                                            {background.status === "active" ? "Ativo" : "Inativo"}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <GlassDropdownMenu>
                                            <GlassDropdownMenuTrigger asChild>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon"
                                                    className="w-8 h-8 hover:bg-white/10 text-white/40 group-hover:text-white"
                                                >
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>
                                            </GlassDropdownMenuTrigger>
                                            <GlassDropdownMenuContent align="end">
                                                <GlassDropdownMenuItem onClick={() => onEdit(background)}>
                                                    <Pencil className="w-4 h-4 mr-2" /> Editar
                                                </GlassDropdownMenuItem>
                                                {isAdmin && (
                                                    <GlassDropdownMenuItem 
                                                        onClick={() => onDelete(background)}
                                                        className="text-red-400 focus:text-red-400"
                                                    >
                                                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                                                    </GlassDropdownMenuItem>
                                                )}
                                            </GlassDropdownMenuContent>
                                        </GlassDropdownMenu>
                                    </td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>
            {/* Pagination placeholder if needed by parent */}
            <div className="px-6 py-4 border-t border-white/5">
                <DataTablePagination 
                    page={1} 
                    totalPages={1} 
                    total={data.length}
                    limit={10}
                    onPageChange={() => {}}
                />
            </div>
        </div>
    )
}
