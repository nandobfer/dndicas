import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { FeedbackModel } from "@/features/feedback/api/feedback.model"
import dbConnect from "@/core/database/db"
import { z } from "zod"

const createFeedbackSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(50000),
  type: z.enum(["bug", "melhoria"]),
  status: z.enum(["pendente", "concluido", "cancelado"]).optional(),
  priority: z.enum(["baixa", "media", "alta"]).optional(),
})

export async function GET(req: NextRequest) {
  try {
    await dbConnect()
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1", 10)
    const limit = parseInt(searchParams.get("limit") || "10", 10)
    const search = searchParams.get("search") || ""
    const status = searchParams.get("status")
    const priority = searchParams.get("priority")
    const type = searchParams.get("type")

    const query: any = {}
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ]
    }
    if (status && status !== "all") query.status = status
    if (priority && priority !== "all") query.priority = priority
    if (type && type !== "all") query.type = type

    const items = await FeedbackModel.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const total = await FeedbackModel.countDocuments(query)

    return NextResponse.json({
      items,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error("Feedback GET error:", error)
    return NextResponse.json({ error: "Failed to fetch feedbacks" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para enviar feedback" }, { status: 401 })
    }

    const body = await req.json()
    const validated = createFeedbackSchema.parse(body)

    const isAdmin = user.publicMetadata?.role === "admin"
    
    // Non-admins can't set status or priority on creation
    if (!isAdmin) {
      delete validated.status
      delete validated.priority
    }

    await dbConnect()

    const newFeedback = await FeedbackModel.create({
      ...validated,
      createdBy: user.id,
      creatorName: user.fullName || user.username || "Usuário",
      creatorEmail: user.emailAddresses[0]?.emailAddress,
    })

    return NextResponse.json(newFeedback, { status: 201 })
  } catch (error) {
    console.error("Feedback POST error:", error)
    if (error instanceof z.ZodError) {
        return NextResponse.json({ error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro interno ao criar feedback" }, { status: 500 })
  }
}
