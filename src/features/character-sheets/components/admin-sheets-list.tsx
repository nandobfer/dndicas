"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Clock3, ScrollText } from "lucide-react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { UserMini } from "@/components/ui/user-mini"
import { motionConfig } from "@/lib/config/motion-configs"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { AdminSheetCharacterMini } from "./admin-sheet-character-mini"
import type { AdminSheetListItem } from "../types/character-sheet.types"

interface AdminSheetsListProps {
    items: AdminSheetListItem[]
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    error?: Error | null
    onLoadMore: () => void
    onRetry: () => void
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(new Date(value))
}

function RichSheetValue({ html }: { html: string }) {
    if (!html || html === "—" || html.trim() === "") {
        return <span className="text-white/35">—</span>
    }

    return (
        <span className="text-white/75 leading-relaxed [&_.mention]:max-w-full [&_.mention]:align-middle">
            <MentionContent html={html} mode="inline" />
        </span>
    )
}

export function AdminSheetsList({ items, isLoading, hasNextPage, isFetchingNextPage, error, onLoadMore, onRetry }: AdminSheetsListProps) {
    const router = useRouter()
    const observer = React.useRef<IntersectionObserver | null>(null)

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
        [hasNextPage, isFetchingNextPage, isLoading, onLoadMore],
    )

    if (isLoading && items.length === 0) {
        return (
            <div className="py-12 flex justify-center">
                <LoadingState variant="spinner" message="Carregando fichas..." />
            </div>
        )
    }

    if (error && items.length === 0) {
        return (
            <div className="py-12">
                <ErrorState title="Erro ao carregar fichas" error={error} onRetry={onRetry} isRetrying={isLoading} />
            </div>
        )
    }

    if (!isLoading && items.length === 0) {
        return (
            <div className="py-12">
                <EmptyState
                    title="Nenhuma ficha encontrada"
                    description="Tente ajustar a busca para encontrar outras fichas."
                    icon={ScrollText}
                />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <AnimatePresence mode="popLayout">
                {items.map((item, index) => (
                    <motion.div
                        key={item.id}
                        layout
                        variants={motionConfig.variants.fadeInUp}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ delay: (index % 10) * 0.04 }}
                    >
                        <GlassCard
                            className="cursor-pointer overflow-hidden transition-colors hover:bg-white/[0.03]"
                            onClick={() => router.push(`/sheets/${item.slug}`)}
                        >
                            <GlassCardContent className="p-4 space-y-4">
                                <AdminSheetCharacterMini name={item.name} photo={item.photo} />

                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Classe</p>
                                        <div className="mt-1">
                                            <RichSheetValue html={item.class} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Subclasse</p>
                                        <div className="mt-1">
                                            <RichSheetValue html={item.subclass} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Raça</p>
                                        <div className="mt-1">
                                            <RichSheetValue html={item.race} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Origem</p>
                                        <div className="mt-1">
                                            <RichSheetValue html={item.origin} />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Última edição</p>
                                        <p className="text-white/60 mt-1 flex items-center gap-1">
                                            <Clock3 className="h-3.5 w-3.5" />
                                            {formatDate(item.updatedAt)}
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-white/5 pt-3">
                                    <UserMini
                                        name={item.owner.name}
                                        username={item.owner.username}
                                        avatarUrl={item.owner.avatarUrl ?? undefined}
                                        size="sm"
                                    />
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </motion.div>
                ))}
            </AnimatePresence>

            <div ref={lastElementRef} className="py-8 flex justify-center w-full">
                {isFetchingNextPage && <LoadingState variant="spinner" size="sm" />}
                {!hasNextPage && items.length > 0 && <span className="text-xs text-white/20 uppercase tracking-widest font-bold">Fim da lista</span>}
            </div>
        </div>
    )
}
