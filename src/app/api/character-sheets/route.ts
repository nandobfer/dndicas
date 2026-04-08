import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { getAllUserSheets, createBlankSheet } from "@/features/character-sheets/api/character-sheets-service"

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const url = new URL(req.url)
        const search = url.searchParams.get("search") ?? undefined
        const page = parseInt(url.searchParams.get("page") ?? "1", 10)
        const limit = parseInt(url.searchParams.get("limit") ?? "12", 10)

        const result = await getAllUserSheets(userId, search, page, limit)
        return NextResponse.json(result)
    } catch (error) {
        console.error("[API] GET /api/character-sheets error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}

export async function POST() {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

        const user = await currentUser()
        const username = user?.username || user?.firstName?.toLowerCase() || userId

        const sheet = await createBlankSheet(userId, username)
        return NextResponse.json(sheet, { status: 201 })
    } catch (error) {
        console.error("[API] POST /api/character-sheets error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
