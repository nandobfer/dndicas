import { auth } from "@/core/auth/server"
import { PusherService } from "@/core/realtime/pusher-service"
import { OWLBEAR_AUTH_HANDOFF_EVENT } from "@/features/owlbear/config"
import { createOwlbearAuthHandoffToken, getOwlbearAuthHandoffChannel } from "@/features/owlbear/server/auth-handoff-token"
import { NextResponse } from "next/server"
import { z } from "zod"

const OwlbearPusherHandoffRequestSchema = z.object({
    channelId: z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
    nonce: z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
})

export async function POST(req: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Faça login no Dungeons & Dicas para usar a integração Owlbear." }, { status: 401 })
        }

        const body = await req.json()
        const parsed = OwlbearPusherHandoffRequestSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const handoffToken = createOwlbearAuthHandoffToken({
            userId,
            channelId: parsed.data.channelId,
            nonce: parsed.data.nonce,
        })
        const channel = getOwlbearAuthHandoffChannel(parsed.data.channelId)

        console.info("[API] POST /api/owlbear/auth/pusher-handoff publishing", {
            channel,
            userId,
            nonce: parsed.data.nonce,
        })

        await PusherService.getInstance().trigger(channel, OWLBEAR_AUTH_HANDOFF_EVENT, {
            handoffToken,
            nonce: parsed.data.nonce,
        })

        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error("[API] POST /api/owlbear/auth/pusher-handoff error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
