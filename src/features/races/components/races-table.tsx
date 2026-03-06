"use client";

import { motion, AnimatePresence } from "framer-motion"
import { MoreHorizontal, Pencil, Trash2, Fingerprint } from "lucide-react"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"
import { Chip } from "@/components/ui/chip"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import {
    GlassDropdownMenu,
    GlassDropdownMenuContent,
    GlassDropdownMenuItem,
    GlassDropdownMenuTrigger,
} from "@/components/ui/glass-dropdown-menu"
import { EntityTitleLink } from "@/features/rules/components/entity-title-link"
import { motionConfig } from "@/lib/config/motion-configs"
import type { Race } from "../types/races.types"

interface RacesTableProps {
    data: Race[]
    isLoading: boolean
    onEdit: (race: Race) => void
    onDelete: (race: Race) => void
}

export function RacesTable({ data, isLoading, onEdit, onDelete }: RacesTableProps) {
    const { isAdmin } = useAuth()

    if (isLoading) return <LoadingState message="Carregando raças..." />
    if (!data.length) return <EmptyState title="Nenhuma raça encontrada" description="Tente ajustar seus filtros ou crie uma nova raça." icon={Fingerprint} />

    return (
        <div className="space-y-4">
            <div className="w-full overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-white/5 uppercase text-[10px] font-bold tracking-widest text-white/40">
                            <th className="px-6 py-4 rounded-tl-xl w-[100px]">Status</th>
                            <th className="px-6 py-4">Nome da Raça</th>
                            <th className="px-6 py-4">Tamanho</th>
                            <th className="px-6 py-4">Deslocamento</th>
                            <th className="px-6 py-4">Fonte</th>
                            <th className="px-6 py-4 rounded-tr-xl text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout">
                            {data.map((race, idx) => (
                                <motion.tr
                                    key={race._id}
                                    variants={motionConfig.variants.fadeInUp}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ delay: idx * 0.03 }}
                                    className="group hover:bg-white/[0.02] transition-colors"
                                >
                                    <td className="px-6 py-4">
                                        <Chip variant={race.status === "active" ? "uncommon" : "common"} size="sm">
                                            {race.status === "active" ? "Ativo" : "Inativo"}
                                        </Chip>
                                    </td>
                                    <td className="px-6 py-4">
                                        <EntityTitleLink name={race.name} entityType="Raça" />
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-white/60">{race.size}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-white/60 font-medium">{race.speed}m</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs text-white/40 italic">{race.source}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {isAdmin && (
                                            <GlassDropdownMenu>
                                                <GlassDropdownMenuTrigger asChild>
                                                    <button className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </button>
                                                </GlassDropdownMenuTrigger>
                                                <GlassDropdownMenuContent align="end">
                                                    <GlassDropdownMenuItem onClick={() => onEdit(race)}>
                                                        <Pencil className="mr-2 h-4 w-4 text-blue-400" />
                                                        Editar Raça
                                                    </GlassDropdownMenuItem>
                                                    <GlassDropdownMenuItem onClick={() => onDelete(race)} className="text-red-400 hover:text-red-300 focus:text-red-300">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Excluir Raça
                                                    </GlassDropdownMenuItem>
                                                </GlassDropdownMenuContent>
                                            </GlassDropdownMenu>
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>
        </div>
    )
}
