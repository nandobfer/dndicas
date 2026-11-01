import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requirePermissionActor } from "@/features/auth/server/actor"
import { MADDOX_PLAY_PERMISSION } from "@/features/maddox/constants"
import { maddoxAbilityRollSchema } from "@/features/maddox/interview-schemas"
import { interviewKind } from "@/features/maddox/server/interviews"
import { resetAbilityRolls } from "@/features/maddox/server/interview-scores-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST …/interviews/character/ability-scores/reset — `{}`: apaga as rolagens quando a sexta ficou fora de 3–18. */
export const POST = withRoute<{ id: string; kind: string }>(async ({ req, params }) => {
    const actor = await requirePermissionActor(MADDOX_PLAY_PERMISSION)
    const kind = interviewKind(params.kind)
    const body = await parseBody(req, maddoxAbilityRollSchema)
    if (!body.ok) return body.response
    return ok({ interview: await resetAbilityRolls(params.id, kind, actor.id) })
})
