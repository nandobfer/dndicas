import { FeedbackStatus, FeedbackType, FeedbackPriority } from "@/lib/config/colors";

export interface Feedback {
    id: string;
    title: string;
    description: string;
    type: FeedbackType;
    status: FeedbackStatus;
    priority?: FeedbackPriority;
    createdBy: string; // Clerk userId
    creatorName: string;
    creatorEmail?: string;
    createdAt: string;
    updatedAt: string;
}

export interface FeedbackResponse {
    items: Feedback[];
    total: number;
    page: number;
    limit: number;
}

export interface FeedbackFilters {
    search?: string;
    status?: FeedbackStatus | "all";
    priority?: FeedbackPriority | "all";
    type?: FeedbackType | "all";
    page?: number;
    limit?: number;
}

export interface CreateFeedbackInput {
    title: string;
    description: string;
    type: FeedbackType;
}

export interface UpdateFeedbackInput {
    title?: string;
    description?: string;
    type?: FeedbackType;
    status?: FeedbackStatus;
    priority?: FeedbackPriority;
}
