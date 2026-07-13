import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/core/auth/server"
import { z } from "zod"
import dbConnect from "@/core/database/db"
import { MonsterModel } from "@/features/monsters/models/monster"
import { UserNpcModel } from "@/features/monsters/models/user-npc"
import { getMonsterXp } from "@/features/monsters/utils/monster-calculations"

const copyNpcSchema = z.object({
    sourceType: z.enum(["monster", "npc"]),
    sourceId: z.string().min(1),
})

const COPY_FIELDS = [
    "name",
    "originalName",
    "source",
    "description",
    "image",
    "status",
    "type",
    "size",
    "alignment",
    "armorClass",
    "initiative",
    "hitPointsFormula",
    "speed",
    "flySpeed",
    "swimSpeed",
    "climbSpeed",
    "attributes",
    "savingThrows",
    "skills",
    "senses",
    "sensesAndLanguages",
    "challengeRating",
    "experienceOverride",
    "proficiencyBonusOverride",
    "languages",
    "damageVulnerabilities",
    "damageResistances",
    "damageImmunities",
    "conditionImmunities",
    "conditionImmunityNotes",
    "traits",
    "actions",
    "bonusActions",
    "reactions",
    "legendaryActions",
    "legendaryActionUses",
    "lairActions",
    "lairActionInitiative",
    "regionalEffects",
] as const

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

function buildCopyName(baseName: string, copyNumber: number) {
    const suffix = copyNumber === 1 ? " (Cópia)" : ` (Cópia ${copyNumber})`
    return `${baseName.slice(0, 100 - suffix.length).trim()}${suffix}`
}

async function getUniqueNpcName(userId: string, sourceName: string) {
    let copyNumber = 1
    let name = buildCopyName(sourceName, copyNumber)

    while (await UserNpcModel.findOne({ userId, name })) {
        copyNumber += 1
        name = buildCopyName(sourceName, copyNumber)
    }

    return name
}

function buildNpcCopyData(source: Record<string, unknown>, name: string, userId: string) {
    const data: Record<string, unknown> = { userId, name }

    COPY_FIELDS.forEach((field) => {
        if (field === "name") return
        if (source[field] !== undefined) data[field] = source[field]
    })

    const challengeRating = typeof data.challengeRating === "string" ? data.challengeRating : "0"
    data.experience = getMonsterXp(challengeRating, typeof data.experienceOverride === "number" ? data.experienceOverride : undefined)

    return data
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json()
        const parseResult = copyNpcSchema.safeParse(body)
        if (!parseResult.success) return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 })

        await dbConnect()

        const sourceDocument =
            parseResult.data.sourceType === "monster"
                ? await MonsterModel.findById(parseResult.data.sourceId)
                : await UserNpcModel.findOne({ _id: parseResult.data.sourceId, userId: session.userId })

        if (!sourceDocument) {
            const label = parseResult.data.sourceType === "monster" ? "Monstro" : "NPC"
            return NextResponse.json({ error: `${label} não encontrado` }, { status: 404 })
        }

        const source = serializeNpc(sourceDocument)
        const name = await getUniqueNpcName(session.userId, String(source.name || "NPC"))
        const npc = await UserNpcModel.create(buildNpcCopyData(source, name, session.userId))

        return NextResponse.json(serializeNpc(npc), { status: 201 })
    } catch (error) {
        console.error("NPC copy POST error:", error)
        return NextResponse.json({ error: "Erro ao copiar para NPC" }, { status: 500 })
    }
}
