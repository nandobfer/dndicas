import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { RaceModel } from "@/features/races/models/race"
import dbConnect from "@/core/database/db"
import { z } from "zod"
import { createAuditLog } from "@/features/users/api/audit-service"

const raceTraitSchema = z.object({
    name: z.string().min(1),
    level: z.coerce.number().default(1),
    description: z.string().min(1),
})

const raceVariationSchema = z.object({
    name: z.string().min(2),
    description: z.string().optional().default(""),
    source: z.string().optional(),
    image: z.string().optional(),
    color: z.string().optional(),
    traits: z.array(raceTraitSchema).default([]),
    spells: z.array(z.any()).default([]),
    size: z.enum(["Pequeno", "Médio", "Grande"]).optional(),
    speed: z.string().optional(),
})

const raceSchema = z.object({
    name: z.string().min(2).max(100),
    originalName: z.union([z.string().trim().max(100), z.literal("")]).optional().transform((val) => val || undefined),
    description: z.string().min(10),
    source: z.string(),
    status: z.enum(["active", "inactive"]),
    image: z.string().optional(),
    size: z.enum(["Pequeno", "Médio", "Grande"]),
    speed: z.string().min(1),
    traits: z.array(raceTraitSchema).default([]),
    spells: z.array(z.any()).default([]),
    variations: z.array(raceVariationSchema).default([]),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await dbConnect()
        const { id } = await params
        const item = await RaceModel.findById(id).lean()

        if (!item) {
            return NextResponse.json({ error: "Race not found" }, { status: 404 })
        }

        return NextResponse.json({
            ...item,
            id: item._id.toString(),
        })
    } catch (error) {
        console.error("Race GET error:", error)
        return NextResponse.json({ error: "Failed to fetch race" }, { status: 500 })
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { id } = await params
        const body = await req.json()
        const validated = raceSchema.parse(body)
        await dbConnect()

        // Get previous data for audit log
        const previousRace = await RaceModel.findById(id).lean()
        if (!previousRace) {
            return NextResponse.json({ error: "Race not found" }, { status: 404 })
        }

        const race = await RaceModel.findByIdAndUpdate(id, validated, { new: true }).lean()

        if (!race) {
            return NextResponse.json({ error: "Race not found" }, { status: 404 })
        }

        // Audit log
        if (userId) {
            await createAuditLog({
                performedBy: userId,
                action: "UPDATE",
                entity: "Race",
                entityId: id,
                previousData: previousRace as any,
                newData: race as any,
            })
        }

        return NextResponse.json(race)
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.flatten().fieldErrors }, { status: 400 })
        }
        console.error("Race PUT error:", error)
        return NextResponse.json({ error: "Failed to update race" }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const { id } = await params
        await dbConnect()

        const race = await RaceModel.findByIdAndDelete(id)

        if (!race) {
            return NextResponse.json({ error: "Race not found" }, { status: 404 })
        }

        // Audit log
        if (userId) {
            await createAuditLog({
                performedBy: userId,
                action: "DELETE",
                entity: "Race",
                entityId: id,
                previousData: (race.toObject ? race.toObject() : race) as any,
            })
        }

        return NextResponse.json({ message: "Race deleted successfully" })
    } catch (error) {
        console.error("Race DELETE error:", error)
        return NextResponse.json({ error: "Failed to delete race" }, { status: 500 })
    }
}
