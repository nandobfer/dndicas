"use client";

import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, Pencil, Trash2, Sparkles, Eye } from "lucide-react";
import { useAuth } from "@/core/hooks/useAuth"
import { GlassCard } from "@/components/ui/glass-card";
import { Chip } from "@/components/ui/chip";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { 
    GlassDropdownMenu, 
    GlassDropdownMenuContent, 
    GlassDropdownMenuItem, 
    GlassDropdownMenuTrigger 
} from "@/components/ui/glass-dropdown-menu";
import { motionConfig } from "@/lib/config/motion-configs";
import { Trait } from "../types/traits.types";
import { EntityDescription } from "@/features/rules/components/entity-description";
import { EntityPreviewTooltip } from "@/features/rules/components/entity-preview-tooltip";

// Extend chipVariantMap or create a local one if "active"/"inactive" are standard
const traitStatusVariantMap: Record<string, "uncommon" | "common"> = {
    active: "uncommon",
    inactive: "common",
};

interface TraitsTableProps {
    traits: Trait[];
    total: number;
    page: number;
    limit: number;
    isLoading?: boolean;
    onEdit: (trait: Trait) => void;
    onDelete: (trait: Trait) => void;
    onPageChange: (page: number) => void;
}

export function TraitsTable({ 
    traits, 
    total, 
    page, 
    limit, 
    isLoading = false, 
    onEdit, 
    onDelete, 
    onPageChange 
}: TraitsTableProps) {
    const { isAdmin } = useAuth()
    const totalPages = Math.ceil(total / limit);

    if (isLoading && traits.length === 0) {
        return (
            <GlassCard className="p-12 flex justify-center">
                <LoadingState variant="spinner" message="Carregando habilidades..." />
            </GlassCard>
        );
    }

    if (!isLoading && traits.length === 0) {
        return (
            <GlassCard className="p-12">
                <EmptyState 
                    title="Nenhuma habilidade encontrada" 
                    description="Tente ajustar os filtros ou criar uma nova habilidade" 
                    icon={Sparkles} 
                />
            </GlassCard>
        );
    }

    return (
        <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/5 bg-white/5">
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Status</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider w-full">Descrição</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-white/50 uppercase tracking-wider">Fonte</th>
                            <th className="px-6 py-4 text-center text-xs font-semibold text-white/50 uppercase tracking-wider w-[80px]">Prever</th>
                            {isAdmin && (
                                <th className="px-6 py-4 text-right text-xs font-semibold text-white/50 uppercase tracking-wider w-[100px]">Ações</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout">
                            {traits.map((trait, index) => (
                                <motion.tr
                                    key={trait._id}
                                    variants={motionConfig.variants.tableRow}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ delay: index * 0.05 }}
                                    className="group hover:bg-white/5 transition-colors"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <Chip variant={traitStatusVariantMap[trait.status] || "common"}>
                                            {trait.status === "active" ? "Ativo" : "Inativo"}
                                        </Chip>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-white font-medium">{trait.name}</td>
                                    <td className="px-6 py-4 text-white/40 text-sm max-w-0">
                                        <div className="min-h-[32px] flex items-center overflow-hidden">
                                            <EntityDescription html={trait.description} className="w-full" />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-white/70">{trait.source}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <EntityPreviewTooltip entityId={trait._id} entityType="Habilidade">
                                            <button className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </EntityPreviewTooltip>
                                    </td>
                                    {isAdmin && (
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <GlassDropdownMenu>
                                                <GlassDropdownMenuTrigger asChild>
                                                    <button className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </button>
                                                </GlassDropdownMenuTrigger>
                                                <GlassDropdownMenuContent align="end">
                                                    <GlassDropdownMenuItem onClick={() => onEdit(trait)}>
                                                        <Pencil className="mr-2 h-4 w-4" />
                                                        Editar
                                                    </GlassDropdownMenuItem>
                                                    <GlassDropdownMenuItem
                                                        onClick={() => onDelete(trait)}
                                                        className="text-red-400 hover:text-red-300 focus:text-red-300"
                                                    >
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

            <div className="p-4 border-t border-white/5">
                <DataTablePagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    limit={limit}
                    onPageChange={onPageChange}
                    itemLabel="habilidades"
                />
            </div>
        </GlassCard>
    )
}
