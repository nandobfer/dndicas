import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getTraits, createTrait } from "@/features/character-sheets/api/character-sheets-service"
import { CreateTraitSchema } from "@/features/character-sheets/types/character-sheet.types"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const traits = await getTraits(id)
        return NextResponse.json(traits)
    } catch (error) {
        console.error("[API] GET /api/character-sheets/[id]/traits error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const { id } = await params
        const body = await req.json()
        const parsed = CreateTraitSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const trait = await createTrait(id, parsed.data)
        return NextResponse.json(trait, { status: 201 })
    } catch (error) {
        console.error("[API] POST /api/character-sheets/[id]/traits error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
