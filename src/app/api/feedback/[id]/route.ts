import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser } from "@/core/auth/server"
import { FeedbackModel } from "@/features/feedback/api/feedback.model"
import dbConnect from "@/core/database/db"
import { logAction } from "@/core/database/audit-log"
import type { ApiResponse } from "@/core/types/common"
import { createFeedbackTimelineEvent } from "@/features/feedback/services/feedback-timeline-service"
import { z } from "zod"

const statusLabels = {
  pendente: "Pendente",
  concluido: "Concluído",
  cancelado: "Cancelado",
} as const

const updateFeedbackSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(50000).optional(),
  type: z.enum(["bug", "melhoria"]).optional(),
  status: z.enum(["pendente", "concluido", "cancelado"]).optional(),
  priority: z.enum(["baixa", "media", "alta"]).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await dbConnect()

    const feedback = await FeedbackModel.findById(id)
    if (!feedback) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Feedback não encontrado",
        code: "FEEDBACK_NOT_FOUND",
      }

      return NextResponse.json(response, { status: 404 })
    }

    const response: ApiResponse<typeof feedback> = {
      success: true,
      data: feedback,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Feedback GET by id error:", error)
    const response: ApiResponse<null> = {
      success: false,
      error: "Erro interno ao buscar feedback",
      code: "INTERNAL_ERROR",
    }

    return NextResponse.json(response, { status: 500 })
  }
}

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

    const previousStatus = feedback.status
    const updated = await FeedbackModel.findByIdAndUpdate(id, validated, { new: true })

    await logAction("UPDATE", "Feedback", id, session.userId, validated)

    if (updated && validated.status && validated.status !== previousStatus) {
      await createFeedbackTimelineEvent({
        feedbackId: updated._id,
        type: "status_changed",
        actorType: isAdmin ? "admin" : "user",
        actorId: session.userId,
        actorName: user.fullName || user.firstName || "Administrador",
        message: `Status alterado manualmente para ${statusLabels[validated.status]}.`,
        metadata: {
          previousStatus,
          nextStatus: validated.status,
        },
      })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Feedback PATCH error:", error)
    if (error instanceof z.ZodError) {
        return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro interno ao atualizar feedback" }, { status: 500 })
  }
}
