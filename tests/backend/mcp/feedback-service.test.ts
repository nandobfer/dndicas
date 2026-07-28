import { describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

const userAuth = {
    userId: "user-1",
    username: "hero",
    name: "Hero",
    email: "hero@example.com",
    role: "user" as const,
}

const adminAuth = {
    userId: "admin-1",
    username: "admin",
    name: "Admin",
    email: "admin@example.com",
    role: "admin" as const,
}

function feedback(overrides: Record<string, unknown> = {}) {
    return {
        _id: "feedback-1",
        title: "Corrigir busca",
        description: "A busca não encontra acentos.",
        type: "bug",
        status: "pendente",
        priority: "alta",
        developmentStatus: "aberto",
        createdBy: "user-1",
        creatorName: "Hero",
        creatorEmail: "hero@example.com",
        worktreePath: "/tmp/worktree",
        pullRequestNumber: 42,
        selectedModel: "model-a",
        createdAt: new Date("2026-07-28T12:00:00.000Z"),
        updatedAt: new Date("2026-07-28T13:00:00.000Z"),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

describe("MCP feedback service", () => {
    it("lists public feedbacks without sensitive fields", async () => {
        const findChain = {
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([feedback()]),
        }

        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/core/database/audit-log", () => ({ logAction: vi.fn() }))
        vi.doMock("@/features/feedback/api/feedback.model", () => ({
            FeedbackModel: {
                find: vi.fn().mockReturnValue(findChain),
                countDocuments: vi.fn().mockResolvedValue(1),
            },
        }))
        vi.doMock("@/features/feedback/services/feedback-timeline-service", () => ({ createFeedbackTimelineEvent: vi.fn(), listFeedbackTimelineEvents: vi.fn() }))
        vi.doMock("@/features/feedback/services/feedback-agent-run-service", () => ({ hasActiveFeedbackAgentRun: vi.fn(), queueFeedbackPlan: vi.fn(), queueFeedbackAgentRun: vi.fn() }))

        const mod = await importFresh<typeof import("@/features/mcp/server/feedback-service")>("@/features/mcp/server/feedback-service")
        const result = await mod.listFeedbacks({ search: "", page: 1, limit: 20 })

        expect(result.total).toBe(1)
        expect(JSON.stringify(result)).not.toContain("creatorEmail")
        expect(JSON.stringify(result)).not.toContain("worktreePath")
        expect(result.items[0]).toMatchObject({ id: "feedback-1", title: "Corrigir busca" })
    })

    it("creates feedback as the token owner and strips admin fields for normal users", async () => {
        const create = vi.fn().mockResolvedValue(feedback({ status: "pendente", priority: undefined }))
        const createFeedbackTimelineEvent = vi.fn().mockResolvedValue({ _id: "event-1" })
        const logAction = vi.fn()

        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/core/database/audit-log", () => ({ logAction }))
        vi.doMock("@/features/feedback/api/feedback.model", () => ({ FeedbackModel: { create } }))
        vi.doMock("@/features/feedback/services/feedback-timeline-service", () => ({ createFeedbackTimelineEvent, listFeedbackTimelineEvents: vi.fn() }))
        vi.doMock("@/features/feedback/services/feedback-agent-run-service", () => ({ hasActiveFeedbackAgentRun: vi.fn(), queueFeedbackPlan: vi.fn(), queueFeedbackAgentRun: vi.fn() }))

        const mod = await importFresh<typeof import("@/features/mcp/server/feedback-service")>("@/features/mcp/server/feedback-service")
        const result = await mod.createFeedback({
            title: "Nova busca",
            description: "A busca precisa melhorar.",
            type: "melhoria",
            status: "concluido",
            priority: "alta",
        }, userAuth)

        expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ status: "concluido", priority: "alta" }))
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "user-1", creatorEmail: "hero@example.com" }))
        expect(createFeedbackTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "feedback_created", actorType: "user" }))
        expect(logAction).toHaveBeenCalledWith("CREATE", "Feedback", "feedback-1", "user-1", expect.objectContaining({ source: "mcp" }))
        expect(result).toMatchObject({ id: "feedback-1", createdBy: "user-1" })
    })

    it("prevents non owners from updating feedback", async () => {
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/core/database/audit-log", () => ({ logAction: vi.fn() }))
        vi.doMock("@/features/feedback/api/feedback.model", () => ({
            FeedbackModel: { findById: vi.fn().mockResolvedValue(feedback({ createdBy: "other-user" })) },
        }))
        vi.doMock("@/features/feedback/services/feedback-timeline-service", () => ({ createFeedbackTimelineEvent: vi.fn(), listFeedbackTimelineEvents: vi.fn() }))
        vi.doMock("@/features/feedback/services/feedback-agent-run-service", () => ({ hasActiveFeedbackAgentRun: vi.fn(), queueFeedbackPlan: vi.fn(), queueFeedbackAgentRun: vi.fn() }))

        const mod = await importFresh<typeof import("@/features/mcp/server/feedback-service")>("@/features/mcp/server/feedback-service")

        await expect(mod.updateFeedback({ id: "feedback-1", title: "Outro título" }, userAuth)).rejects.toMatchObject({ code: "FORBIDDEN" })
    })

    it("admin request for plan queues a run and blocks active executions", async () => {
        const queueFeedbackPlan = vi.fn().mockResolvedValue({ _id: "run-1", feedbackId: "feedback-1", kind: "plan", status: "queued", modelName: "model-a" })
        const hasActiveFeedbackAgentRun = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/core/database/audit-log", () => ({ logAction: vi.fn() }))
        vi.doMock("@/features/feedback/api/feedback.model", () => ({ FeedbackModel: { findById: vi.fn().mockResolvedValue(feedback()) } }))
        vi.doMock("@/features/feedback/services/feedback-timeline-service", () => ({ createFeedbackTimelineEvent: vi.fn(), listFeedbackTimelineEvents: vi.fn() }))
        vi.doMock("@/features/feedback/services/feedback-agent-run-service", () => ({ hasActiveFeedbackAgentRun, queueFeedbackPlan, queueFeedbackAgentRun: vi.fn() }))

        const mod = await importFresh<typeof import("@/features/mcp/server/feedback-service")>("@/features/mcp/server/feedback-service")
        const result = await mod.requestFeedbackPlan({ id: "feedback-1", model: "model-a" }, adminAuth)

        expect(result).toMatchObject({ id: "run-1", kind: "plan", status: "queued" })
        expect(queueFeedbackPlan).toHaveBeenCalledWith(expect.objectContaining({ feedbackId: "feedback-1", actorId: "admin-1", model: "model-a" }))
        await expect(mod.requestFeedbackPlan({ id: "feedback-1", model: "model-a" }, adminAuth)).rejects.toMatchObject({ code: "ACTIVE_AGENT_RUN" })
    })
})
