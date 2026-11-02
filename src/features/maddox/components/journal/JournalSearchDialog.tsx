"use client"

import { useState } from "react"
import Link from "next/link"
import { BookOpen, Search } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { JournalSearch } from "./JournalSearch"
import { journalHref } from "./journal-links"

/** Busca rápida no diário sem sair da mesa: abrir um resultado leva ao diário, na aba e no item certos. */
export function JournalSearchDialog({ campaignId, color }: { campaignId: string; color: string }) {
    const [open, setOpen] = useState(false)
    const change = (value: boolean) => setOpen(value)
    return (
        <>
            <Button size="sm" variant="outline" onClick={() => change(true)} data-testid="journal-search-open">
                <Search aria-hidden /> Buscar no diário
            </Button>
            <GlassModal open={open} onOpenChange={change}>
                <GlassModalContent size="lg">
                    <div className="space-y-4">
                        <GlassModalHeader>
                            <GlassModalTitle className="flex items-center gap-2">
                                <Search className="h-4 w-4" style={{ color }} aria-hidden /> Buscar no diário
                            </GlassModalTitle>
                            <GlassModalDescription>NPCs, locais, missões, anotações, o grupo e as falas da mesa — só o que os jogadores já sabem.</GlassModalDescription>
                        </GlassModalHeader>
                        <div className="max-h-[60vh] overflow-y-auto pr-1">
                            <JournalSearch campaignId={campaignId} color={color} autoFocus onNavigate={() => change(false)} />
                        </div>
                        <Link href={journalHref(campaignId)} onClick={() => change(false)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                            <BookOpen className="h-4 w-4" aria-hidden /> Abrir o diário completo
                        </Link>
                    </div>
                </GlassModalContent>
            </GlassModal>
        </>
    )
}
