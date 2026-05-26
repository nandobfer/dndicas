import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import dbConnect from "@/core/database/db"
import { applyFuzzySearch } from "@/core/utils/search-engine"
import { createAuditLog } from "@/features/users/api/audit-service"
import { MonsterModel } from "@/features/monsters/models/monster"
import { createMonsterSchema } from "@/features/monsters/api/validation"
import { getMonsterProficiencyBonus, getMonsterXp } from "@/features/monsters/utils/monster-calculations"

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

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

function sortMonstersByName(monsters: Record<string, unknown>[]) {
    return [...monsters].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }))
}

export async function GET(req: NextRequest) {
    try {
        await dbConnect()
        const url = new URL(req.url)
        const page = Number.parseInt(url.searchParams.get("page") || "1", 10)
        const limit = Number.parseInt(url.searchParams.get("limit") || "10", 10)
        const search = url.searchParams.get("search") || ""
        const status = url.searchParams.get("status")
        const type = url.searchParams.get("type")
        const size = url.searchParams.get("size")
        const challengeRating = url.searchParams.get("challengeRating")
        const sourcesParam = url.searchParams.get("sources")

        const query: Record<string, unknown> = {}
        if (status && status !== "all") query.status = status
        if (type && type !== "all") query.type = { $in: type.split(",").map((item) => item.trim()).filter(Boolean) }
        if (size && size !== "all") query.size = { $in: size.split(",").map((item) => item.trim()).filter(Boolean) }
        if (challengeRating && challengeRating !== "all") query.challengeRating = challengeRating
        if (sourcesParam) {
            const sources = sourcesParam.split(",").map((source) => source.trim()).filter(Boolean)
            if (sources.length > 0) query.source = { $in: sources.map((source) => new RegExp(`^${escapeRegex(source)}`, "i")) }
        }

        const monsters = (await MonsterModel.find(query).sort({ name: 1 })).map(serializeMonster)
        const searched = sortMonstersByName(search ? applyFuzzySearch(monsters, search) : monsters)
        const total = searched.length
        const offset = (page - 1) * limit
        const items = limit ? searched.slice(offset, offset + limit) : searched

        return NextResponse.json({ items, total, page, limit })
    } catch (error) {
        console.error("Monsters GET error:", error)
        return NextResponse.json({ error: "Erro ao buscar monstros" }, { status: 500 })
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
        const existing = await MonsterModel.findOne({ name: parseResult.data.name })
        if (existing) return NextResponse.json({ error: "Já existe um monstro com este nome." }, { status: 409 })

        const data = {
            ...parseResult.data,
            experience: getMonsterXp(parseResult.data.challengeRating, parseResult.data.experienceOverride),
            proficiencyBonusOverride: parseResult.data.proficiencyBonusOverride,
        }
        if (data.proficiencyBonusOverride === undefined) {
            data.proficiencyBonusOverride = undefined
        } else {
            getMonsterProficiencyBonus(data.challengeRating, data.proficiencyBonusOverride)
        }

        const monster = await MonsterModel.create(data)
        const serialized = serializeMonster(monster)

        try {
            await createAuditLog({
                action: "CREATE",
                entity: "Monstro",
                entityId: String(monster._id),
                performedBy: session.userId,
                newData: serialized as unknown as Record<string, unknown>,
            })
        } catch (auditError) {
            console.warn("Failed to create audit log for monster creation", auditError)
        }

        return NextResponse.json(serialized, { status: 201 })
    } catch (error) {
        console.error("Monster POST error:", error)
        return NextResponse.json({ error: "Erro ao criar monstro" }, { status: 500 })
    }
}
