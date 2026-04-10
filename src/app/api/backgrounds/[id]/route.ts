import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import { Feat as FeatModel } from "@/features/feats/models/feat"
import { createAuditLog } from "@/features/users/api/audit-service"
import dbConnect from "@/core/database/db"
import { z } from "zod"

const updateBackgroundSchema = z.object({
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        await dbConnect()
        const background = await BackgroundModel.findById(id).lean()
        if (!background) return NextResponse.json({ error: "Background not found" }, { status: 404 })

        const item: any = { ...background, id: background._id.toString() }
        if (item.featId && typeof item.featId === 'string' && item.featId.length > 0) {
            try {
                const feat = await FeatModel.findById(item.featId).select('name').lean()
                if (feat) {
                    item.featId = { id: item.featId, label: (feat as any).name }
                }
            } catch (e) {
                console.error(`Failed to resolve featId ${item.featId} for background ${item._id}`)
            }
        }

        return NextResponse.json(item)
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch background" }, { status: 500 })
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
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

        const validated = updateBackgroundSchema.parse(body)

        await dbConnect()
        
        const existing = await BackgroundModel.findById(id)
        if (!existing) return NextResponse.json({ error: "Background not found" }, { status: 404 })

        const updated = await BackgroundModel.findByIdAndUpdate(id, validated, { new: true })

        await createAuditLog({
            action: "UPDATE",
            entity: "Background",
            entityId: id,
            performedBy: userId,
            previousData: existing.toObject() as unknown as Record<string, unknown>,
            newData: updated!.toObject() as unknown as Record<string, unknown>
        })

        return NextResponse.json(updated)
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Failed to update background" }, { status: 400 })
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const { userId } = await auth()
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

        await dbConnect()
        const deleted = await BackgroundModel.findByIdAndDelete(id)
        if (!deleted) return NextResponse.json({ error: "Background not found" }, { status: 404 })

        await createAuditLog({
            action: "DELETE",
            entity: "Background",
            entityId: id,
            performedBy: userId,
            previousData: deleted.toObject() as unknown as Record<string, unknown>
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete background" }, { status: 500 })
    }
}
