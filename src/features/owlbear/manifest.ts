import { NextResponse } from "next/server"
import { OWLBEAR_ACTION_SIZE, OWLBEAR_ACTIONS } from "./config"

export const OWLBEAR_MANIFEST_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

export type OwlbearManifestActionKey = keyof typeof OWLBEAR_ACTIONS

export function getPublicOrigin(request: Request) {
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

export function getOwlbearManifestResponse(request: Request, actionKey: OwlbearManifestActionKey) {
    const origin = getPublicOrigin(request)
    const definition = OWLBEAR_ACTIONS[actionKey]
    const actionSize = "actionSize" in definition ? definition.actionSize : OWLBEAR_ACTION_SIZE
    const iconUrl = `${origin}${definition.iconPath}`

    return NextResponse.json(
        {
            name: definition.title,
            version: "0.1.0",
            manifest_version: 1,
            description: "Integração do Dndicas com Owlbear Rodeo.",
            icon: iconUrl,
            author: "nandoburgos",
            homepage_url: `${origin}/`,
            background_url: "backgroundPath" in definition ? `${origin}${definition.backgroundPath}` : undefined,
            action: {
                title: definition.title,
                icon: iconUrl,
                popover: `${origin}${definition.actionPath}`,
                width: actionSize.width,
                height: actionSize.height,
            },
        },
        {
            headers: OWLBEAR_MANIFEST_CORS_HEADERS,
        }
    )
}

export function getOwlbearManifestOptionsResponse() {
    return new NextResponse(null, {
        status: 204,
        headers: OWLBEAR_MANIFEST_CORS_HEADERS,
    })
}
