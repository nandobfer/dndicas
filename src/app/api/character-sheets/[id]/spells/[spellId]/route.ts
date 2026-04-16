import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PUSHER_ORIGIN_HEADER } from "@/core/realtime/pusher-origin"
import { updateSpell, deleteSpell } from "@/features/character-sheets/api/character-sheets-service"
import { PatchSpellSchema } from "@/features/character-sheets/types/character-sheet.types"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; spellId: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id, spellId } = await params
        const body = await req.json()
        const parsed = PatchSpellSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const spell = await updateSpell(id, spellId, parsed.data, originId)
        if (!spell) return NextResponse.json({ error: "Magia não encontrada" }, { status: 404 })
        return NextResponse.json(spell)
    } catch (error) {
        console.error("[API] PATCH /api/character-sheets/[id]/spells/[spellId] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; spellId: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id, spellId } = await params
        const originId = _req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const ok = await deleteSpell(id, spellId, originId)
        if (!ok) return NextResponse.json({ error: "Magia não encontrada" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[API] DELETE /api/character-sheets/[id]/spells/[spellId] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
