import { NextResponse, type NextRequest } from "next/server"
import { denyUnlessAdmin, requireAdminActor } from "@/features/auth/server/actor"
import { getIntegrationDef, isIntegrationId } from "@/lib/integrations/catalog"
import { logApiError } from "@/lib/logger"
import {
    getIntegrationDetail,
    IntegrationUpdateError,
    updateIntegration,
} from "@/features/integrations/services/integration-service"
import {
    buildIntegrationUpdateSchema,
    type IntegrationUpdateInput,
} from "@/features/integrations/schemas/integration.schema"

type Params = { params: Promise<{ id: string }> }

const notFound = () => NextResponse.json({ success: false, error: "Integração não encontrada" }, { status: 404 })

/** GET /api/integrations/[id] — configuração da integração; segredos só como "configurado". */
export async function GET(_request: NextRequest, { params }: Params) {
    const denied = await denyUnlessAdmin()
    if (denied) return denied
    const { id } = await params
    if (!isIntegrationId(id)) return notFound()
    try {
        const data = await getIntegrationDetail(id)
        return NextResponse.json({ success: true, data })
    } catch (error) {
        logApiError({ route: "/api/integrations/[id]", method: "GET", error })
        return NextResponse.json({ success: false, error: "Erro ao carregar a integração" }, { status: 500 })
    }
}

/** PATCH /api/integrations/[id] — salva campos, ambiente, modo debug e documentação Swagger. */
export async function PATCH(request: NextRequest, { params }: Params) {
    const denied = await denyUnlessAdmin()
    if (denied) return denied
    const { id } = await params
    if (!isIntegrationId(id)) return notFound()
    try {
        const def = getIntegrationDef(id)

        const body = await request.json().catch(() => null)
        const parsed = buildIntegrationUpdateSchema(def).safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: parsed.error.issues[0]?.message ?? "Dados inválidos",
                    code: "VALIDATION_ERROR",
                    details: parsed.error.issues,
                },
                { status: 400 },
            )
        }

        const data = await updateIntegration(id, parsed.data as IntegrationUpdateInput, (await requireAdminActor()).id)
        return NextResponse.json({ success: true, data, message: "Integração salva" })
    } catch (error) {
        if (error instanceof IntegrationUpdateError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status })
        }
        logApiError({ route: "/api/integrations/[id]", method: "PATCH", error })
        return NextResponse.json({ success: false, error: "Erro ao salvar a integração" }, { status: 500 })
    }
}
