"use client";

import { motion, AnimatePresence } from "framer-motion"
import { MoreHorizontal, Pencil, Trash2, Fingerprint, Sparkles } from "lucide-react"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"
import { GlassImage } from "@/components/ui/glass-image"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { InfiniteScrollSentinel } from "@/components/ui/infinite-scroll-sentinel"
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
    hasNextPage?: boolean
    isFetchingNextPage?: boolean
    onLoadMore?: () => void
    onEdit?: (race: Race) => void
    onGenerateAI?: (race: Race) => void
    onDelete?: (race: Race) => void
    selectedId?: string | null
    onSelect?: (race: Race) => void
    hideActions?: boolean
}

export function RacesTable({ data, isLoading, hasNextPage = false, isFetchingNextPage = false, onLoadMore, onEdit, onGenerateAI, onDelete, selectedId, onSelect, hideActions = false }: RacesTableProps) {
    const { isAdmin } = useAuth()

    const getSpeedLabel = (speed: string) => {
        const trimmedSpeed = speed.trim()

        if (!trimmedSpeed) {
            return trimmedSpeed
        }

        return /[a-zA-Z\u00C0-\u024F]/.test(trimmedSpeed) ? trimmedSpeed : `${trimmedSpeed} m`
    }

    if (isLoading) return <LoadingState message="Carregando raças..." />
    if (!data.length) return <EmptyState title="Nenhuma raça encontrada" description="Tente ajustar seus filtros ou crie uma nova raça." icon={Fingerprint} />

    return (
        <div className="space-y-4">
            <div className="w-full overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-white/5 uppercase text-[10px] font-bold tracking-widest text-white/40">
                            <th className="px-6 py-4 rounded-tl-xl">Raça</th>
                            <th className="px-6 py-4">Tamanho</th>
                            <th className="px-6 py-4">Deslocamento</th>
                            <th className="px-6 py-4">Fonte</th>
                            {!hideActions && <th className="px-6 py-4 rounded-tr-xl text-right">Ações</th>}
                            {hideActions && <th className="px-6 py-4 rounded-tr-xl" />}
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
                                    onClick={onSelect ? () => onSelect(race) : undefined}
                                    className={cn(
                                        "group transition-colors",
                                        onSelect ? "cursor-pointer" : "",
                                        selectedId === race._id ? "bg-violet-500/15 hover:bg-violet-500/20" : "hover:bg-white/[0.02]",
                                    )}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {race.image ? (
                                                <GlassImage
                                                    src={race.image}
                                                    alt={race.name}
                                                    className={cn("h-10 w-10 shrink-0 rounded-md border", race.status === "inactive" ? "border-white/5 opacity-50" : "border-red-500/20")}
                                                    imageClassName="object-cover mix-blend-normal"
                                                    showOverlay={false}
                                                />
                                            ) : (
                                                <div className={cn("p-1.5 rounded-md border bg-red-500/10", race.status === "inactive" ? "border-white/5 opacity-50" : "border-red-500/20")}>
                                                    <Fingerprint className="h-3.5 w-3.5 text-red-300" />
                                                </div>
                                            )}
                                            <div>
                                                <EntityTitleLink
                                                    name={race.name}
                                                    entityType="Raça"
                                                    entity={race}
                                                    className={cn("text-sm font-medium block", race.status === "inactive" ? "text-white/30" : "text-white/80")}
                                                    disableLink={hideActions}
                                                />
                                                <span className="text-[10px] text-white/20 font-mono tracking-tighter truncate max-w-[180px] block">{race.source}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-white/60">{race.size}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-white/60 font-medium">{getSpeedLabel(race.speed)}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs text-white/40 italic">{race.source}</span>
                                    </td>
                                     <td className="px-6 py-4 text-right">
                                        {!hideActions && isAdmin && onEdit && onDelete && (
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
                                                    {onGenerateAI && (
                                                        <GlassDropdownMenuItem onClick={() => onGenerateAI(race)}>
                                                            <Sparkles className="mr-2 h-4 w-4 text-purple-300 animate-pulse" />
                                                            <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 bg-clip-text text-transparent">
                                                                Gerar com IA
                                                            </span>
                                                        </GlassDropdownMenuItem>
                                                    )}
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
            <InfiniteScrollSentinel
                isLoading={isLoading}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={onLoadMore}
            />
        </div>
    )
}
