import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { requestOpexScope } from "@/features/opex-agent/server/scope"
import { getOpexStatus } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/status — situação do Agente Opex para quem está vendo (público; cria o cookie do visitante). */
export const GET = withRoute(async () => ok(await getOpexStatus(await requestOpexScope())))
