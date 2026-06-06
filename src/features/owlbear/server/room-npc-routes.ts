import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import dbConnect from "@/core/database/db"
import { createMonsterSchema } from "@/features/monsters/api/validation"
import { MonsterModel } from "@/features/monsters/models/monster"
import { UserNpcModel } from "@/features/monsters/models/user-npc"
import { getMonsterXp } from "@/features/monsters/utils/monster-calculations"
import { OwlbearRoomNpc, type OwlbearRoomNpcSourceKind } from "../models/owlbear-room-npc"
import { OwlbearHttpError, owlbearErrorResponse, requireOwlbearSession } from "./auth"
import { isAnonymousGmSessionUserId } from "./session-service"

const LinkRoomNpcSchema = z.object({
    sourceKind: z.enum(["userNpc", "monster"]),
    sourceId: z.string().trim().min(1),
    hpCurrent: z.coerce.number().int().min(0),
    hpMax: z.coerce.number().int().min(0),
})

const PatchRoomNpcSchema = z.object({
    hpCurrent: z.coerce.number().int().min(0).optional(),
    hpMax: z.coerce.number().int().min(0).optional(),
})

function serializeMonsterLike(value: { toObject?: () => Record<string, unknown> } | Record<string, unknown>) {
    const base = typeof value.toObject === "function" ? value.toObject() : value
    return {
        ...base,
        id: String(base._id),
        _id: String(base._id),
        savingThrows: base.savingThrows instanceof Map ? Object.fromEntries(base.savingThrows) : base.savingThrows || {},
        skills: base.skills instanceof Map ? Object.fromEntries(base.skills) : base.skills || {},
    }
}

function serializeRoomNpc(entry: { toObject?: () => Record<string, unknown> } | Record<string, unknown>, source: Record<string, unknown> | null) {
    const base = typeof entry.toObject === "function" ? entry.toObject() : entry
    return {
        id: String(base._id),
        _id: String(base._id),
        roomId: String(base.roomId),
        sourceKind: base.sourceKind as OwlbearRoomNpcSourceKind,
        sourceId: String(base.sourceId),
        hpCurrent: Number(base.hpCurrent ?? 0),
        hpMax: Number(base.hpMax ?? 0),
        createdAt: base.createdAt instanceof Date ? base.createdAt.toISOString() : String(base.createdAt ?? ""),
        updatedAt: base.updatedAt instanceof Date ? base.updatedAt.toISOString() : String(base.updatedAt ?? ""),
        source,
    }
}

async function requireRoomNpcGm(req: NextRequest, roomId: string) {
    const session = await requireOwlbearSession(req)
    if (session.owlbearRole !== "GM") {
        throw new OwlbearHttpError(403, "Apenas o mestre pode gerenciar NPCs da sala")
    }
    if (session.roomId !== roomId) {
        throw new OwlbearHttpError(403, "Sessão Owlbear não corresponde a esta sala")
    }
    if (isAnonymousGmSessionUserId(session.userId)) {
        throw new OwlbearHttpError(401, "Faça login no Dndicas para gerenciar NPCs da sala")
    }
    return session
}

async function findSource(sourceKind: OwlbearRoomNpcSourceKind, sourceId: string, userId: string) {
    if (sourceKind === "userNpc") {
        return UserNpcModel.findOne({ _id: sourceId, userId })
    }
    return MonsterModel.findById(sourceId)
}

async function loadSources(entries: Array<{ sourceKind: OwlbearRoomNpcSourceKind; sourceId: string }>, userId: string) {
    const userNpcIds = entries.filter((entry) => entry.sourceKind === "userNpc").map((entry) => entry.sourceId)
    const monsterIds = entries.filter((entry) => entry.sourceKind === "monster").map((entry) => entry.sourceId)
    const [userNpcs, monsters] = await Promise.all([
        userNpcIds.length > 0 ? UserNpcModel.find({ _id: { $in: userNpcIds }, userId }) : Promise.resolve([]),
        monsterIds.length > 0 ? MonsterModel.find({ _id: { $in: monsterIds } }) : Promise.resolve([]),
    ])

    const sources = new Map<string, Record<string, unknown>>()
    userNpcs.forEach((source) => sources.set(`userNpc:${String(source._id)}`, serializeMonsterLike(source)))
    monsters.forEach((source) => sources.set(`monster:${String(source._id)}`, serializeMonsterLike(source)))
    return sources
}

