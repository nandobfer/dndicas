import { z } from "zod"
import { requireActor } from "@/features/auth/server/actor"
import { ensureOpexAccess } from "@/features/opex-feedback/server/access-service"
import { parseBody, withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const POST = withRoute(async ({ req }) => {
    const actor = await requireActor()
    const parsed = await parseBody(req, z.object({}).strict())
    if (!parsed.ok) return parsed.response
    const { access } = await ensureOpexAccess(actor)
    return ok(access, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
})
