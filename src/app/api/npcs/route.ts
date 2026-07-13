import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/core/auth/server"
import dbConnect from "@/core/database/db"
import { applyFuzzySearch } from "@/core/utils/search-engine"
import { UserNpcModel } from "@/features/monsters/models/user-npc"
import { createMonsterSchema } from "@/features/monsters/api/validation"
import { getMonsterXp } from "@/features/monsters/utils/monster-calculations"

function serializeNpc(npc: { toObject?: () => Record<string, unknown> } | Record<string, unknown>) {
    const base = typeof npc.toObject === "function" ? npc.toObject() : npc
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
        const session = await auth()
        if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()
        const url = new URL(req.url)
        const page = Number.parseInt(url.searchParams.get("page") || "1", 10)
        const limit = Number.parseInt(url.searchParams.get("limit") || "10", 10)
        const search = url.searchParams.get("search") || ""
        const status = url.searchParams.get("status")
        const type = url.searchParams.get("type")
        const size = url.searchParams.get("size")
        const challengeRating = url.searchParams.get("challengeRating")

        const query: Record<string, unknown> = { userId: session.userId }
        if (status && status !== "all") query.status = status
        if (type && type !== "all") query.type = { $in: type.split(",").map((item) => item.trim()).filter(Boolean) }
        if (size && size !== "all") query.size = { $in: size.split(",").map((item) => item.trim()).filter(Boolean) }
        if (challengeRating && challengeRating !== "all") query.challengeRating = challengeRating

        const npcs = (await UserNpcModel.find(query).sort({ name: 1 })).map(serializeNpc)
        const searched = search ? applyFuzzySearch(npcs, search) : npcs
        const total = searched.length
        const offset = (page - 1) * limit
        const items = limit ? searched.slice(offset, offset + limit) : searched

        return NextResponse.json({ items, total, page, limit })
    } catch (error) {
        console.error("NPCs GET error:", error)
        return NextResponse.json({ error: "Erro ao buscar NPCs" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json()
        const parseResult = createMonsterSchema.safeParse(body)
        if (!parseResult.success) return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 })

        await dbConnect()
        const existing = await UserNpcModel.findOne({ userId: session.userId, name: parseResult.data.name })
        if (existing) return NextResponse.json({ error: "Você já tem um NPC com este nome." }, { status: 409 })

        const data = {
            ...parseResult.data,
            userId: session.userId,
            experience: getMonsterXp(parseResult.data.challengeRating, parseResult.data.experienceOverride),
        }

        const npc = await UserNpcModel.create(data)
        return NextResponse.json(serializeNpc(npc), { status: 201 })
    } catch (error) {
        console.error("NPC POST error:", error)
        return NextResponse.json({ error: "Erro ao criar NPC" }, { status: 500 })
    }
}
