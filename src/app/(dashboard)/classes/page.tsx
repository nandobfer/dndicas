/**
 * @fileoverview Classes catalog page route.
 */

import { ClassesPage } from "@/features/classes/components/classes-page"
import { Metadata } from "next"
import { Suspense } from "react"

export const metadata: Metadata = {
    title: "Classes | D&Dicas",
    description: "Explore as classes disponíveis para personagens D&D 5e."
}

export default function Page() {
    return (
        <Suspense fallback={<div>Carregando catálogo de classes...</div>}>
            <ClassesPage />
        </Suspense>
    )
}
