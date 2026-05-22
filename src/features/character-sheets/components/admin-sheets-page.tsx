"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ScrollText } from "lucide-react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { LoadingState } from "@/components/ui/loading-state"
import { useAuth } from "@/core/hooks/useAuth"
import { motionConfig } from "@/lib/config/motion-configs"
import { AdminSheetsFilters } from "./admin-sheets-filters"
import { AdminSheetsTable } from "./admin-sheets-table"
import { AdminSheetsList } from "./admin-sheets-list"
import { useAdminSheetsPage } from "../hooks/useAdminSheetsPage"

export function AdminSheetsPage() {
    const router = useRouter()
    const { isAdmin, isLoaded, isSignedIn } = useAuth()
    const canAccess = isLoaded && isSignedIn && isAdmin
    const { isMobile, filters, pagination, data, actions } = useAdminSheetsPage(canAccess)

    React.useEffect(() => {
        if (!isLoaded) return
        if (!isSignedIn) {
            router.replace("/sign-in")
            return
        }
        if (!isAdmin) {
            router.replace("/my-sheets")
        }
    }, [isAdmin, isLoaded, isSignedIn, router])

    const isAuthorizing = !canAccess
    const isSearching = isMobile ? data.mobile.isFetching : data.desktop.isFetching

    if (isAuthorizing) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <LoadingState variant="spinner" message="Validando acesso..." />
            </div>
        )
    }

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
                    <AdminSheetsFilters search={filters.search} onSearchChange={actions.handleSearchChange} isSearching={isSearching} />
                </GlassCardContent>
            </GlassCard>

            <AnimatePresence mode="wait" initial={false}>
                {isMobile ? (
                    <motion.div key="mobile-list" layout>
                        <AdminSheetsList
                            items={data.mobile.items}
                            isLoading={data.mobile.isLoading}
                            hasNextPage={data.mobile.hasNextPage}
                            isFetchingNextPage={data.mobile.isFetchingNextPage}
                            error={data.mobile.error}
                            onLoadMore={() => {
                                void data.mobile.fetchNextPage()
                            }}
                            onRetry={() => {
                                void data.mobile.refetch()
                            }}
                        />
                    </motion.div>
                ) : (
                    <motion.div key="desktop-table" layout>
                        <AdminSheetsTable
                            items={data.desktop.items}
                            total={pagination.total}
                            page={pagination.page}
                            limit={pagination.limit}
                            isLoading={data.desktop.isLoading}
                            error={data.desktop.error}
                            onPageChange={pagination.setPage}
                            onRetry={() => {
                                void data.desktop.refetch()
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
