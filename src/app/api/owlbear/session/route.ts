import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createOwlbearSession } from "@/features/owlbear/server/session-service"

const OwlbearSessionRequestSchema = z.object({
    roomId: z.string().trim().min(1),
    owlbearPlayerId: z.string().trim().min(1),
    owlbearRole: z.enum(["GM", "PLAYER"]),
})

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const body = await req.json()
        const parsed = OwlbearSessionRequestSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const session = await createOwlbearSession({
            userId,
            roomId: parsed.data.roomId,
            owlbearPlayerId: parsed.data.owlbearPlayerId,
            owlbearRole: parsed.data.owlbearRole,
        })

        return NextResponse.json({
            token: session.token,
            expiresAt: session.expiresAt,
        }, { status: 201 })
    } catch (error) {
        console.error("[API] POST /api/owlbear/session error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
