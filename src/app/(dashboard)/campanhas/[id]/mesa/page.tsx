import type { Metadata } from "next"
import { pageAccess } from "@/features/perfix/server/page-access"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { GamePage } from "@/features/maddox/components/game/GamePage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Mesa | Campanhas Maddox" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    await pageAccess(MADDOX_PLAY_PERMISSION)
    const { id } = await params
    return <GamePage campaignId={id} />
}
