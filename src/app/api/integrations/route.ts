import { NextResponse } from "next/server"
import { denyUnlessAdmin } from "@/features/auth/server/actor"
import { logApiError } from "@/lib/logger"
import { listIntegrations } from "@/features/integrations/services/integration-service"

/** GET /api/integrations — integrações com ambiente, modo debug e o último status do teste de conexão. */
export async function GET() {
    const denied = await denyUnlessAdmin("integrations.access")
    if (denied) return denied
    try {
        const data = await listIntegrations()
        return NextResponse.json({ success: true, data })
    } catch (error) {
        logApiError({ route: "/api/integrations", method: "GET", error })
        return NextResponse.json({ success: false, error: "Erro ao listar integrações" }, { status: 500 })
    }
}
