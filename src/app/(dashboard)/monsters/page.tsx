import { Metadata } from "next"
import { MonstersPage } from "@/features/monsters/components/monsters-page"

export const metadata: Metadata = {
    title: "Monstros | Catálogo D&D",
    description: "Catálogo de monstros do sistema D&D.",
}

export default function Page() {
    return <MonstersPage />
}
