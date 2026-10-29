import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { sendOpexMessageSchema } from "@/features/opex-agent/schemas"
import { sendMessage } from "@/features/opex-agent/server/runner"
import { clientIpOf } from "@/features/opex-agent/server/rate-limit"
import { actorIdOf } from "@/features/opex-agent/server/scope"
import { requireOpexScope } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/opex/sessions/[id]/messages — grava a mensagem (texto e/ou `fileIds` já confirmados) e
 * inicia o turno em segundo plano (a resposta chega pelo stream). 409 com a sessão ocupada ou o
 * agente indisponível; 429 acima do limite de turnos dos visitantes.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const scope = await requireOpexScope()
    const body = await parseBody(req, sendOpexMessageSchema)
    if (!body.ok) return body.response
    return created(await sendMessage(params.id, body.data, actorIdOf(scope), scope, { ip: clientIpOf(req.headers) }))
})
