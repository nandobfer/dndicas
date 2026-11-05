import type { Metadata } from "next"
import { pageAccess } from "@/features/perfix/server/page-access"
import { can } from "@/features/perfix/catalog"
import { MEMORIES_VIEW_PERMISSION } from "@/features/engramind/constants"
import { engramindConnection } from "@/features/engramind/server/client"
import { MemoriasPage } from "@/features/engramind/components/page/MemoriasPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Memórias | D&D", description: "Rede de memórias dos agentes do dndicas." }

export default async function Page() {
    const access = await pageAccess(MEMORIES_VIEW_PERMISSION)
    const configured = Boolean(await engramindConnection().catch(() => null))
    return <MemoriasPage configured={configured} canConfigure={can(access.effective, "integrations.engramind.edit")} />
}
