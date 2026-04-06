"use client"

import { use } from "react"
import { notFound } from "next/navigation"
import { useSheet } from "@/features/character-sheets/api/character-sheets-queries"
import { SheetForm } from "@/features/character-sheets/components/sheet-form"
import { extractIdFromSlug } from "@/features/character-sheets/utils/slug"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"

interface SheetPageProps {
    params: Promise<{ slug: string }>
}

export default function SheetPage({ params }: SheetPageProps) {
    const { slug } = use(params)
    const id = extractIdFromSlug(slug)
    const { data, isLoading, isError } = useSheet(id)

    if (isLoading) {
        return <SheetPageSkeleton />
    }

    if (isError || !data) {
        notFound()
    }

    return <SheetForm sheet={data as CharacterSheetFull} />
}

function SheetPageSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="h-28 rounded-xl bg-white/5" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[600px] rounded-xl bg-white/5" />
                ))}
            </div>
        </div>
    )
}
