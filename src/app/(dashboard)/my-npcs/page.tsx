import { Metadata } from "next"
import { NpcsPage } from "@/features/monsters/components/npcs-page"

export const metadata: Metadata = {
    title: "Meus NPCs | D&D",
    description: "Gerencie seus NPCs personalizados.",
}

export default function Page() {
    return <NpcsPage />
}
