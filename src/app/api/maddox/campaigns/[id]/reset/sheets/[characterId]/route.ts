import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { retrySheetRestore } from "@/features/maddox/server/sheet-restore"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/maddox/campaigns/[id]/reset/sheets/[characterId] — "Tentar de novo" o ajuste da ficha pelo Maddox (DND-50). */
export const POST = withRoute<{ id: string; characterId: string }>(async ({ params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    return ok(await retrySheetRestore(params.id, params.characterId, actor.id))
})
