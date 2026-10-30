import { requireActor } from "@/features/auth/server/actor"
import { getOpexDashboard } from "@/features/opex-feedback/server/dashboard-service"
import { withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = withRoute(async ({ req }) => {
    const actor = await requireActor()
    const data = await getOpexDashboard(actor, Object.fromEntries(req.nextUrl.searchParams))
    return ok(data, { headers: { "Cache-Control": "no-store" } })
})
