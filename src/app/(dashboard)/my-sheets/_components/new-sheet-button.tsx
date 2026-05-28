"use client"

import { useState } from "react"
import { FileText, Loader2, Plus, Sparkles } from "lucide-react"
import { cn } from "@/core/utils"
import { useCreateSheet } from "@/features/character-sheets/api/character-sheets-queries"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"
import {
    GlassDropdownMenu,
    GlassDropdownMenuContent,
    GlassDropdownMenuItem,
    GlassDropdownMenuTrigger,
} from "@/components/ui/glass-dropdown-menu"
import { AssistedSheetCreationModal } from "./assisted-sheet-creation-modal"

interface RandomUserResponse {
    results: { name: { first: string; last: string } }[]
}

const fetchRandomName = async (): Promise<string> => {
    try {
        const res = await fetch("https://randomuser.me/api/?nat=br&inc=name")
        const data: RandomUserResponse = await res.json()
        const { first, last } = data.results[0].name
        return `${first} ${last}`
    } catch {
        return "Nova Ficha"
    }
}

interface NewSheetButtonProps {
    onCreated?: (sheet: CharacterSheet) => void
}

export function NewSheetButton({ onCreated }: NewSheetButtonProps) {
    const { mutate: create, isPending } = useCreateSheet()
    const [isFetchingName, setIsFetchingName] = useState(false)
    const [isAssistantOpen, setIsAssistantOpen] = useState(false)

    const handleClick = async () => {
        setIsFetchingName(true)
        const name = await fetchRandomName()
        setIsFetchingName(false)
        create(name, {
            onSuccess: (sheet) => {
                onCreated?.(sheet)
            },
        })
    }

    const isLoading = isPending || isFetchingName

    return (
        <>
            <GlassDropdownMenu>
                <GlassDropdownMenuTrigger asChild>
                    <button
                        disabled={isLoading}
                        className={cn(
                            "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
                            "bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm",
                            "transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/50",
                            "shadow-lg shadow-violet-500/20 disabled:opacity-60",
                            "w-full sm:w-auto",
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4" />
                        )}
                        Criar ficha
                    </button>
                </GlassDropdownMenuTrigger>
                <GlassDropdownMenuContent align="end" className="min-w-56">
                    <GlassDropdownMenuItem onClick={handleClick} disabled={isLoading}>
                        <FileText className="h-4 w-4" />
                        Ficha em branco
                    </GlassDropdownMenuItem>
                    <GlassDropdownMenuItem onClick={() => setIsAssistantOpen(true)}>
                        <Sparkles className="h-4 w-4" />
                        Assistente de criação
                    </GlassDropdownMenuItem>
                </GlassDropdownMenuContent>
            </GlassDropdownMenu>
            <AssistedSheetCreationModal
                open={isAssistantOpen}
                onOpenChange={setIsAssistantOpen}
                onCreated={onCreated}
            />
        </>
    )
}
