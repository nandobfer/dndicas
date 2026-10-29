import { renderPublicApiDocsHtml } from "@/features/public-api/openapi/docs-page"
import { withBasePath } from "@/lib/base-path"
import { PUBLIC_API_SPEC_PATH } from "@/lib/public-api/paths"

/**
 * GET /api/docs — página Swagger UI da API dndicas, para terceiros explorarem
 * a especificação `/api/openapi.json`. Pública: nenhum dado é exposto.
 */
export const dynamic = "force-static"

export function GET() {
    return new Response(renderPublicApiDocsHtml(withBasePath(PUBLIC_API_SPEC_PATH)), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
    })
}
