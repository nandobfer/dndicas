import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import dbConnect from "@/core/database/db"
import { UserNpcModel } from "@/features/monsters/models/user-npc"
import { updateMonsterSchema } from "@/features/monsters/api/validation"
import { getMonsterXp } from "@/features/monsters/utils/monster-calculations"

const SPEED_FIELDS = ["speed", "flySpeed", "swimSpeed", "climbSpeed"] as const

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()
        const npc = await UserNpcModel.findOne({ _id: id, userId: session.userId })
        if (!npc) return NextResponse.json({ error: "NPC não encontrado" }, { status: 404 })
        return NextResponse.json(serializeNpc(npc))
    } catch (error) {
        console.error("NPC GET by ID error:", error)
        return NextResponse.json({ error: "Erro ao buscar NPC" }, { status: 500 })
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json()
        const parseResult = updateMonsterSchema.safeParse(body)
        if (!parseResult.success) return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 })

        await dbConnect()
        const existing = await UserNpcModel.findOne({ _id: id, userId: session.userId })
        if (!existing) return NextResponse.json({ error: "NPC não encontrado" }, { status: 404 })

        const updateData = { ...parseResult.data } as Record<string, unknown>
        if (updateData.challengeRating) {
            updateData.experience = getMonsterXp(String(updateData.challengeRating), updateData.experienceOverride as number | undefined)
        }

        const unsetData = Object.fromEntries(
            SPEED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field) && (body[field] === null || body[field] === "")).map((field) => {
                delete updateData[field]
                return [field, ""]
            }),
        )
        const updateOperation = Object.keys(unsetData).length > 0 ? { $set: updateData, $unset: unsetData } : updateData

        const updated = await UserNpcModel.findOneAndUpdate({ _id: id, userId: session.userId }, updateOperation, { new: true })
        if (!updated) return NextResponse.json({ error: "NPC não encontrado" }, { status: 404 })

        return NextResponse.json(serializeNpc(updated))
    } catch (error) {
        console.error("NPC PUT error:", error)
        return NextResponse.json({ error: "Erro ao atualizar NPC" }, { status: 500 })
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()
        const npc = await UserNpcModel.findOneAndDelete({ _id: id, userId: session.userId })
        if (!npc) return NextResponse.json({ error: "NPC não encontrado" }, { status: 404 })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("NPC DELETE error:", error)
        return NextResponse.json({ error: "Erro ao excluir NPC" }, { status: 500 })
    }
}
