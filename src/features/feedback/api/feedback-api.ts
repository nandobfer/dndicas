import type { ApiResponse } from "@/core/types/common"
import { FeedbackFilters, FeedbackResponse, Feedback, CreateFeedbackInput, UpdateFeedbackInput, FeedbackTimelineEvent, OpenCodeModelOption, CreateFeedbackCommentInput, CreateFeedbackPlanInput, FeedbackAgentRun } from "../types/feedback.types";

export async function fetchFeedbacks(filters: FeedbackFilters): Promise<FeedbackResponse> {
    const params = new URLSearchParams()
    if (filters.page) params.append("page", String(filters.page))
    if (filters.limit) params.append("limit", String(filters.limit))
    if (filters.search) params.append("search", filters.search)
    if (filters.status && filters.status !== "all") params.append("status", filters.status)
    if (filters.priority && filters.priority !== "all") params.append("priority", filters.priority)
    if (filters.type && filters.type !== "all") params.append("type", filters.type)

    const res = await fetch(`/api/feedback?${params.toString()}`)
    if (!res.ok) throw new Error("Failed to fetch feedbacks")
    return res.json()
}

export async function createFeedback(data: CreateFeedbackInput): Promise<Feedback> {
    const res = await fetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
    })
    if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create feedback")
    }
    return res.json()
}

export async function updateFeedback(id: string, data: UpdateFeedbackInput): Promise<Feedback> {
    const res = await fetch(`/api/feedback/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
    })
    if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to update feedback")
    }
    return res.json()
}

async function parseApiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
    const body = await res.json() as ApiResponse<T>
    if (!res.ok || !body.success) throw new Error(body.error || fallbackMessage)
    return body.data as T
}

export async function fetchFeedback(id: string): Promise<Feedback> {
    const res = await fetch(`/api/feedback/${id}`)
    return parseApiResponse<Feedback>(res, "Erro ao carregar feedback")
}

export async function fetchFeedbackTimeline(id: string): Promise<FeedbackTimelineEvent[]> {
    const res = await fetch(`/api/feedback/${id}/timeline`)
    return parseApiResponse<FeedbackTimelineEvent[]>(res, "Erro ao carregar timeline")
}

export async function createFeedbackComment(id: string, data: CreateFeedbackCommentInput): Promise<FeedbackTimelineEvent> {
    const res = await fetch(`/api/feedback/${id}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
    })

    return parseApiResponse<FeedbackTimelineEvent>(res, "Erro ao criar comentário")
}

export async function fetchOpenCodeModels(): Promise<OpenCodeModelOption[]> {
    const res = await fetch("/api/feedback/opencode/models")
    return parseApiResponse<OpenCodeModelOption[]>(res, "Erro ao carregar modelos do OpenCode")
}

export async function queueFeedbackPlan(id: string, data: CreateFeedbackPlanInput): Promise<FeedbackAgentRun> {
    const res = await fetch(`/api/feedback/${id}/plan`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
    })

    return parseApiResponse<FeedbackAgentRun>(res, "Erro ao solicitar plano")
}

export async function queueFeedbackImplementation(id: string, data: CreateFeedbackPlanInput): Promise<FeedbackAgentRun> {
    const res = await fetch(`/api/feedback/${id}/implement`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
    })

    return parseApiResponse<FeedbackAgentRun>(res, "Erro ao solicitar implementação")
}

export async function queueFeedbackIteration(id: string, data: CreateFeedbackPlanInput & { message: string }): Promise<FeedbackAgentRun> {
    const res = await fetch(`/api/feedback/${id}/iterate`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
    })

    return parseApiResponse<FeedbackAgentRun>(res, "Erro ao solicitar ajustes")
}

export async function approveFeedback(id: string): Promise<FeedbackAgentRun> {
    const res = await fetch(`/api/feedback/${id}/approve`, { method: "POST" })
    return parseApiResponse<FeedbackAgentRun>(res, "Erro ao aprovar feedback")
}
