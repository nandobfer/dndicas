import { NextResponse, type NextRequest } from "next/server"
import { PusherService } from "@/core/realtime/pusher-service"

export const dynamic = "force-dynamic"

/**
 * GET /api/realtime/pusher-config — configuração pública do Pusher para o navegador, vinda da
 * integração "Pusher" (Integrações). O endereço público que combina com o host da página é
 * escolhido pelo servidor a partir do `Host` e do esquema da requisição.
 */
export async function GET(request: NextRequest) {
    try {
        const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
        const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host).split(":")[0] ?? ""
        const protocol = forwardedProto ? `${forwardedProto}:` : request.nextUrl.protocol
        const config = await PusherService.getInstance().getClientConfig({ hostname: host, protocol })
        return NextResponse.json(config)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Realtime indisponível."
        return NextResponse.json({ error: message }, { status: 503 })
    }
}
