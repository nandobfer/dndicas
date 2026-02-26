"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Chip } from "@/components/ui/chip"
import { ScrollText, Sparkles, Wand, Zap, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { motionConfig } from "@/lib/config/motion-configs"
import { RulePreview, TraitPreview } from "./entity-preview-tooltip"
import { FeatPreview } from "@/features/feats/components/feat-preview"
import { SpellPreview } from "@/features/spells/components/spell-preview"
import { GlassDropdownMenu, GlassDropdownMenuTrigger, GlassDropdownMenuContent, GlassDropdownMenuItem } from "@/components/ui/glass-dropdown-menu"

/**
 * Registry of renderers for different entity types.
 * T042: Generalized entity renderer configuration.
 */
const ENTITY_RENDERERS: Record<string, (item: any) => React.ReactNode> = {
    Regra: (item) => <RulePreview rule={item} showStatus={false} />,
    Habilidade: (item) => <TraitPreview trait={item} showStatus={false} />,
    Talento: (item) => <FeatPreview feat={item} showStatus={false} />,
    Magia: (item) => <SpellPreview spell={item} showStatus={false} />,
}

interface EntityListProps {
    items: any[]
    entityType: string
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    onLoadMore: () => void
    onEdit?: (item: any) => void
    onDelete?: (item: any) => void
    isAdmin?: boolean
}

export function EntityList({ items, entityType, isLoading, hasNextPage, isFetchingNextPage, onLoadMore, onEdit, onDelete, isAdmin }: EntityListProps) {
    const observer = React.useRef<IntersectionObserver | null>(null)

    // Intersection observer for infinite scroll
    const lastElementRef = React.useCallback(
        (node: HTMLDivElement) => {
            if (isLoading || isFetchingNextPage) return
            if (observer.current) observer.current.disconnect()

            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasNextPage) {
                    onLoadMore()
                }
            })

            if (node) observer.current.observe(node)
        },
        [isLoading, isFetchingNextPage, hasNextPage, onLoadMore],
    )

    if (isLoading && items.length === 0) {
        return (
            <div className="py-12 flex justify-center">
                <LoadingState variant="spinner" message={`Carregando ${entityType.toLowerCase()}s...`} />
            </div>
        )
    }

    if (!isLoading && items.length === 0) {
        return (
            <div className="py-12">
                <EmptyState title={`Nenhuma ${entityType.toLowerCase()} encontrada`} description="Tente ajustar os filtros." icon={ScrollText} />
            </div>
        )
    }

    const renderEntity = (item: any) => {
        const type = entityType === "Mixed" ? item.type : entityType
        const renderer = ENTITY_RENDERERS[type]
        return renderer ? renderer(item) : <div>{item.name || "Unknown item"}</div>
    }

    return (
        <div className="space-y-4">
            <AnimatePresence mode="popLayout">
                {items.map((item, index) => (
                    <motion.div
                        key={item._id || item.id}
                        variants={motionConfig.variants.fadeInUp}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ delay: (index % 10) * 0.05 }}
                    >
                        <GlassCard className="relative overflow-hidden">
                            <GlassCardContent className="p-4 pt-6">
                                <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-2">
                                    {isAdmin && (onEdit || onDelete) && (
                                        <GlassDropdownMenu>
                                            <GlassDropdownMenuTrigger asChild>
                                                <motion.button
                                                    whileHover={{ scale: 1.1 }}
                                                    whileTap={{ scale: 0.9 }}
                                                    className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </motion.button>
                                            </GlassDropdownMenuTrigger>
                                            <GlassDropdownMenuContent align="end">
                                                {onEdit && (
                                                    <GlassDropdownMenuItem onClick={() => onEdit(item)}>
                                                        <Pencil className="mr-2 h-4 w-4" />
                                                        Editar
                                                    </GlassDropdownMenuItem>
                                                )}
                                                {onDelete && (
                                                    <GlassDropdownMenuItem
                                                        onClick={() => onDelete(item)}
                                                        className="text-red-400 hover:text-red-300 focus:text-red-300"
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Excluir
                                                    </GlassDropdownMenuItem>
                                                )}
                                            </GlassDropdownMenuContent>
                                        </GlassDropdownMenu>
                                    )}

                                    <Chip variant={item.status === "active" ? "uncommon" : "common"} size="sm">
                                        {item.status === "active" ? "Ativa" : "Inativa"}
                                    </Chip>
                                </div>
                                <div className="max-w-full overflow-hidden">{renderEntity(item)}</div>
                            </GlassCardContent>
                        </GlassCard>
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* Loading indicator for next page */}
            <div ref={lastElementRef} className="py-8 flex justify-center w-full">
                {isFetchingNextPage && <LoadingState variant="spinner" size="sm" />}
                {!hasNextPage && items.length > 0 && <span className="text-xs text-white/20 uppercase tracking-widest font-bold">Fim da lista</span>}
            </div>
        </div>
    )
}
