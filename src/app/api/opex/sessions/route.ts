import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { createOpexSessionSchema } from "@/features/opex-agent/schemas"
import { sendMessage } from "@/features/opex-agent/server/runner"
import { clientIpOf } from "@/features/opex-agent/server/rate-limit"
import { actorIdOf } from "@/features/opex-agent/server/scope"
import { createSession, listSessions } from "@/features/opex-agent/server/sessions"
import { requireOpexScope } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions — sessões do Agente Opex de quem está vendo (usuário ou visitante), da mais recente para a mais antiga. */
export const GET = withRoute(async () => ok(await listSessions(await requireOpexScope())))

/** POST /api/opex/sessions — cria a sessão e, com `text`, já envia a primeira mensagem. */
export const POST = withRoute(async ({ req }) => {
    const scope = await requireOpexScope()
    const body = await parseBody(req, createOpexSessionSchema)
    if (!body.ok) return body.response
    const actorId = actorIdOf(scope)
    const session = await createSession(actorId, scope)
    const message = body.data.text ? await sendMessage(session.id, { text: body.data.text }, actorId, scope, { ip: clientIpOf(req.headers) }) : null
    return created({ session, message })
})
