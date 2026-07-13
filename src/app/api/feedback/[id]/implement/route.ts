import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@/core/auth/server"
import { z } from "zod"
import dbConnect from "@/core/database/db"
import type { ApiResponse } from "@/core/types/common"
import { FeedbackModel } from "@/features/feedback/api/feedback.model"
import { buildFeedbackImplementationPrompt } from "@/features/feedback/services/feedback-agent-prompt-service"
import { hasActiveFeedbackAgentRun, queueFeedbackAgentRun } from "@/features/feedback/services/feedback-agent-run-service"

const schema = z.object({ model: z.string().min(1), message: z.string().max(20000).optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await currentUser()
        if (!user || user.publicMetadata?.role !== "admin") return NextResponse.json({ success: false, error: "Você não tem permissão para implementar feedbacks", code: "FORBIDDEN" } satisfies ApiResponse<null>, { status: user ? 403 : 401 })

        const { id } = await params
        const input = schema.parse(await req.json())
        await dbConnect()

        const feedback = await FeedbackModel.findById(id)
        if (!feedback) return NextResponse.json({ success: false, error: "Feedback não encontrado", code: "FEEDBACK_NOT_FOUND" } satisfies ApiResponse<null>, { status: 404 })
        if (await hasActiveFeedbackAgentRun(id)) return NextResponse.json({ success: false, error: "Já existe uma execução agêntica em andamento para este feedback", code: "ACTIVE_AGENT_RUN" } satisfies ApiResponse<null>, { status: 409 })

        const run = await queueFeedbackAgentRun({
            feedbackId: id,
            kind: "implement",
            nextStatus: "implementando",
            eventType: "implementation_requested",
            eventMessage: `Implementação solicitada com o modelo ${input.model}.`,
            model: input.model,
            prompt: buildFeedbackImplementationPrompt({ feedback, extraMessage: input.message }),
            actorId: user.id,
            actorName: user.fullName || user.username || "Admin",
        })

        return NextResponse.json({ success: true, data: run } satisfies ApiResponse<typeof run>, { status: 202 })
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Dados inválidos para implementar feedback", code: "VALIDATION_ERROR", details: error.issues } satisfies ApiResponse<null>, { status: 400 })
        console.error("Feedback implement POST error:", error)
        return NextResponse.json({ success: false, error: "Erro interno ao solicitar implementação", code: "INTERNAL_ERROR" } satisfies ApiResponse<null>, { status: 500 })
    }
}
