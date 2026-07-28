import dbConnect from "@/core/database/db"
import { logAction } from "@/core/database/audit-log"
import { FeedbackModel } from "@/features/feedback/api/feedback.model"
import { buildFeedbackImplementationPrompt, buildFeedbackIterationPrompt, buildFeedbackPlanPrompt } from "@/features/feedback/services/feedback-agent-prompt-service"
import { hasActiveFeedbackAgentRun, queueFeedbackAgentRun, queueFeedbackPlan } from "@/features/feedback/services/feedback-agent-run-service"
import { createFeedbackTimelineEvent, listFeedbackTimelineEvents } from "@/features/feedback/services/feedback-timeline-service"
import type { McpAuthContext } from "./mcp-auth-service"
import type { CommentFeedbackInput, CreateFeedbackInput, FeedbackIdInput, ListFeedbacksInput, RequestFeedbackAgentInput, RequestFeedbackIterationInput, UpdateFeedbackInput } from "./feedback-schemas"
import { serializeAgentRun, serializeAuthenticatedFeedback, serializePublicFeedback, serializeTimelineEvent } from "./feedback-serializers"

const statusLabels = {
    pendente: "Pendente",
    concluido: "Concluído",
    cancelado: "Cancelado",
} as const

export class McpFeedbackError extends Error {
    constructor(message: string, readonly code: string) {
        super(message)
    }
}

function actorName(auth: McpAuthContext) {
    return auth.name || auth.username || (auth.role === "admin" ? "Admin" : "Usuário")
}

function isOwner(feedback: { createdBy?: string }, auth: McpAuthContext) {
    return feedback.createdBy === auth.userId
}

function requireFeedbackPermission(feedback: { createdBy?: string }, auth: McpAuthContext) {
    if (auth.role === "admin" || isOwner(feedback, auth)) return
    throw new McpFeedbackError("Você não tem permissão para executar esta ação.", "FORBIDDEN")
}

async function findFeedbackOrThrow(id: string) {
    const feedback = await FeedbackModel.findById(id)
    if (!feedback) throw new McpFeedbackError("Feedback não encontrado.", "FEEDBACK_NOT_FOUND")
    return feedback
}

