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

export async function GET(req: NextRequest) {
    try {
        await dbConnect()
        const url = new URL(req.url)
        const page = parseInt(url.searchParams.get("page") || "1", 10)
        const limit = parseInt(url.searchParams.get("limit") || "10", 10)
        const search = url.searchParams.get("search") || ""
        const status = url.searchParams.get("status")

        const query: any = {}
        if (search) {
            query.$or = [{ name: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }]
        }
        if (status && status !== "all") {
            query.status = status
        }
        const sourcesParam = url.searchParams.get("sources")
        if (sourcesParam) {
            const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const sourcesList = sourcesParam.split(",").map(s => s.trim()).filter(Boolean)
            if (sourcesList.length > 0) {
                query.source = { $in: sourcesList.map(s => new RegExp(`^${escapeRegex(s)}`, 'i')) }
            }
        }

        const items = await RaceModel.find(query)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean()

        const formattedItems = items.map((item: any) => ({
            ...item,
            id: item._id.toString(),
        }))

        const total = await RaceModel.countDocuments(query)

        return NextResponse.json({
            items: formattedItems,
            total,
            page,
            limit,
        })
    } catch (error) {
        console.error("Races GET error:", error)
        return NextResponse.json({ error: "Failed to fetch races" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        // if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json()

        // Normalize traits for Mongoose
        if (body.traits && Array.isArray(body.traits)) {
            body.traits = body.traits.map((t: any) => ({
                name: t.name && t.name.trim() !== "" ? t.name : "Traço Racial",
                level: t.level || 1,
                description: t.description,
            }))
        }

        const validated = raceSchema.parse(body)
        await dbConnect()

        const race = await RaceModel.create(validated)

        // Audit configuration
        if (userId) {
            await createAuditLog({
                performedBy: userId,
                action: "CREATE",
                entity: "Race",
                entityId: race._id.toString(),
                newData: (race.toObject ? race.toObject() : race) as any,
            })
        }

        return NextResponse.json(race)
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.flatten().fieldErrors }, { status: 400 })
        }
        console.error("Races POST error:", error)
        return NextResponse.json({ error: "Failed to create race" }, { status: 500 })
    }
}
