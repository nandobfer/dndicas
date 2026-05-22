import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/features/users/api/get-current-user"
import { getAllSheetsForAdmin } from "@/features/character-sheets/api/character-sheets-service"

export async function GET(request: NextRequest) {
    try {
        try {
            await requireAdmin()
        } catch {
            return NextResponse.json({ error: "Acesso negado. Apenas administradores podem listar fichas." }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const search = searchParams.get("search") || undefined
        const page = parseInt(searchParams.get("page") || "1", 10)
        const limit = parseInt(searchParams.get("limit") || "10", 10)

        const result = await getAllSheetsForAdmin(search, page, limit)
        return NextResponse.json(result)
    } catch (error) {
        console.error("[Admin Sheets API] GET error:", error)
        const message = error instanceof Error ? error.message : "Unknown error"
        return NextResponse.json({ error: "Erro ao listar fichas", details: message }, { status: 500 })
    }
}
