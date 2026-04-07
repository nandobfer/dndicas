import { NextRequest, NextResponse } from "next/server"
import { searchFeats } from "@/features/feats/api/feats-service"

/**
 * GET /api/feats/search - Search feats for mention system
 * Returns active feats only with fuzzy search logic
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const query = searchParams.get("query") || searchParams.get("q") || ""
        const limitParam = searchParams.get("limit")
        const limit = limitParam ? parseInt(limitParam, 10) : undefined

        const results = await searchFeats(query, limit)

        return NextResponse.json({ items: results })
    } catch (error) {
        console.error("Error searching feats for mentions:", error)
        return NextResponse.json({ error: "Failed to search feats" }, { status: 500 })
    }
}

