import { created } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { reserveOpexFileSchema } from "@/features/opex-agent/schemas"
import { reserveOpexFile } from "@/features/opex-agent/server/files"
import { loadOpexSettings } from "@/features/opex-agent/server/settings"
import { requireOpexScope } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/opex/sessions/[id]/files — reserva o envio de um arquivo do chat (nome, tamanho e tipo) e
 * devolve a URL assinada do PUT direto no Storage S3 (só usuários logados). 413 `OPEX_FILE_TOO_LARGE`
 * acima do limite. Depois do PUT, confirme em `POST /api/opex/files/[id]/complete`.
 */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const scope = await requireOpexScope({ loggedIn: true })
    const body = await parseBody(req, reserveOpexFileSchema)
    if (!body.ok) return body.response
    const { settings } = await loadOpexSettings()
    return created(await reserveOpexFile(params.id, body.data, settings.files, scope))
})
