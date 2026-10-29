import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LoadingState } from "@/components/ui/loading-state"
import { AdminSheetsPage } from "@/features/character-sheets/components/admin-sheets-page"
import { getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { pageAccess } from "@/features/perfix/server/page-access"

export const metadata: Metadata = {
    title: "Fichas | Dungeons & Dicas",
    description: "Listagem administrativa de fichas do sistema",
}

export default async function SheetsAdminPageRoute() {
    const currentUser = await getCurrentUserFromDb()

    if (!currentUser.success || !currentUser.user) {
        redirect(currentUser.userId ? "/my-sheets" : "/sign-in")
    }

    await pageAccess("sheets.view_all")

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
