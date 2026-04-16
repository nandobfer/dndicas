import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PUSHER_ORIGIN_HEADER } from "@/core/realtime/pusher-origin"
import { updateItem, deleteItem } from "@/features/character-sheets/api/character-sheets-service"
import { PatchItemSchema } from "@/features/character-sheets/types/character-sheet.types"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id, itemId } = await params
        const body = await req.json()
        const parsed = PatchItemSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const item = await updateItem(id, itemId, parsed.data, originId)
        if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })
        return NextResponse.json(item)
    } catch (error) {
        console.error("[API] PATCH /api/character-sheets/[id]/items/[itemId] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id, itemId } = await params
        const originId = _req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const ok = await deleteItem(id, itemId, originId)
        if (!ok) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[API] DELETE /api/character-sheets/[id]/items/[itemId] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
