/**
 * @fileoverview Races catalog route.
 */

import { Metadata } from "next"
import { RacesPage } from "@/features/races/components/races-page"

export const metadata: Metadata = {
    title: "Raças | Catálogo D&D",
    description: "Catálogo de raças do sistema D&D.",
}

export default function Page() {
    return <RacesPage />
}
