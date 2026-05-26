import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/core/database/db"
import { applyFuzzySearch } from "@/core/utils/search-engine"
import { MonsterModel } from "@/features/monsters/models/monster"

function serializeMonster(monster: { toObject?: () => Record<string, unknown> } | Record<string, unknown>) {
    const base = typeof monster.toObject === "function" ? monster.toObject() : monster
    return {
        ...base,
        id: String(base._id),
        _id: String(base._id),
        savingThrows: base.savingThrows instanceof Map ? Object.fromEntries(base.savingThrows) : base.savingThrows || {},
        skills: base.skills instanceof Map ? Object.fromEntries(base.skills) : base.skills || {},
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const query = searchParams.get("q") || searchParams.get("query") || ""
        await dbConnect()
        const monsters = (await MonsterModel.find({ status: "active" }).sort({ name: 1 })).map(serializeMonster)
        if (!query) return NextResponse.json({ items: monsters })
        return NextResponse.json({ items: applyFuzzySearch(monsters, query).slice(0, 15) })
    } catch (error) {
        console.error("Monsters search error:", error)
        return NextResponse.json({ error: "Search failed" }, { status: 500 })
    }
}
