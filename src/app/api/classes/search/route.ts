import { NextRequest, NextResponse } from "next/server"
import { CharacterClass } from "@/features/classes/models/character-class"
import dbConnect from "@/core/database/db"
import { applyFuzzySearch } from "@/core/utils/search-engine"

/**
 * GET /api/classes/search — Search classes for mention/autocomplete system
 * Returns active classes only with fuzzy search logic
 */
export async function GET(req: NextRequest) {
    try {
        await dbConnect()
        const url = new URL(req.url)
        const query = url.searchParams.get("q") || ""
        const limitParam = url.searchParams.get("limit")
        const limit = limitParam ? parseInt(limitParam, 10) : 10

        const classes = await CharacterClass.find({ status: "active" })
            .select("_id name source description hitDice spellcasting")
            .sort({ name: 1 })
            .lean()

        const searched = query ? applyFuzzySearch(classes, query) : classes

        const results = searched.slice(0, limit).map((c: any) => ({
            id: String(c._id),
            _id: String(c._id),
            label: c.name,
            name: c.name,
            description: c.description,
            source: c.source,
            hitDice: c.hitDice,
            spellcasting: c.spellcasting,
        }))

        return NextResponse.json(results)
    } catch (error) {
        console.error("[API] GET /api/classes/search error:", error)
        return NextResponse.json({ error: "Erro ao buscar classes" }, { status: 500 })
    }
}
