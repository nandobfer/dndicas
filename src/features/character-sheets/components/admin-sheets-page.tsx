"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { ScrollText } from "lucide-react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { AdminSheetsFilters } from "./admin-sheets-filters"
import { AdminSheetsList } from "./admin-sheets-list"
import { useAdminSheetsPage } from "../hooks/useAdminSheetsPage"

export function AdminSheetsPage() {
    const { filters, data, actions } = useAdminSheetsPage(true)
    const { fetchNextPage, refetch } = data
    const handleLoadMore = React.useCallback(() => {
        void fetchNextPage()
    }, [fetchNextPage])
    const handleRetry = React.useCallback(() => {
        void refetch()
    }, [refetch])

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <ScrollText className="h-5 w-5 sm:h-6 sm:w-6 text-amber-300" />
                        Fichas
                    </h1>
                    <p className="text-xs sm:text-sm text-white/60 mt-1">Acompanhe todas as fichas criadas na plataforma.</p>
                </div>
            </div>

            <GlassCard>
                <GlassCardContent className="py-4">
                    <AdminSheetsFilters search={filters.search} onSearchChange={actions.handleSearchChange} isSearching={data.isFetching} />
                </GlassCardContent>
            </GlassCard>

            <AdminSheetsList
                items={data.items}
                isLoading={data.isLoading}
                hasNextPage={data.hasNextPage}
                isFetchingNextPage={data.isFetchingNextPage}
                error={data.error}
                onLoadMore={handleLoadMore}
                onRetry={handleRetry}
            />
        </motion.div>
    )
}
