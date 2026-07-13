import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@/core/auth/server"
import { createBlankSheet, patchSheet } from "@/features/character-sheets/api/character-sheets-service"
import { CreateAssistedSheetSchema, type PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const body = await req.json()
        const parsed = CreateAssistedSheetSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        const user = await currentUser()
        const username = user?.username || user?.firstName?.toLowerCase() || userId
        const { name, ...rest } = parsed.data.sheet
        const created = await createBlankSheet(userId, username, name)
        const patchBody = rest as PatchSheetBody
        const updated = Object.keys(patchBody).length > 0
            ? await patchSheet(created._id, userId, patchBody)
            : created

        return NextResponse.json(updated ?? created, { status: 201 })
    } catch (error) {
        console.error("[API] POST /api/character-sheets/assisted error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
