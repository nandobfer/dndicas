import type { Metadata } from "next"
import { pageAccess } from "@/features/perfix/server/page-access"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { CampaignsPage } from "@/features/maddox/components/campaigns/CampaignsPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Campanhas Maddox | D&D", description: "Campanhas narradas pelo Maddox." }

export default async function Page() {
    await pageAccess(MADDOX_PLAY_PERMISSION)
    return <CampaignsPage />
}
