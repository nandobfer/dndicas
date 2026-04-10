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
            .select("_id name originalName source description hitDice spellcasting subclasses status")
            .sort({ name: 1 })
            .lean()

        const searched = query ? applyFuzzySearch(classes, query) : classes

        const results = searched.slice(0, limit).map((c: any) => ({
            id: String(c._id),
            _id: String(c._id),
            label: c.name,
            name: c.name,
            originalName: c.originalName,
            description: c.description,
            source: c.source,
            hitDice: c.hitDice,
            spellcasting: c.spellcasting,
            status: c.status || "active",
            subclasses: (c.subclasses || []).map((sub: any) => ({
                _id: String(sub._id),
                name: sub.name,
                description: sub.description,
                source: sub.source,
                image: sub.image,
                color: sub.color,
                spellcasting: sub.spellcasting,
                spellcastingAttribute: sub.spellcastingAttribute,
                spells: sub.spells,
                traits: sub.traits,
                progressionTable: sub.progressionTable,
            })),
        }))

        return NextResponse.json(results)
    } catch (error) {
        console.error("[API] GET /api/classes/search error:", error)
        return NextResponse.json({ error: "Erro ao buscar classes" }, { status: 500 })
    }
}
