import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@/core/auth/server"
import { z } from "zod"
import dbConnect from "@/core/database/db"
import { logAction } from "@/core/database/audit-log"
import type { ApiResponse } from "@/core/types/common"
import { FeedbackModel } from "@/features/feedback/api/feedback.model"
import { createFeedbackTimelineEvent } from "@/features/feedback/services/feedback-timeline-service"

const createCommentSchema = z.object({
    message: z.string().min(1, "Comentário é obrigatório").max(50000, "Comentário muito longo"),
})

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const user = await currentUser()
        if (!user) {
            const response: ApiResponse<null> = {
                success: false,
                error: "Você precisa estar logado para comentar",
                code: "UNAUTHORIZED",
            }

            return NextResponse.json(response, { status: 401 })
        }

        const { id } = await params
        const body = await req.json()
        const validated = createCommentSchema.parse(body)

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

        const isAdmin = user.publicMetadata?.role === "admin"
        const event = await createFeedbackTimelineEvent({
            feedbackId: id,
            type: "comment_created",
            actorType: isAdmin ? "admin" : "user",
            actorId: user.id,
            actorName: user.fullName || user.username || "Usuário",
            message: validated.message,
        })

        feedback.updatedAt = new Date()
        await feedback.save()

        await logAction("COMMENT", "Feedback", id, user.id, {
            eventId: String(event._id),
        })

        const response: ApiResponse<typeof event> = {
            success: true,
            data: event,
        }

        return NextResponse.json(response, { status: 201 })
    } catch (error) {
        console.error("Feedback comment POST error:", error)
        if (error instanceof z.ZodError) {
            const response: ApiResponse<null> = {
                success: false,
                error: "Comentário inválido",
                code: "VALIDATION_ERROR",
                details: error.issues,
            }

            return NextResponse.json(response, { status: 400 })
        }

        const response: ApiResponse<null> = {
            success: false,
            error: "Erro interno ao criar comentário",
            code: "INTERNAL_ERROR",
        }

        return NextResponse.json(response, { status: 500 })
    }
}
