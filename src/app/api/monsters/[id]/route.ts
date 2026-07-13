import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/core/auth/server"
import dbConnect from "@/core/database/db"
import { createAuditLog } from "@/features/users/api/audit-service"
import { MonsterModel } from "@/features/monsters/models/monster"
import { updateMonsterSchema } from "@/features/monsters/api/validation"
import { getMonsterXp } from "@/features/monsters/utils/monster-calculations"

const SPEED_FIELDS = ["speed", "flySpeed", "swimSpeed", "climbSpeed"] as const

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        await dbConnect()
        const monster = await MonsterModel.findById(id)
        if (!monster) return NextResponse.json({ error: "Monstro não encontrado" }, { status: 404 })
        return NextResponse.json(serializeMonster(monster))
    } catch (error) {
        console.error("Monster GET by ID error:", error)
        return NextResponse.json({ error: "Erro ao buscar monstro" }, { status: 500 })
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
        const oldMonster = await MonsterModel.findById(id)
        if (!oldMonster) return NextResponse.json({ error: "Monstro não encontrado" }, { status: 404 })

        const updateData = { ...parseResult.data }
        if (updateData.challengeRating) {
            updateData.experience = getMonsterXp(updateData.challengeRating, updateData.experienceOverride)
        }

        const unsetData = Object.fromEntries(
            SPEED_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field) && (body[field] === null || body[field] === "")).map((field) => {
                delete updateData[field]
                return [field, ""]
            }),
        )
        const updateOperation = Object.keys(unsetData).length > 0 ? { $set: updateData, $unset: unsetData } : updateData

        const newMonster = await MonsterModel.findByIdAndUpdate(id, updateOperation, { new: true })
        if (!newMonster) return NextResponse.json({ error: "Monstro não encontrado" }, { status: 404 })

        try {
            await createAuditLog({
                action: "UPDATE",
                entity: "Monstro",
                entityId: String(newMonster._id),
                performedBy: session.userId,
                previousData: serializeMonster(oldMonster) as unknown as Record<string, unknown>,
                newData: serializeMonster(newMonster) as unknown as Record<string, unknown>,
            })
        } catch (auditError) {
            console.warn("Failed to create audit log for monster update", auditError)
        }

        return NextResponse.json(serializeMonster(newMonster))
    } catch (error) {
        console.error("Monster PUT error:", error)
        return NextResponse.json({ error: "Erro ao atualizar monstro" }, { status: 500 })
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const session = await auth()
        if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()
        const monster = await MonsterModel.findById(id)
        if (!monster) return NextResponse.json({ error: "Monstro não encontrado" }, { status: 404 })

        await MonsterModel.findByIdAndDelete(id)

        try {
            await createAuditLog({
                action: "DELETE",
                entity: "Monstro",
                entityId: id,
                performedBy: session.userId,
                previousData: serializeMonster(monster) as unknown as Record<string, unknown>,
            })
        } catch (auditError) {
            console.warn("Failed to create audit log for monster deletion", auditError)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Monster DELETE error:", error)
        return NextResponse.json({ error: "Erro ao excluir monstro" }, { status: 500 })
    }
}
