import { created } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { completeOpexFile } from "@/features/opex-agent/server/files"
import { loadOpexSettings } from "@/features/opex-agent/server/settings"
import { requireOpexScope } from "@/features/opex-agent/server/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/files/[id]/complete — confirma o envio (HeadObject, confere o tamanho e promove). Idempotente. */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const scope = await requireOpexScope({ loggedIn: true })
    const { settings } = await loadOpexSettings()
    return created(await completeOpexFile(params.id, settings.files, scope))
})
