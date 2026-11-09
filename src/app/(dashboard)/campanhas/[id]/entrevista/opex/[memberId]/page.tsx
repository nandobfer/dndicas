import type { Metadata } from "next"
import { pageAccess } from "@/features/perfix/server/page-access"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { OpexInterviewPage } from "@/features/maddox/components/interviews/OpexInterviewPage"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Entrevista do Personagem Opex | Campanhas Maddox" }

export default async function Page({ params }: { params: Promise<{ id: string; memberId: string }> }) {
    await pageAccess(MADDOX_PLAY_PERMISSION)
    const { id, memberId } = await params
    return <OpexInterviewPage campaignId={id} memberId={memberId} />
}
