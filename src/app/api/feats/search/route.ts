import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/core/database/db"
import { Feat } from "@/features/feats/models/feat"
import { applyFuzzySearch } from "@/core/utils/search-engine"

/**
 * GET /api/feats/search - Search feats for mention system
 * Returns active feats only with fuzzy search logic
 */
export async function GET(req: NextRequest) {
    try {
        await dbConnect()

        const { searchParams } = new URL(req.url)
        const query = searchParams.get("query") || ""
        const limitParam = searchParams.get("limit")
        const limit = limitParam ? parseInt(limitParam, 10) : undefined

        // Search only active feats
        const searchQuery = { status: "active" }

        const feats = await Feat.find(searchQuery).select("_id name level description source").sort({ name: 1 }).lean()

        // Apply fuzzy search locally using the shared function
        const searchedFeats = query ? applyFuzzySearch(feats, query) : feats

        // Transform to output format and apply limit if present
        const results = searchedFeats.map((feat) => ({
            id: feat._id.toString(),
            _id: feat._id.toString(),
            label: feat.name,
            name: feat.name,
            entityType: "Talento",
            description: feat.description,
            source: feat.source,
            metadata: {
                level: (feat as any).level
            }
        }))

        const finalResults = limit ? results.slice(0, limit) : results

        return NextResponse.json({ items: finalResults })
    } catch (error) {
        console.error("Error searching feats for mentions:", error)
        return NextResponse.json({ error: "Failed to search feats" }, { status: 500 })
    }
}