export async function listFeedbacks(input: ListFeedbacksInput) {
    await dbConnect()

    const query: Record<string, unknown> = {}
    if (input.search) {
        query.$or = [
            { title: { $regex: input.search, $options: "i" } },
            { description: { $regex: input.search, $options: "i" } },
        ]
    }
    if (input.status && input.status !== "all") query.status = input.status
    if (input.priority && input.priority !== "all") query.priority = input.priority
    if (input.type && input.type !== "all") query.type = input.type

    const [items, total] = await Promise.all([
        FeedbackModel.find(query).sort({ updatedAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean(),
        FeedbackModel.countDocuments(query),
    ])

    return {
        items: items.map((item) => serializePublicFeedback(item)),
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
    }
}

export async function getFeedback(input: FeedbackIdInput, auth: McpAuthContext | null) {
    await dbConnect()

    const feedback = await FeedbackModel.findById(input.id)
    if (!feedback) throw new McpFeedbackError("Feedback não encontrado.", "FEEDBACK_NOT_FOUND")

    if (auth && (auth.role === "admin" || isOwner(feedback, auth))) {
        return serializeAuthenticatedFeedback(feedback, { includeAdminFields: auth.role === "admin" })
    }

    return serializePublicFeedback(feedback)
}

export async function getFeedbackTimeline(input: FeedbackIdInput, auth: McpAuthContext | null) {
    await dbConnect()

    const feedback = await FeedbackModel.findById(input.id).select("_id")
    if (!feedback) throw new McpFeedbackError("Feedback não encontrado.", "FEEDBACK_NOT_FOUND")

    const events = await listFeedbackTimelineEvents(input.id, { includeAdminEvents: auth?.role === "admin" })
    return { events: events.map((event) => serializeTimelineEvent(event)) }
}

export async function createFeedback(input: CreateFeedbackInput, auth: McpAuthContext) {
    await dbConnect()

    const payload = { ...input }
    if (auth.role !== "admin") {
        delete payload.status
        delete payload.priority
    }

    const feedback = await FeedbackModel.create({
        ...payload,
        createdBy: auth.userId,
        creatorName: actorName(auth),
        creatorEmail: auth.email,
    })

    await createFeedbackTimelineEvent({
        feedbackId: feedback._id,
        type: "feedback_created",
        actorType: auth.role === "admin" ? "admin" : "user",
        actorId: auth.userId,
        actorName: actorName(auth),
        message: "Feedback criado.",
        metadata: {
            title: feedback.title,
            type: feedback.type,
        },
    })

    await logAction("CREATE", "Feedback", String(feedback._id), auth.userId, {
        title: feedback.title,
        type: feedback.type,
        source: "mcp",
    })

    return serializeAuthenticatedFeedback(feedback, { includeAdminFields: auth.role === "admin" })
}

export async function updateFeedback(input: UpdateFeedbackInput, auth: McpAuthContext) {
    await dbConnect()

    const { id, ...payload } = input
    const feedback = await findFeedbackOrThrow(id)
    requireFeedbackPermission(feedback, auth)

    if (auth.role !== "admin") {
        delete payload.status
        delete payload.priority
    }

    const previousStatus = feedback.status
    const updated = await FeedbackModel.findByIdAndUpdate(id, payload, { new: true })
    if (!updated) throw new McpFeedbackError("Feedback não encontrado.", "FEEDBACK_NOT_FOUND")

    await logAction("UPDATE", "Feedback", id, auth.userId, { ...payload, source: "mcp" })

    if (payload.status && payload.status !== previousStatus) {
        await createFeedbackTimelineEvent({
            feedbackId: updated._id,
            type: "status_changed",
            actorType: auth.role === "admin" ? "admin" : "user",
            actorId: auth.userId,
            actorName: actorName(auth),
            message: `Status alterado manualmente para ${statusLabels[payload.status]}.`,
            metadata: {
                previousStatus,
                nextStatus: payload.status,
            },
        })
    }

    return serializeAuthenticatedFeedback(updated, { includeAdminFields: auth.role === "admin" })
}

export async function commentFeedback(input: CommentFeedbackInput, auth: McpAuthContext) {
    await dbConnect()

    const feedback = await findFeedbackOrThrow(input.id)
    const event = await createFeedbackTimelineEvent({
        feedbackId: input.id,
        type: "comment_created",
        actorType: auth.role === "admin" ? "admin" : "user",
        actorId: auth.userId,
        actorName: actorName(auth),
        message: input.message,
    })

    feedback.updatedAt = new Date()
    await feedback.save()

    await logAction("COMMENT", "Feedback", input.id, auth.userId, {
        eventId: String(event._id),
        source: "mcp",
    })

    return serializeTimelineEvent({
        id: String(event._id),
        feedbackId: String(event.feedbackId),
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId,
        actorName: event.actorName,
        message: event.message,
        metadata: event.metadata,
        visibility: event.visibility,
        createdAt: event.createdAt.toISOString(),
        updatedAt: event.updatedAt.toISOString(),
    })
}

export async function requestFeedbackPlan(input: RequestFeedbackAgentInput, auth: McpAuthContext) {
    await dbConnect()

    const feedback = await findFeedbackOrThrow(input.id)
    if (await hasActiveFeedbackAgentRun(input.id)) {
        throw new McpFeedbackError("Já existe uma execução agêntica em andamento para este feedback.", "ACTIVE_AGENT_RUN")
    }

    const run = await queueFeedbackPlan({
        feedbackId: input.id,
        model: input.model,
        prompt: buildFeedbackPlanPrompt({
            title: feedback.title,
            description: feedback.description,
            type: feedback.type,
            extraMessage: input.message,
        }),
        actorId: auth.userId,
        actorName: actorName(auth),
    })

    await logAction("PLAN_REQUEST", "Feedback", input.id, auth.userId, {
        runId: String(run._id),
        model: input.model,
        source: "mcp",
    })

    return serializeAgentRun(run)
}

export async function requestFeedbackImplementation(input: RequestFeedbackAgentInput, auth: McpAuthContext) {
    await dbConnect()

    const feedback = await findFeedbackOrThrow(input.id)
    if (await hasActiveFeedbackAgentRun(input.id)) {
        throw new McpFeedbackError("Já existe uma execução agêntica em andamento para este feedback.", "ACTIVE_AGENT_RUN")
    }

    const run = await queueFeedbackAgentRun({
        feedbackId: input.id,
        kind: "implement",
        nextStatus: "implementando",
        eventType: "implementation_requested",
        eventMessage: `Implementação solicitada com o modelo ${input.model}.`,
        model: input.model,
        prompt: buildFeedbackImplementationPrompt({ feedback, extraMessage: input.message }),
        actorId: auth.userId,
        actorName: actorName(auth),
    })

    await logAction("IMPLEMENT_REQUEST", "Feedback", input.id, auth.userId, {
        runId: String(run._id),
        model: input.model,
        source: "mcp",
    })

    return serializeAgentRun(run)
}

export async function requestFeedbackIteration(input: RequestFeedbackIterationInput, auth: McpAuthContext) {
    await dbConnect()

    const feedback = await findFeedbackOrThrow(input.id)
    if (await hasActiveFeedbackAgentRun(input.id)) {
        throw new McpFeedbackError("Já existe uma execução agêntica em andamento para este feedback.", "ACTIVE_AGENT_RUN")
    }

    const run = await queueFeedbackAgentRun({
        feedbackId: input.id,
        kind: "iterate",
        nextStatus: "implementando",
        eventType: "changes_requested",
        eventMessage: "Nova iteração solicitada.",
        model: input.model,
        prompt: buildFeedbackIterationPrompt({ feedback, message: input.message }),
        actorId: auth.userId,
        actorName: actorName(auth),
    })

    await logAction("ITERATE_REQUEST", "Feedback", input.id, auth.userId, {
        runId: String(run._id),
        model: input.model,
        source: "mcp",
    })

    return serializeAgentRun(run)
}

export async function approveFeedbackMerge(input: FeedbackIdInput, auth: McpAuthContext) {
    await dbConnect()

    const feedback = await findFeedbackOrThrow(input.id)
    if (!feedback.pullRequestNumber) {
        throw new McpFeedbackError("Este feedback ainda não possui pull request para merge.", "PULL_REQUEST_REQUIRED")
    }
    if (await hasActiveFeedbackAgentRun(input.id)) {
        throw new McpFeedbackError("Já existe uma execução agêntica em andamento para este feedback.", "ACTIVE_AGENT_RUN")
    }

    const run = await queueFeedbackAgentRun({
        feedbackId: input.id,
        kind: "merge",
        nextStatus: "mergeando",
        eventType: "approved",
        eventMessage: "Feedback aprovado para versionamento e merge.",
        model: feedback.selectedModel || "system/manual",
        prompt: "Aprovação administrativa para version bump e merge.",
        actorId: auth.userId,
        actorName: actorName(auth),
    })

    feedback.approvedBy = auth.userId
    feedback.approvedAt = new Date()
    await feedback.save()

    await logAction("APPROVE_MERGE", "Feedback", input.id, auth.userId, {
        runId: String(run._id),
        pullRequestNumber: feedback.pullRequestNumber,
        source: "mcp",
    })

    return serializeAgentRun(run)
}
