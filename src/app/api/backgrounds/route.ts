import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import { Feat as FeatModel } from "@/features/feats/models/feat"
import { createAuditLog } from "@/features/users/api/audit-service"
import dbConnect from "@/core/database/db"
import { z } from "zod"

const backgroundSchema = z.object({
    name: z.string().min(2).max(100),
    originalName: z.union([z.string().trim().max(100), z.literal("")]).optional().transform((val) => val || undefined),
    description: z.string().min(10),
    source: z.string(),
    status: z.enum(["active", "inactive"]),
    image: z.string().optional(),
    skillProficiencies: z.array(z.string()).default([]),
    suggestedAttributes: z.array(z.string()).default([]),
    featId: z.string().nullable().optional().or(z.literal("")).or(z.object({ id: z.string(), label: z.string() })),
    equipment: z.string().optional(),
    traits: z.array(z.object({
        name: z.string().optional(),
        level: z.coerce.number().default(1),
        description: z.string().min(1)
    })).default([]),
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
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } }
            ]
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

        const items = await BackgroundModel.find(query)
            .sort({ name: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean()

        const itemsWithFeats = await Promise.all(items.map(async (item: any) => {
            if (item.featId && typeof item.featId === 'string' && item.featId.length > 0) {
                try {
                    const feat = await FeatModel.findById(item.featId).select('name').lean()
                    if (feat) {
                        return {
                            ...item,
                            id: item._id.toString(),
                            featId: { id: item.featId, label: (feat as any).name }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to resolve featId ${item.featId} for background ${item._id}`)
                }
            }
            return { ...item, id: item._id.toString() }
        }))

        const total = await BackgroundModel.countDocuments(query)

        return NextResponse.json({
            items: itemsWithFeats,
            total,
            page,
            limit
        })
    } catch (error) {
        console.error("Backgrounds GET error:", error)
        return NextResponse.json({ error: "Failed to fetch backgrounds" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        const body = await req.json()
        
        // Normalize featId if it's an object
        if (body.featId && typeof body.featId === 'object' && body.featId.id) {
            body.featId = body.featId.id
        }
        
        // Remove empty strings from traits name for compatibility
        if (body.traits && Array.isArray(body.traits)) {
            body.traits = body.traits.map((t: any) => ({
                name: (t.name && t.name.trim() !== "") ? t.name : "Habilidade", // Garante um valor para o Mongoose teimoso
                level: t.level || 1,
                description: t.description
            }))
        }
        
        const validated = backgroundSchema.parse(body)

        await dbConnect()
        
        const existing = await BackgroundModel.findOne({ name: validated.name })
        if (existing) return NextResponse.json({ error: "Background name already exists" }, { status: 409 })

        const newBackground = (await BackgroundModel.create(validated as any)) as any

        await createAuditLog({
            action: "CREATE",
            entity: "Background",
            entityId: String(newBackground._id),
            performedBy: userId,
            newData: (newBackground.toObject ? newBackground.toObject() : newBackground) as unknown as Record<string, unknown>,
        })

        return NextResponse.json(newBackground)
    } catch (error: any) {
        console.error("Background POST error:", error)
        return NextResponse.json({ error: error.message || "Failed to create background" }, { status: 400 })
    }
}
