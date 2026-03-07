/**
 * @fileoverview Backgrounds catalog page route.
 */

import { BackgroundsPage } from "@/features/backgrounds/components/backgrounds-page"
import { Metadata } from "next"
import { Suspense } from "react"

export const metadata: Metadata = {
    title: "Origens | D&Dicas",
    description: "Explore as origens (backgrounds) disponíveis para personagens D&D 5e."
}

export default function Page() {
    return (
        <Suspense fallback={<div>Carregando catálogo de origens...</div>}>
            <BackgroundsPage />
        </Suspense>
    )
}
