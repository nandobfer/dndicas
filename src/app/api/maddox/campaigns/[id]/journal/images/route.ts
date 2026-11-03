import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { listJournalImages } from "@/features/maddox/server/journal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/[id]/journal/images?kind=&cursor= — imagens prontas que os jogadores veem (DND-22). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const search = req.nextUrl.searchParams
    return ok(await listJournalImages(params.id, { kind: search.get("kind") ?? undefined, cursor: search.get("cursor") ?? undefined }, actor.id))
})
