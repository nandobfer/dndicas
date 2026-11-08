import type { Metadata } from "next"
import { pageAccess } from "@/features/perfix/server/page-access"
import { can } from "@/features/perfix/catalog"
import { MEMORIES_VIEW_PERMISSION } from "@/features/engramind/constants"
import { engramindConnection } from "@/features/engramind/server/client"
import { listCampaignChannelNames } from "@/features/engramind/server/channel-labels"
import { readUniverseLayoutForPage } from "@/features/engramind/server/universe-layout"
import { MemoriesChannelPage } from "@/features/engramind/components/page/MemoriasPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Canal de memórias | D&D", description: "Canal da rede de memórias do dndicas." }

export default async function Page({ params }: { params: Promise<{ channel: string }> }) {
    const access = await pageAccess(MEMORIES_VIEW_PERMISSION)
    const { channel } = await params
    const configured = Boolean(await engramindConnection().catch(() => null))
    const campaigns = configured ? await listCampaignChannelNames() : []
    const universeLayout = configured ? await readUniverseLayoutForPage() : null
    return <MemoriesChannelPage slug={decodeURIComponent(channel)} configured={configured} canConfigure={can(access.effective, "integrations.engramind.edit")} campaigns={campaigns} universeLayout={universeLayout} />
}
