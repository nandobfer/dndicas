import { NextResponse, type NextRequest } from "next/server"
import { denyUnlessAdmin } from "@/features/auth/server/actor"
import { isIntegrationId } from "@/lib/integrations/catalog"
import { logApiError } from "@/lib/logger"
import { ExplorerError, getExplorerSpec } from "@/features/integrations/openapi/explorer-service"
import { OpenApiSpecError } from "@/features/integrations/openapi/parser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/integrations/[id]/openapi — especificação OpenAPI 3.x normalizada da documentação
 * Swagger cadastrada (cache de 10 min por instância; `?refresh=1` força). Nunca devolve credenciais.
 */
export async function GET(request: NextRequest, { params }: Params) {
    const { id } = await params
    const denied = await denyUnlessAdmin(`integrations.${id}.explore`)
    if (denied) return denied
    if (!isIntegrationId(id)) {
        return NextResponse.json({ success: false, error: "Integração não encontrada" }, { status: 404 })
    }
    try {
        const refresh = request.nextUrl.searchParams.get("refresh") === "1"
        const data = await getExplorerSpec(id, { refresh })
        return NextResponse.json({ success: true, data })
    } catch (error) {
        if (error instanceof ExplorerError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status })
        }
        if (error instanceof OpenApiSpecError) {
            return NextResponse.json({ success: false, error: error.message, code: "INVALID_SPEC" }, { status: 422 })
        }
        logApiError({ route: "/api/integrations/[id]/openapi", method: "GET", error })
        return NextResponse.json({ success: false, error: "Erro ao carregar a documentação da integração" }, { status: 500 })
    }
}
