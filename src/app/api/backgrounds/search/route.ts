import { NextRequest, NextResponse } from "next/server"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import dbConnect from "@/core/database/db"

export async function GET(req: NextRequest) {
    try {
        await dbConnect()
        const url = new URL(req.url)
        const q = url.searchParams.get("q") || url.searchParams.get("query") || ""
        const limit = parseInt(url.searchParams.get("limit") || "10", 10)

        // Simple regex search for now
        const results = await BackgroundModel.find({
            $or: [
                { name: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } },
                { source: { $regex: q, $options: "i" } },
            ],
            status: "active"
        })
            .limit(limit)
            .sort({ name: 1 })

        return NextResponse.json(results)
    } catch (error) {
        console.error("Backgrounds search error:", error)
        return NextResponse.json({ error: "Search failed" }, { status: 500 })
    }
}
