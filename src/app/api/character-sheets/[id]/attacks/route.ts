import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PUSHER_ORIGIN_HEADER } from "@/core/realtime/pusher-origin"
import { getAttacks, createAttack } from "@/features/character-sheets/api/character-sheets-service"
import { CreateAttackSchema } from "@/features/character-sheets/types/character-sheet.types"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const attacks = await getAttacks(id)
        return NextResponse.json(attacks)
    } catch (error) {
        console.error("[API] GET /api/character-sheets/[id]/attacks error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id } = await params
        const body = await req.json()
        const parsed = CreateAttackSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const originId = req.headers.get(PUSHER_ORIGIN_HEADER) ?? undefined
        const attack = await createAttack(id, parsed.data, originId)
        return NextResponse.json(attack, { status: 201 })
    } catch (error) {
        console.error("[API] POST /api/character-sheets/[id]/attacks error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
