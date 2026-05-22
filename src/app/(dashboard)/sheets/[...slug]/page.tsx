"use client"

import { use } from "react"
import { notFound } from "next/navigation"
import { useSheetBySlug } from "@/features/character-sheets/api/character-sheets-queries"
import { SheetForm } from "@/features/character-sheets/components/sheet-form"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"

interface SheetPageProps {
    params: Promise<{ slug: string[] }>
}

export default function SheetPage({ params }: SheetPageProps) {
    const { slug: slugParts } = use(params)
    const fullSlug = slugParts.join("/")

    const { data, isLoading, isError } = useSheetBySlug(fullSlug)

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
