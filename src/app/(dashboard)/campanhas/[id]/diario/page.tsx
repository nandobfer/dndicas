import type { Metadata } from "next"
import { pageAccess } from "@/features/perfix/server/page-access"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { JournalPage } from "@/features/maddox/components/journal/JournalPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Diário | Campanhas Maddox" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    await pageAccess(MADDOX_PLAY_PERMISSION)
    const { id } = await params
    return <JournalPage campaignId={id} />
}
