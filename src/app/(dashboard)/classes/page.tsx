/**
 * @fileoverview Classes catalog page route.
 */

import { ClassesPage } from "@/features/classes/components/classes-page"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Catálogo de Classes | D&Dicas",
    description: "Explore as classes disponíveis para personagens D&D 5e.",
}

export default function Page() {
    return <ClassesPage />
}
