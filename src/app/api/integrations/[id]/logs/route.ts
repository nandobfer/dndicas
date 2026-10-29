import { NextResponse, type NextRequest } from "next/server"
import { denyUnlessAdmin } from "@/features/auth/server/actor"
import { isIntegrationId } from "@/lib/integrations/catalog"
import { logApiError } from "@/lib/logger"
import { listIntegrationLogs } from "@/features/integrations/services/integration-service"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/integrations/[id]/logs?after=<ISO>&limit=<n>&scope=<escopo> — logs de debug persistidos
 * (48h). `scope` filtra as linhas de um recurso (`data.scope`, ex.: uma central de desenvolvimento).
 * Fallback do terminal quando o Pusher não está disponível, e carga inicial quando está.
 */
export async function GET(request: NextRequest, { params }: Params) {
    const denied = await denyUnlessAdmin()
    if (denied) return denied
    const { id } = await params
    if (!isIntegrationId(id)) {
        return NextResponse.json({ success: false, error: "Integração não encontrada" }, { status: 404 })
    }
    try {
        const after = request.nextUrl.searchParams.get("after")
        const limit = Number(request.nextUrl.searchParams.get("limit") ?? "500")
        const afterDate = after ? new Date(after) : undefined
        const scope = request.nextUrl.searchParams.get("scope")?.trim().slice(0, 100) || undefined
        const data = await listIntegrationLogs(id, {
            scope,
            after: afterDate && !Number.isNaN(afterDate.getTime()) ? afterDate : undefined,
            limit: Number.isFinite(limit) ? limit : 500,
        })
        return NextResponse.json({ success: true, data })
    } catch (error) {
        logApiError({ route: "/api/integrations/[id]/logs", method: "GET", error })
        return NextResponse.json({ success: false, error: "Erro ao carregar os logs" }, { status: 500 })
    }
}
