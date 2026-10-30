import type { Metadata } from "next"
import { pageAccess } from "@/features/perfix/server/page-access"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { CampaignPage } from "@/features/maddox/components/campaigns/CampaignPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Campanha | Campanhas Maddox" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    await pageAccess(MADDOX_PLAY_PERMISSION)
    const { id } = await params
    return <CampaignPage campaignId={id} />
}
