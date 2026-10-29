import { ok, validationError } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { withRoute } from "@/lib/api/route"
import { opencodeUsageQuerySchema } from "@/features/ai/opencode-usage"
import { getOpencodeUsage } from "@/features/ai/server/opencode-usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Sessão interna; não é endpoint público por token. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminActor()
    const parsed = opencodeUsageQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await getOpencodeUsage(parsed.data))
})
