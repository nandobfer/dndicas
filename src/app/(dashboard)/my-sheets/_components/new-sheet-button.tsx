"use client"

import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"
import { cn } from "@/core/utils"
import { useCreateSheet } from "@/features/character-sheets/api/character-sheets-queries"

export function NewSheetButton() {
    const router = useRouter()
    const { mutate: create, isPending } = useCreateSheet()

    const handleClick = () => {
        create(undefined, {
            onSuccess: (sheet) => {
                router.push(`/sheets/${sheet.slug}`)
            },
        })
    }

    return (
        <button
            onClick={handleClick}
            disabled={isPending}
            className={cn(
                "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
                "bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm",
                "transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50",
                "shadow-lg shadow-violet-500/20 disabled:opacity-60",
                "w-full sm:w-auto",
            )}
        >
            {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
                <Plus className="h-4 w-4" />
            )}
            Nova Ficha
        </button>
    )
}
