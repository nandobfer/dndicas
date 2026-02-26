import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { FeedbackModel } from "@/features/feedback/api/feedback.model"
import dbConnect from "@/core/database/db"
import { z } from "zod"

const updateFeedbackSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(50000).optional(),
  type: z.enum(["bug", "melhoria"]).optional(),
  status: z.enum(["pendente", "concluido", "cancelado"]).optional(),
  priority: z.enum(["baixa", "media", "alta"]).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const user = await currentUser()
    
    if (!session || !session.userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const validated = updateFeedbackSchema.parse(body)

    await dbConnect()

    const feedback = await FeedbackModel.findById(id)
    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 })
    }

    // Access control: creator or admin
    const isAdmin = user.publicMetadata?.role === "admin"
    const isOwner = feedback.createdBy === session.userId

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Você não tem permissão para editar este feedback" }, { status: 403 })
    }

    // Owners cannot change status or priority
    if (!isAdmin && isOwner) {
        delete validated.status
        delete validated.priority
    }

    const updated = await FeedbackModel.findByIdAndUpdate(id, validated, { new: true })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Feedback PATCH error:", error)
    if (error instanceof z.ZodError) {
        return NextResponse.json({ error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro interno ao atualizar feedback" }, { status: 500 })
  }
}
