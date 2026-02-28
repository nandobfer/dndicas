import { NextRequest, NextResponse } from "next/server"
import { Spell } from "@/features/spells/models/spell"
import dbConnect from "@/core/database/db"
import { applyFuzzySearch } from "@/core/utils/search-engine"

/**
 * GET /api/spells/search - Search spells for mention system
 * Returns active spells only with fuzzy search logic
 */
export async function GET(req: NextRequest) {
    try {
        await dbConnect()
        const url = new URL(req.url)
        const query = url.searchParams.get("q") || ""
        const limitParam = url.searchParams.get("limit")
        const limit = limitParam ? parseInt(limitParam, 10) : undefined

        // Search only active spells
        const filter: any = { status: "active" }
        const spells = await Spell.find(filter).select("_id name circle school source description").sort({ name: 1 }).lean()

        // Apply fuzzy search locally using the shared function
        const searchedSpells = query ? applyFuzzySearch(spells, query) : spells

        // Transform to output format and apply limit if present
        const results = searchedSpells.map((spell) => ({
            id: String(spell._id),
            _id: String(spell._id),
            label: spell.name,
            name: spell.name,
            entityType: "Magia",
            circle: spell.circle,
            school: spell.school,
            source: spell.source,
            description: spell.description
        }))

        const finalResults = limit ? results.slice(0, limit) : results

        return NextResponse.json({ items: finalResults })
    } catch (error) {
        console.error("Spells search error:", error)
        return NextResponse.json({ error: "Failed to search spells" }, { status: 500 })
    }
}
