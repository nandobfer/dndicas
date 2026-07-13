import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import dbConnect from "@/core/database/db"
import type { ApiResponse } from "@/core/types/common"
import { FeedbackModel } from "@/features/feedback/api/feedback.model"
import { listFeedbackTimelineEvents } from "@/features/feedback/services/feedback-timeline-service"

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const user = await currentUser()
        if (!user) {
            const response: ApiResponse<null> = {
                success: false,
                error: "Você precisa estar logado para visualizar a timeline",
                code: "UNAUTHORIZED",
            }

            return NextResponse.json(response, { status: 401 })
        }

        const { id } = await params
        await dbConnect()

        const feedback = await FeedbackModel.findById(id).select("_id")
        if (!feedback) {
            const response: ApiResponse<null> = {
                success: false,
                error: "Feedback não encontrado",
                code: "FEEDBACK_NOT_FOUND",
            }

            return NextResponse.json(response, { status: 404 })
        }

        const isAdmin = user.publicMetadata?.role === "admin"
        const events = await listFeedbackTimelineEvents(id, { includeAdminEvents: isAdmin })

        const response: ApiResponse<typeof events> = {
            success: true,
            data: events,
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error("Feedback timeline GET error:", error)
        const response: ApiResponse<null> = {
            success: false,
            error: "Erro interno ao carregar timeline",
            code: "INTERNAL_ERROR",
        }

        return NextResponse.json(response, { status: 500 })
    }
}