export async function getOwlbearRoomNpcs(req: NextRequest, roomId: string) {
    try {
        const session = await requireRoomNpcGm(req, roomId)
        await dbConnect()

        const entries = await OwlbearRoomNpc.find({ roomId, userId: session.userId }).sort({ updatedAt: -1 })
        const sources = await loadSources(entries.map((entry) => ({
            sourceKind: entry.sourceKind,
            sourceId: entry.sourceId,
        })), session.userId)

        return NextResponse.json({
            items: entries.map((entry) => serializeRoomNpc(entry, sources.get(`${entry.sourceKind}:${entry.sourceId}`) ?? null)),
        })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] GET /api/owlbear/rooms/[roomId]/npcs error:")
    }
}

export async function postOwlbearRoomNpc(req: NextRequest, roomId: string) {
    try {
        const session = await requireRoomNpcGm(req, roomId)
        const body = await req.json()
        const parsed = LinkRoomNpcSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        await dbConnect()
        const source = await findSource(parsed.data.sourceKind, parsed.data.sourceId, session.userId)
        if (!source) {
            return NextResponse.json({ error: "NPC ou monstro não encontrado" }, { status: 404 })
        }

        const hpMax = parsed.data.hpMax
        const hpCurrent = Math.max(0, Math.min(hpMax, parsed.data.hpCurrent))
        const entry = await OwlbearRoomNpc.create({
            roomId,
            userId: session.userId,
            sourceKind: parsed.data.sourceKind,
            sourceId: parsed.data.sourceId,
            hpCurrent,
            hpMax,
        })

        return NextResponse.json(serializeRoomNpc(entry, serializeMonsterLike(source)), { status: 201 })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/rooms/[roomId]/npcs error:")
    }
}

export async function postOwlbearRoomUserNpc(req: NextRequest, roomId: string) {
    try {
        const session = await requireRoomNpcGm(req, roomId)
        const body = await req.json()
        const parsed = createMonsterSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        await dbConnect()
        const existing = await UserNpcModel.findOne({ userId: session.userId, name: parsed.data.name })
        if (existing) return NextResponse.json({ error: "Você já tem um NPC com este nome." }, { status: 409 })

        const npc = await UserNpcModel.create({
            ...parsed.data,
            userId: session.userId,
            experience: getMonsterXp(parsed.data.challengeRating, parsed.data.experienceOverride),
        })

        return NextResponse.json(serializeMonsterLike(npc), { status: 201 })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] POST /api/owlbear/rooms/[roomId]/npcs/user-npcs error:")
    }
}

export async function patchOwlbearRoomNpc(req: NextRequest, roomId: string, npcId: string) {
    try {
        const session = await requireRoomNpcGm(req, roomId)
        const body = await req.json()
        const parsed = PatchRoomNpcSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 })
        }

        await dbConnect()
        const current = await OwlbearRoomNpc.findOne({ _id: npcId, roomId, userId: session.userId })
        if (!current) return NextResponse.json({ error: "NPC da sala não encontrado" }, { status: 404 })

        const hpMax = parsed.data.hpMax ?? current.hpMax
        const hpCurrentInput = parsed.data.hpCurrent ?? current.hpCurrent
        current.hpMax = Math.max(0, hpMax)
        current.hpCurrent = Math.max(0, Math.min(current.hpMax, hpCurrentInput))
        await current.save()

        const source = await findSource(current.sourceKind, current.sourceId, session.userId)
        return NextResponse.json(serializeRoomNpc(current, source ? serializeMonsterLike(source) : null))
    } catch (error) {
        return owlbearErrorResponse(error, "[API] PATCH /api/owlbear/rooms/[roomId]/npcs/[npcId] error:")
    }
}

export async function deleteOwlbearRoomNpc(req: NextRequest, roomId: string, npcId: string) {
    try {
        const session = await requireRoomNpcGm(req, roomId)
        await dbConnect()
        const deleted = await OwlbearRoomNpc.findOneAndDelete({ _id: npcId, roomId, userId: session.userId })
        if (!deleted) return NextResponse.json({ error: "NPC da sala não encontrado" }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        return owlbearErrorResponse(error, "[API] DELETE /api/owlbear/rooms/[roomId]/npcs/[npcId] error:")
    }
}
