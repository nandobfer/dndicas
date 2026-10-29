import { NextResponse } from "next/server"
import { buildPublicApiSpec } from "@/features/public-api/openapi/spec"

/**
 * GET /api/openapi.json — especificação OpenAPI 3.1 da API dndicas.
 *
 * Pública (sem token): expõe só o contrato, nenhum dado. É a `swaggerUrl` gerenciada
 * da integração API dndicas em Integrações.
 */
export const dynamic = "force-static"

export function GET() {
    return NextResponse.json(buildPublicApiSpec(), {
        headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
    })
}
