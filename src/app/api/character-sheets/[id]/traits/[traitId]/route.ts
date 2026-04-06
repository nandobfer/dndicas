import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { deleteTrait } from "@/features/character-sheets/api/character-sheets-service"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; traitId: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id, traitId } = await params
        const ok = await deleteTrait(id, traitId)
        if (!ok) return NextResponse.json({ error: "Traço não encontrado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[API] DELETE /api/character-sheets/[id]/traits/[traitId] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
