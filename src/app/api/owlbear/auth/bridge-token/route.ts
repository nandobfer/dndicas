import { auth } from "@/core/auth/server"
import { createOwlbearAuthBridgeToken } from "@/features/owlbear/server/auth-bridge-token"
import { NextResponse } from "next/server"

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Faça login no Dungeons & Dicas para usar a integração Owlbear." }, { status: 401 })
        }

        return NextResponse.json({ token: createOwlbearAuthBridgeToken(userId) })
    } catch (error) {
        console.error("[API] GET /api/owlbear/auth/bridge-token error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
