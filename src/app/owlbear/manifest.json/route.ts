import { NextResponse } from "next/server"
import { OWLBEAR_MANIFEST_ACTION_TITLE, OWLBEAR_POPOVER_SIZES } from "@/features/owlbear/config"

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

export function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: CORS_HEADERS,
    })
}

function getPublicOrigin(request: Request) {
    const forwardedProto = request.headers.get("x-forwarded-proto")
    const forwardedHost = request.headers.get("x-forwarded-host")

    if (forwardedProto && forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`
    }

    if (forwardedHost) {
        const protocol = request.url.startsWith("https://") ? "https" : "http"
        return `${protocol}://${forwardedHost}`
    }

    return new URL(request.url).origin
}

export function GET(request: Request) {
    const origin = getPublicOrigin(request)
    const iconUrl = `${origin}/dndicas-1.svg`

    return NextResponse.json(
        {
            name: "Dndicas",
            version: "0.1.0",
            manifest_version: 1,
            description: "Integração do Dndicas com Owlbear Rodeo.",
            icon: iconUrl,
            author: "nandoburgos",
            homepage_url: `${origin}/`,
            action: {
                title: OWLBEAR_MANIFEST_ACTION_TITLE,
                icon: iconUrl,
                popover: `${origin}/owlbear/action`,
                width: OWLBEAR_POPOVER_SIZES.catalogo.width,
                height: OWLBEAR_POPOVER_SIZES.catalogo.height,
            },
        },
        {
            headers: CORS_HEADERS,
        }
    )
}
