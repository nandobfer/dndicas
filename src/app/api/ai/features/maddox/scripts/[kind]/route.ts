import { ok } from "@/lib/api/responses"
import { requireAdminActor } from "@/features/auth/server/actor"
import { DomainError, parseBody, withRoute } from "@/lib/api/route"
import { isMaddoxScriptKind, type MaddoxScriptKind } from "@/features/maddox/constants"
import { saveMaddoxScriptSchema } from "@/features/maddox/schemas"
import { getMaddoxScriptState, getMaddoxScriptVersion, saveMaddoxScript } from "@/features/maddox/server/scripts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function kindOf(value: string): MaddoxScriptKind {
    if (!isMaddoxScriptKind(value)) throw new DomainError(404, "Roteiro não encontrado", "MADDOX_SCRIPT_NOT_FOUND")
    return value
}

/** GET /api/ai/features/maddox/scripts/[kind]?version=N — uma versão do roteiro (sem `version`: vigente e histórico). */
export const GET = withRoute<{ kind: string }>(async ({ req, params }) => {
    await requireAdminActor("integrations.ai.view")
    const kind = kindOf(params.kind)
    const raw = new URL(req.url).searchParams.get("version")
    if (raw === null) return ok(await getMaddoxScriptState(kind))
    const version = Number(raw)
    if (!Number.isInteger(version) || version < 0) throw new DomainError(400, "Versão inválida", "INVALID_VERSION")
    const found = await getMaddoxScriptVersion(kind, version)
    if (!found) throw new DomainError(404, `Versão v${version} do roteiro não encontrada`, "MADDOX_SCRIPT_NOT_FOUND")
    return ok(found)
})

/** PUT /api/ai/features/maddox/scripts/[kind] — grava uma nova versão (`version` = vigente na abertura). */
export const PUT = withRoute<{ kind: string }>(async ({ req, params }) => {
    const actor = await requireAdminActor("integrations.ai.edit")
    const kind = kindOf(params.kind)
    const body = await parseBody(req, saveMaddoxScriptSchema)
    if (!body.ok) return body.response
    return ok(await saveMaddoxScript(kind, body.data, actor.id))
})
