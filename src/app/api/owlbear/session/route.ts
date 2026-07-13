import { auth } from "@/core/auth/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { verifyOwlbearAuthBridgeToken } from "@/features/owlbear/server/auth-bridge-token"
import { buildAnonymousGmSessionUserId, buildAnonymousPlayerSessionUserId, createOwlbearSession } from "@/features/owlbear/server/session-service"

const OwlbearSessionRequestSchema = z.object({
    roomId: z.string().trim().min(1),
    owlbearPlayerId: z.string().trim().min(1),
    owlbearRole: z.enum(["GM", "PLAYER"]),
    bridgeToken: z.string().trim().min(1).optional(),
})

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const parsed = OwlbearSessionRequestSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const bridgeUserId = verifyOwlbearAuthBridgeToken(parsed.data.bridgeToken)
        const { userId } = bridgeUserId ? { userId: bridgeUserId } : await auth()
        const isAuthenticated = Boolean(userId)
        const sessionUserId = userId ?? (
            parsed.data.owlbearRole === "GM"
                ? buildAnonymousGmSessionUserId({
                    roomId: parsed.data.roomId,
                    owlbearPlayerId: parsed.data.owlbearPlayerId,
                })
                : buildAnonymousPlayerSessionUserId({
                    roomId: parsed.data.roomId,
                    owlbearPlayerId: parsed.data.owlbearPlayerId,
                })
        )

        const session = await createOwlbearSession({
            userId: sessionUserId,
            roomId: parsed.data.roomId,
            owlbearPlayerId: parsed.data.owlbearPlayerId,
            owlbearRole: parsed.data.owlbearRole,
        })

        return NextResponse.json({
            token: session.token,
            expiresAt: session.expiresAt,
            isAuthenticated,
        }, { status: 201 })
    } catch (error) {
        console.error("[API] POST /api/owlbear/session error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
