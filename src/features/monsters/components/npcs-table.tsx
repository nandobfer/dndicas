"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { MoreHorizontal, Pencil, Shield, Skull, Sparkles, Trash2 } from "lucide-react"
import { Chip } from "@/components/ui/chip"
import { GlassImage } from "@/components/ui/glass-image"
import { GlassDropdownMenu, GlassDropdownMenuContent, GlassDropdownMenuItem, GlassDropdownMenuTrigger } from "@/components/ui/glass-dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { cn } from "@/core/utils"
import { EntityTitleLink } from "@/features/rules/components/entity-title-link"
import type { Monster } from "../types/monsters.types"
import { MONSTER_SIZE_LABELS, MONSTER_TYPE_LABELS } from "./monster-options"
import { formatMonsterHitPointAverage, getMonsterHitPointAverage, getMonsterXp, isMonsterHitPointFormulaStatic } from "../utils/monster-calculations"

export function NpcsTable({
    items,
    isLoading = false,
    hasNextPage = false,
    onLoadMore = () => {},
    isFetchingNextPage = false,
    onEdit,
    onGenerateAI,
    onDelete,
    isAdmin,
    /** Entity type used for title links and labels. Default: "Monstro" */
    entityType = "Monstro",
    entityLabel,
}: {
    items: Monster[]
    isLoading?: boolean
    hasNextPage?: boolean
    onLoadMore?: () => void
    isFetchingNextPage?: boolean
    onEdit?: (monster: Monster) => void
    onGenerateAI?: (monster: Monster) => void
    onDelete?: (monster: Monster) => void
    isAdmin?: boolean
    entityType?: string
    entityLabel?: string
}) {
    const label = entityLabel ?? entityType
    const observer = React.useRef<IntersectionObserver | null>(null)

    const lastElementRef = React.useCallback(
        (node: HTMLDivElement | null) => {
            if (isLoading || isFetchingNextPage) return
            if (observer.current) observer.current.disconnect()

            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasNextPage) {
                    onLoadMore()
                }
            })

            if (node) observer.current.observe(node)
        },
        [hasNextPage, isFetchingNextPage, isLoading, onLoadMore],
    )

    if (isLoading && items.length === 0) {
        return (
            <div className="py-12 flex justify-center">
                <LoadingState variant="spinner" message={`Carregando ${label.toLowerCase()}s...`} />
            </div>
        )
    }

    if (!isLoading && items.length === 0) {
        return (
            <div className="py-12">
                <EmptyState title={`Nenhum ${label.toLowerCase()} encontrado`} description="Tente ajustar os filtros." icon={Skull} />
            </div>
        )
    }

    return (
        <div className="w-full">
            <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[840px]">
                    <thead>
                        <tr className="border-b border-white/5">
                            <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">{label}</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Tipo</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">CR</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">CA</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">PV</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20">Velocidade</th>
                            <th className="px-4 py-3 text-[10px] uppercase font-bold tracking-widest text-white/20 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {items.map((monster) => {
                            const hitPointAverage = getMonsterHitPointAverage(monster.hitPointsFormula)
                            const hitPointValue = hitPointAverage !== null ? formatMonsterHitPointAverage(hitPointAverage) : monster.hitPointsFormula
                            const shouldShowHitPointFormula = hitPointAverage !== null && !isMonsterHitPointFormulaStatic(monster.hitPointsFormula)

                            return (
                                <tr key={monster._id || monster.id} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {monster.image ? (
                                                <GlassImage
                                                    src={monster.image}
                                                    alt={monster.name}
                                                    className={cn("h-10 w-10 shrink-0 rounded-md border", monster.status === "inactive" ? "border-white/5 opacity-50" : "border-red-500/20")}
                                                    imageClassName="object-cover mix-blend-normal"
                                                    showOverlay={false}
                                                />
                                            ) : (
                                                <div className={cn("p-1.5 rounded-md border bg-red-500/10", monster.status === "inactive" ? "border-white/5 opacity-50" : "border-red-500/20")}>
                                                    <Skull className="h-3.5 w-3.5 text-red-300" />
                                                </div>
                                            )}
                                            <div>
                                                <EntityTitleLink
                                                    name={monster.name}
                                                    entityType={entityType as any}
                                                    className={cn("text-sm font-medium block", monster.status === "inactive" ? "text-white/30" : "text-white/80")}
                                                />
                                                <span className="text-[10px] text-white/20 font-mono tracking-tighter truncate max-w-[180px] block">{monster.source}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-white/45">{MONSTER_SIZE_LABELS[monster.size]} {MONSTER_TYPE_LABELS[monster.type]}</td>
                                    <td className="px-4 py-3"><span className="text-xs font-bold text-red-300">CR {monster.challengeRating}</span><div className="text-[10px] text-white/25">{getMonsterXp(monster.challengeRating, monster.experienceOverride).toLocaleString("pt-BR")} XP</div></td>
                                    <td className="px-4 py-3 text-xs text-white/50">
                                        <div className="flex items-center gap-2">
                                            <Shield className="h-3 w-3" />
                                            <span>{monster.armorClass}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-white/50">
                                        <div>{hitPointValue}</div>
                                        {shouldShowHitPointFormula && <div>{monster.hitPointsFormula}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-white/40">{monster.speed || "—"}</td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isAdmin && (
                                                <GlassDropdownMenu>
                                                    <GlassDropdownMenuTrigger asChild>
                                                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </motion.button>
                                                    </GlassDropdownMenuTrigger>
                                                    <GlassDropdownMenuContent align="end">
                                                        <GlassDropdownMenuItem onClick={() => onEdit?.(monster)}><Pencil className="h-4 w-4 mr-2" />Editar</GlassDropdownMenuItem>
                                                        {onGenerateAI && (
                                                            <GlassDropdownMenuItem onClick={() => onGenerateAI(monster)}>
                                                                <Sparkles className="h-4 w-4 mr-2 animate-pulse text-purple-300" />
                                                                <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 bg-clip-text text-transparent">
                                                                    Gerar com IA
                                                                </span>
                                                            </GlassDropdownMenuItem>
                                                        )}
                                                        <GlassDropdownMenuItem onClick={() => onDelete?.(monster)} className="text-red-400 focus:text-red-400"><Trash2 className="h-4 w-4 mr-2" />Excluir</GlassDropdownMenuItem>
                                                    </GlassDropdownMenuContent>
                                                </GlassDropdownMenu>
                                            )}
                                            <Chip variant={monster.status === "active" ? "uncommon" : "common"} size="sm">{monster.status === "active" ? "Ativo" : "Inativo"}</Chip>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <div ref={lastElementRef} className="py-8 flex justify-center w-full">
                {isFetchingNextPage && <LoadingState variant="spinner" size="sm" />}
                {!hasNextPage && items.length > 0 && <span className="text-xs text-white/20 uppercase tracking-widest font-bold">Fim da lista</span>}
            </div>
        </div>
    )
}
