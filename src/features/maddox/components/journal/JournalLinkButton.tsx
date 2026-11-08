"use client"

import Link from "next/link"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { journalHref } from "./journal-links"

/** Botão "Diário" do cabeçalho da mesa (também mostrado no tutorial da página da campanha). */
export function JournalLinkButton({ campaignId, "data-testid": testId = "journal-link" }: { campaignId: string; "data-testid"?: string }) {
    return (
        <Button size="sm" variant="outline" asChild>
            <Link href={journalHref(campaignId)} data-testid={testId}>
                <BookOpen aria-hidden /> Diário
            </Link>
        </Button>
    )
}
