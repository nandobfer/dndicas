import { FeedbackFilters, FeedbackResponse, Feedback, CreateFeedbackInput, UpdateFeedbackInput } from "../types/feedback.types";

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
