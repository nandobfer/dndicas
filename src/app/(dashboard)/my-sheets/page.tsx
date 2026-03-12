"use client"

import { ScrollText } from "lucide-react"
import { motion } from "framer-motion"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { useSheetList } from "@/features/character-sheets/hooks/use-sheet-list"
import { SheetsSearch } from "./_components/sheets-search"
import { SheetsList } from "./_components/sheets-list"
import { NewSheetButton } from "./_components/new-sheet-button"

export default function MySheetsPage() {
    const { sheets, search, handleSearch, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useSheetList()

    return (
        <motion.div
            variants={motionConfig.variants.fadeInUp}
            initial="initial"
            animate="animate"
            className="space-y-6"
        >
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <ScrollText className="h-5 w-5 sm:h-6 sm:w-6 text-violet-400" />
                        Minhas Fichas
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">
                        Gerencie suas fichas de personagem
                    </p>
                </div>
                <NewSheetButton />
            </div>

            {/* Search */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <SheetsSearch value={search} onChange={handleSearch} isLoading={isLoading} />
                </GlassCardContent>
            </GlassCard>

            {/* List */}
            <SheetsList
                sheets={sheets}
                isLoading={isLoading}
                hasNextPage={hasNextPage ?? false}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
            />
        </motion.div>
    )
}
