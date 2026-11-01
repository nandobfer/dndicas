"use client"

import Link from "next/link"
import { ExternalLink, Loader2, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { useWindows } from "@/core/context/window-context"
import { useSheet } from "@/features/character-sheets/api/character-sheets-queries"
import { SheetForm } from "@/features/character-sheets/components/sheet-form"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"

export const MADDOX_SHEET_WINDOW_ID = "maddox-sheet"

/** Ficha D&D do meu personagem numa janela, sem sair da mesa (edição com o auto-save da própria ficha). */
function MySheetWindow({ sheetId, slug }: { sheetId: string; slug: string }) {
    const sheet = useSheet(sheetId)
    if (sheet.isLoading) {
        return (
            <p className="flex items-center gap-2 p-6 text-sm text-white/60" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando a ficha…
            </p>
        )
    }
    if (sheet.isError || !sheet.data) return <p className="p-6 text-sm text-white/60">Não foi possível carregar a ficha.</p>
    return (
        <div className="space-y-3 p-3" data-testid="maddox-sheet-window">
            <Link href={`/sheets/${slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir em nova aba
            </Link>
            <SheetForm sheet={sheet.data as CharacterSheetFull} navigateOnSlugChange={false} />
        </div>
    )
}

/** "Minha ficha" (só para quem tem ficha D&D na campanha): abre a janela da ficha. */
export function MySheetButton({ sheet }: { sheet: { id: string; slug: string } | null }) {
    const { addWindow } = useWindows()
    if (!sheet) return null
    return (
        <Button
            size="sm"
            variant="outline"
            onClick={() =>
                addWindow({
                    id: MADDOX_SHEET_WINDOW_ID,
                    title: "Minha ficha",
                    initialSize: { width: "min(1180px, 95vw)", height: "min(820px, 88vh)" },
                    minSize: { width: 420, height: 320 },
                    content: <MySheetWindow sheetId={sheet.id} slug={sheet.slug} />,
                })
            }
        >
            <ScrollText aria-hidden /> Minha ficha
        </Button>
    )
}
