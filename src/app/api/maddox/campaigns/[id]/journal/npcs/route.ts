import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { listJournalNpcs } from "@/features/maddox/server/journal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/[id]/journal/npcs?cursor= — NPCs que os jogadores conhecem. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const search = req.nextUrl.searchParams
    return ok(await listJournalNpcs(params.id, { cursor: search.get("cursor") ?? undefined }, actor.id))
})
