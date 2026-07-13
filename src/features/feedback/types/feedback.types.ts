import { FeedbackStatus, FeedbackType, FeedbackPriority } from "@/lib/config/colors";

export const feedbackDevelopmentStatuses = [
    "aberto",
    "planejando",
    "plano_pronto",
    "implementando",
    "aguardando_teste",
    "ajustes_solicitados",
    "aprovado",
    "mergeando",
    "concluido",
    "cancelado",
    "falhou",
] as const

export type FeedbackDevelopmentStatus = (typeof feedbackDevelopmentStatuses)[number]

export const feedbackTimelineEventTypes = [
    "feedback_created",
    "comment_created",
    "plan_requested",
    "plan_created",
    "implementation_requested",
    "agent_started",
    "agent_progress",
    "agent_completed",
    "agent_failed",
    "commit_created",
    "pull_request_created",
    "pull_request_updated",
    "deploy_started",
    "deploy_ready",
    "deploy_failed",
    "changes_requested",
    "approved",
    "merged",
    "cleanup_completed",
    "status_changed",
] as const

export type FeedbackTimelineEventType = (typeof feedbackTimelineEventTypes)[number]

export type FeedbackActorType = "user" | "admin" | "agent" | "system"
export type FeedbackTimelineVisibility = "public" | "admin"
export type FeedbackAgentRunKind = "plan" | "implement" | "iterate" | "merge"
export type FeedbackAgentRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

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
    developmentStatus?: FeedbackDevelopmentStatus;
    opencodeSessionId?: string;
    selectedModel?: string;
    branchName?: string;
    worktreePath?: string;
    pullRequestNumber?: number;
    pullRequestUrl?: string;
    previewUrl?: string;
    previewSlug?: string;
    lastAgentRunId?: string;
    approvedBy?: string;
    approvedAt?: string;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface FeedbackTimelineEvent {
    id: string;
    feedbackId: string;
    type: FeedbackTimelineEventType;
    actorType: FeedbackActorType;
    actorId?: string;
    actorName?: string;
    message: string;
    metadata?: Record<string, unknown>;
    visibility: FeedbackTimelineVisibility;
    createdAt: string;
    updatedAt: string;
}

export interface FeedbackAgentRun {
    id: string;
    feedbackId: string;
    iteration: number;
    kind: FeedbackAgentRunKind;
    status: FeedbackAgentRunStatus;
    opencodeSessionId?: string;
    modelName: string;
    prompt: string;
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number;
    errorMessage?: string;
    worktreePath?: string;
    branchName?: string;
    commitSha?: string;
    pullRequestUrl?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OpenCodeModelOption {
    id: string;
    label: string;
    provider?: string;
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

export interface CreateFeedbackCommentInput {
    message: string;
}

export interface CreateFeedbackPlanInput {
    model: string;
    message?: string;
}
