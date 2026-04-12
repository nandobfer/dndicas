import { Suspense } from "react"
import { LoadingState } from "@/components/ui/loading-state"
import { AdminSheetsPage } from "@/features/character-sheets/components/admin-sheets-page"

export const metadata = {
    title: "Fichas | Dungeons & Dicas",
    description: "Listagem administrativa de fichas do sistema",
}

export default function SheetsAdminPageRoute() {
    return (
        <Suspense
            fallback={
                <div className="min-h-[400px] flex items-center justify-center">
                    <LoadingState variant="spinner" message="Carregando fichas..." />
                </div>
            }
        >
            <AdminSheetsPage />
        </Suspense>
    )
}
