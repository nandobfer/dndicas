import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/core/auth/server"
import { levelUpChoicesSchema } from "@/features/character-sheets/level-up/level-up-schemas"

/** Subida de nível da ficha (DND-56): GET = opções do próximo nível; POST = aplica as escolhas (validadas no servidor). */

async function errorResponse(error: unknown, label: string) {
    const { LevelUpError } = await import("@/features/character-sheets/level-up/level-up-context")
    if (error instanceof LevelUpError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error(`[API] ${label} /api/character-sheets/[id]/level-up error:`, error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
        const { id } = await params
        const subclass = req.nextUrl.searchParams.get("subclasse")
        const { getSheetLevelUp } = await import("@/features/character-sheets/level-up/level-up-service")
        return NextResponse.json(await getSheetLevelUp(id, userId, subclass))
    } catch (error) {
        return errorResponse(error, "GET")
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
        const { id } = await params
        const parsed = levelUpChoicesSchema.safeParse(await req.json().catch(() => null))
        if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        const { applySheetLevelUp } = await import("@/features/character-sheets/level-up/level-up-service")
        return NextResponse.json(await applySheetLevelUp(id, userId, parsed.data))
    } catch (error) {
        return errorResponse(error, "POST")
    }
}
