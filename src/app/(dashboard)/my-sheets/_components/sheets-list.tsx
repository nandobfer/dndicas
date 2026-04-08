"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { GlassSheetCard } from "@/components/ui/glass-sheet-card"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { DeleteSheetDialog } from "@/features/character-sheets/components/delete-sheet-dialog"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"

interface SheetsListProps {
    sheets: CharacterSheet[]
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
}

const gridVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
}

const cardVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

export function SheetsList({ sheets, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage }: SheetsListProps) {
    const [sheetToDelete, setSheetToDelete] = useState<CharacterSheet | null>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)

    // Infinite scroll via IntersectionObserver
    useEffect(() => {
        const el = sentinelRef.current
        if (!el) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage()
                }
            },
            { threshold: 0.1 },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-40 rounded-xl bg-white/5 animate-pulse" />
                ))}
            </div>
        )
    }

    if (sheets.length === 0) {
        return (
            <GlassInlineEmptyState
                message="Nenhuma ficha encontrada. Crie sua primeira ficha de personagem para começar."
            />
        )
    }

    return (
        <>
            <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                variants={gridVariants}
                initial="hidden"
                animate="show"
            >
                <AnimatePresence mode="popLayout">
                    {sheets.map((sheet) => (
                        <motion.div key={sheet._id} variants={cardVariants} layout>
                            <GlassSheetCard
                                sheet={sheet}
                                onRequestDelete={setSheetToDelete}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </motion.div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4" />

            {isFetchingNextPage && (
                <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                </div>
            )}

            <DeleteSheetDialog
                isOpen={sheetToDelete !== null}
                onClose={() => setSheetToDelete(null)}
                sheet={sheetToDelete}
            />
        </>
    )
}
