import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PUSHER_ORIGIN_HEADER } from "@/core/realtime/pusher-origin"
import { updateAttack, deleteAttack } from "@/features/character-sheets/api/character-sheets-service"
import { PatchAttackSchema } from "@/features/character-sheets/types/character-sheet.types"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; attackId: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id, attackId } = await params
        const body = await req.json()
        const parsed = PatchAttackSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const attack = await updateAttack(id, attackId, parsed.data, originId)
        if (!attack) return NextResponse.json({ error: "Ataque não encontrado" }, { status: 404 })
        return NextResponse.json(attack)
    } catch (error) {
        console.error("[API] PATCH /api/character-sheets/[id]/attacks/[attackId] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; attackId: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id, attackId } = await params
        const originId = _req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const ok = await deleteAttack(id, attackId, originId)
        if (!ok) return NextResponse.json({ error: "Ataque não encontrado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[API] DELETE /api/character-sheets/[id]/attacks/[attackId] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
