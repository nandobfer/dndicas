import { NextRequest, NextResponse } from "next/server"
import { getSheetBySlug } from "@/features/character-sheets/api/character-sheets-service"

export async function GET(req: NextRequest) {
    try {
        const slug = req.nextUrl.searchParams.get("slug")
        if (!slug) return NextResponse.json({ error: "Slug obrigatório" }, { status: 400 })

        const sheet = await getSheetBySlug(slug)
        if (!sheet) return NextResponse.json({ error: "Ficha não encontrada" }, { status: 404 })

        return NextResponse.json(sheet)
    } catch (error) {
        console.error("[API] GET /api/character-sheets/by-slug error:", error)
        return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
}
