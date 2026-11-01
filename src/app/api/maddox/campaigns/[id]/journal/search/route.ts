import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { searchJournal } from "@/features/maddox/server/journal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/campaigns/[id]/journal/search?q= — busca por texto no que os jogadores sabem. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await searchJournal(params.id, { q: req.nextUrl.searchParams.get("q") ?? "" }, actor.id))
})
