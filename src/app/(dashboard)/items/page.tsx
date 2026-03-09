import { ItemsPage } from "@/features/items/components/items-page"
import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Itens | Catálogo D&D",
    description: "Catálogo de itens do sistema D&D.",
}

export default function Page() {
    return <ItemsPage />
}
