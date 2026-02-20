import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { Reference } from "@/core/database/models/reference"
import { AuditLogExtended } from "@/features/users/models/audit-log-extended"
import { connectDB } from "@/core/database/connect"
import { z } from "zod"

const createReferenceSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(50000), // HTML string
  source: z.string(),
  status: z.enum(["active", "inactive"]),
})

export async function GET(req: NextRequest) {
  try {
    await connectDB()
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

    const items = await Reference.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const total = await Reference.countDocuments(query)

    return NextResponse.json({
      items,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error("Rules GET error:", error)
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = createReferenceSchema.parse(body)

    await connectDB()

    // Check uniqueness
    const existing = await Reference.findOne({ name: validatedData.name })
    if (existing) {
      return NextResponse.json({ error: "Rule name already exists" }, { status: 409 })
    }

    const newRule = await Reference.create(validatedData)

    // Audit Log
    try {
        await AuditLogExtended.create({
            action: "CREATE",
            entity: "Reference",
            entityId: newRule._id,
            performedBy: session.userId,
            performedByUser: {
                _id: session.userId,
                // We'd ideally fetch user details here or rely on the frontend to pass them if critical,
                // but usually the backend should resolve this. For now, minimal.
            },
            newData: newRule.toObject(),
            createdAt: new Date(),
        })
    } catch (auditError) {
        console.warn("Failed to create audit log for rule creation", auditError)
    }

    return NextResponse.json(newRule, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error("Rules POST error:", error)
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 })
  }
}
