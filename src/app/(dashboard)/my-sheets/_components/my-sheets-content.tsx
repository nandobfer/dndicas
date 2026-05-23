"use client"

import { ScrollText } from "lucide-react"
import { motion } from "framer-motion"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { useSheetList } from "@/features/character-sheets/hooks/use-sheet-list"
import { useAuth } from "@/core/hooks/useAuth"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"
import { SheetsSearch } from "./sheets-search"
import { SheetsList } from "./sheets-list"
import { NewSheetButton } from "./new-sheet-button"
import { UnauthenticatedView } from "./unauthenticated-view"

interface MySheetsContentProps {
    title?: string
    description?: string
    unauthenticatedDescription?: string
    redirectUrl?: string
    onSheetOpen?: (sheet: CharacterSheet) => void
    onSheetCreated?: (sheet: CharacterSheet) => void
    showDelete?: boolean
    emptyMessage?: string
    className?: string
}

export function MySheetsContent({
    title = "Minhas Fichas",
    description = "Gerencie suas fichas de personagem",
    unauthenticatedDescription = "Entre com sua conta para criar e gerenciar suas fichas de personagem",
    redirectUrl = "/my-sheets",
    onSheetOpen,
    onSheetCreated,
    showDelete = true,
    emptyMessage,
    className = "space-y-6",
}: MySheetsContentProps) {
    const { isSignedIn, isLoaded } = useAuth()
    const { sheets, search, handleSearch, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useSheetList()

    if (isLoaded && !isSignedIn) {
        return <UnauthenticatedView redirectUrl={redirectUrl} />
    }

    return (
        <motion.div
            variants={motionConfig.variants.fadeInUp}
            initial="initial"
            animate="animate"
            className={className}
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <ScrollText className="h-5 w-5 sm:h-6 sm:w-6 text-violet-400" />
                        {title}
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">
                        {isLoaded && !isSignedIn ? unauthenticatedDescription : description}
                    </p>
                </div>
                <NewSheetButton onCreated={onSheetCreated} />
            </div>

            <GlassCard>
                <GlassCardContent className="py-4">
                    <SheetsSearch value={search} onChange={handleSearch} isLoading={isLoading} />
                </GlassCardContent>
            </GlassCard>

            <SheetsList
                sheets={sheets}
                isLoading={isLoading}
                hasNextPage={hasNextPage ?? false}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
                onSheetOpen={onSheetOpen}
                showDelete={showDelete}
                emptyMessage={emptyMessage}
            />
        </motion.div>
    )
}
