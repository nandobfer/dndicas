import { NextResponse, type NextRequest } from "next/server"
import { denyUnlessAdmin, requireAdminActor } from "@/features/auth/server/actor"
import { z } from "zod"
import { isIntegrationId } from "@/lib/integrations/catalog"
import { logApiError } from "@/lib/logger"
import { ExplorerError, executeExplorerOperation } from "@/features/integrations/openapi/explorer-service"
import { OpenApiSpecError } from "@/features/integrations/openapi/parser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

const stringMap = z.record(z.string().max(200), z.string().max(4000))

const executeSchema = z
    .object({
        operation: z.string().min(1, "Informe a operação").max(2100),
        path: stringMap.optional(),
        query: z.record(z.string().max(200), z.union([z.string().max(4000), z.array(z.string().max(4000)).max(50)])).optional(),
        headers: stringMap.optional(),
        body: z.string().max(1024 * 1024, "O corpo excede o limite de 1 MB").optional(),
    })
    .strict()

/**
 * POST /api/integrations/[id]/explore — executa uma operação da especificação OpenAPI com a
 * autenticação da integração injetada pelo servidor.
 */
export async function POST(request: NextRequest, { params }: Params) {
    const { id } = await params
    const denied = await denyUnlessAdmin(`integrations.${id}.explore`)
    if (denied) return denied
    if (!isIntegrationId(id)) {
        return NextResponse.json({ success: false, error: "Integração não encontrada" }, { status: 404 })
    }
    try {
        const parsed = executeSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos", code: "VALIDATION_ERROR" },
                { status: 400 },
            )
        }
        const data = await executeExplorerOperation(id, parsed.data, (await requireAdminActor(`integrations.${id}.explore`)).id, request.signal)
        return NextResponse.json({ success: true, data })
    } catch (error) {
        if (error instanceof ExplorerError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.status })
        }
        if (error instanceof OpenApiSpecError) {
            return NextResponse.json({ success: false, error: error.message, code: "INVALID_SPEC" }, { status: 422 })
        }
        logApiError({ route: "/api/integrations/[id]/explore", method: "POST", error })
        return NextResponse.json({ success: false, error: "Erro ao executar a operação" }, { status: 500 })
    }
}
