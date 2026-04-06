import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { applyLongRest } from "@/features/character-sheets/api/character-sheets-service"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id } = await params
        const sheet = await applyLongRest(id, userId)
        if (!sheet) return NextResponse.json({ error: "Ficha não encontrada ou não autorizado" }, { status: 404 })
        return NextResponse.json(sheet)
    } catch (error) {
        console.error("[API] POST /api/character-sheets/[id]/long-rest error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
