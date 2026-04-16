import { NextResponse } from "next/server"
import { PusherService } from "@/core/realtime/pusher-service"

export async function GET() {
    try {
        const config = PusherService.getInstance().getClientConfig()
        return NextResponse.json(config)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Realtime indisponível."
        return NextResponse.json({ error: message }, { status: 503 })
    }
}
