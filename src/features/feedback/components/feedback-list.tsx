"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageSquare } from "lucide-react"
import { motionConfig } from "@/lib/config/motion-configs"
import { FeedbackCard } from "./feedback-card"
import type { Feedback } from "../types/feedback.types"

interface FeedbackListProps {
    items: Feedback[]
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    onLoadMore: () => void
    onEdit?: (item: Feedback) => void
}

/**
 * Responsive Feedback List for mobile view.
 * Features infinite scroll and specialized FeedbackCard renderer.
 */
export function FeedbackList({ items, isLoading, hasNextPage, isFetchingNextPage, onLoadMore, onEdit }: FeedbackListProps) {
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
                <LoadingState variant="spinner" message={`Carregando feedbacks...`} />
            </div>
        )
    }

    if (!isLoading && items.length === 0) {
        return (
            <div className="py-12">
                <EmptyState title={`Nenhum feedback encontrado`} description="Tente ajustar os filtros." icon={MessageSquare} />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <AnimatePresence mode="popLayout">
                {items.map((item, index) => {
                    return (
                        <motion.div key={item.id} variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" exit="exit" transition={{ delay: (index % 10) * 0.05 }}>
                            <GlassCard className="relative overflow-hidden">
                                <GlassCardContent className="p-4 pt-6">
                                    <FeedbackCard feedback={item} onEdit={onEdit} />
                                </GlassCardContent>
                            </GlassCard>
                        </motion.div>
                    )
                })}
            </AnimatePresence>

            {/* Loading indicator for next page */}
            <div ref={lastElementRef} className="py-8 flex justify-center w-full">
                {isFetchingNextPage && <LoadingState variant="spinner" size="sm" />}
                {!hasNextPage && items.length > 0 && <span className="text-xs text-white/20 uppercase tracking-widest font-bold">Fim da lista</span>}
            </div>
        </div>
    )
}
