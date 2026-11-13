import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { listJournalChapters } from "@/features/maddox/server/journal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/[id]/journal/chapters — capítulos encerrados pelo Maddox (DND-56). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await listJournalChapters(params.id, actor.id))
})
