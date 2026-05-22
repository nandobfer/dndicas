import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PUSHER_ORIGIN_HEADER } from "@/core/realtime/pusher-origin"
import { getSheetById, patchSheet, deleteSheet } from "@/features/character-sheets/api/character-sheets-service"
import { PatchSheetSchema, type PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const sheet = await getSheetById(id)
        if (!sheet) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 })
        return NextResponse.json(sheet)
    } catch (error) {
        console.error("[API] GET /api/character-sheets/[id] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id } = await params
        const body = await req.json()
        const parsed = PatchSheetSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const sheet = await patchSheet(id, userId, parsed.data as PatchSheetBody, originId)
        if (!sheet) return NextResponse.json({ error: "Ficha não encontrada ou não autorizado" }, { status: 404 })
        return NextResponse.json(sheet)
    } catch (error) {
        console.error("[API] PATCH /api/character-sheets/[id] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id } = await params
        const ok = await deleteSheet(id, userId)
        if (!ok) return NextResponse.json({ error: "Ficha não encontrada ou não autorizado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("[API] DELETE /api/character-sheets/[id] error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
