import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { parseBody, withRoute } from "@/lib/api/route"
import { generateMaddoxAvatarSchema } from "@/features/maddox/schemas"
import { generateMaddoxAvatar } from "@/features/maddox/server/avatar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** POST /api/ai/features/maddox/avatar — gera o avatar com o Gerador de imagens (vale só depois de salvar). */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireAdminActor()
    const body = await parseBody(req, generateMaddoxAvatarSchema)
    if (!body.ok) return body.response
    return ok(await generateMaddoxAvatar(body.data.persona, actor.id))
})
