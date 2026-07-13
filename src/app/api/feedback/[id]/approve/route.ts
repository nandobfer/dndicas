import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import dbConnect from "@/core/database/db"
import type { ApiResponse } from "@/core/types/common"
import { FeedbackModel } from "@/features/feedback/api/feedback.model"
import { hasActiveFeedbackAgentRun, queueFeedbackAgentRun } from "@/features/feedback/services/feedback-agent-run-service"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await currentUser()
        if (!user || user.publicMetadata?.role !== "admin") return NextResponse.json({ success: false, error: "Você não tem permissão para aprovar merge", code: "FORBIDDEN" } satisfies ApiResponse<null>, { status: user ? 403 : 401 })

        const { id } = await params
        await dbConnect()

        const feedback = await FeedbackModel.findById(id)
        if (!feedback) return NextResponse.json({ success: false, error: "Feedback não encontrado", code: "FEEDBACK_NOT_FOUND" } satisfies ApiResponse<null>, { status: 404 })
        if (!feedback.pullRequestNumber) return NextResponse.json({ success: false, error: "Este feedback ainda não possui pull request para merge", code: "PULL_REQUEST_REQUIRED" } satisfies ApiResponse<null>, { status: 400 })
        if (await hasActiveFeedbackAgentRun(id)) return NextResponse.json({ success: false, error: "Já existe uma execução agêntica em andamento para este feedback", code: "ACTIVE_AGENT_RUN" } satisfies ApiResponse<null>, { status: 409 })

        const run = await queueFeedbackAgentRun({
            feedbackId: id,
            kind: "merge",
            nextStatus: "mergeando",
            eventType: "approved",
            eventMessage: "Feedback aprovado para versionamento e merge.",
            model: feedback.selectedModel || "system/manual",
            prompt: "Aprovação administrativa para version bump e merge.",
            actorId: user.id,
            actorName: user.fullName || user.username || "Admin",
        })

        feedback.approvedBy = user.id
        feedback.approvedAt = new Date()
        await feedback.save()

        return NextResponse.json({ success: true, data: run } satisfies ApiResponse<typeof run>, { status: 202 })
    } catch (error) {
        console.error("Feedback approve POST error:", error)
        return NextResponse.json({ success: false, error: "Erro interno ao aprovar feedback", code: "INTERNAL_ERROR" } satisfies ApiResponse<null>, { status: 500 })
    }
}
