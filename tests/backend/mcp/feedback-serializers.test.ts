import { describe, expect, it } from "vitest"
import { serializeAuthenticatedFeedback, serializePublicFeedback } from "@/features/mcp/server/feedback-serializers"

const feedback = {
    _id: "feedback-1",
    title: "Corrigir busca",
    description: "A busca não encontra acentos.",
    type: "bug" as const,
    status: "pendente" as const,
    priority: "alta" as const,
    developmentStatus: "aberto" as const,
    createdBy: "user-1",
    creatorName: "Hero",
    creatorEmail: "hero@example.com",
    opencodeSessionId: "session-secret",
    worktreePath: "/tmp/worktree",
    selectedModel: "model-a",
    branchName: "agent/feedback-1",
    pullRequestNumber: 42,
    pullRequestUrl: "https://github.com/example/pull/42",
    previewUrl: "https://preview.example.com",
    previewSlug: "preview-42",
    lastAgentRunId: "run-1",
    createdAt: new Date("2026-07-28T12:00:00.000Z"),
    updatedAt: new Date("2026-07-28T13:00:00.000Z"),
}

describe("MCP feedback serializers", () => {
    it("does not expose sensitive fields publicly", () => {
        const result = serializePublicFeedback(feedback)
        const serialized = JSON.stringify(result)

        expect(result).toMatchObject({
            id: "feedback-1",
            title: "Corrigir busca",
            creatorName: "Hero",
            pullRequestUrl: "https://github.com/example/pull/42",
            previewUrl: "https://preview.example.com",
        })
        expect(serialized).not.toContain("creatorEmail")
        expect(serialized).not.toContain("worktreePath")
        expect(serialized).not.toContain("opencodeSessionId")
        expect(serialized).not.toContain("session-secret")
    })

    it("includes admin metadata without exposing worktree or prompts", () => {
        const result = serializeAuthenticatedFeedback(feedback, { includeAdminFields: true })
        const serialized = JSON.stringify(result)

        expect(result).toMatchObject({
            selectedModel: "model-a",
            branchName: "agent/feedback-1",
            pullRequestNumber: 42,
            previewSlug: "preview-42",
        })
        expect(serialized).not.toContain("worktreePath")
        expect(serialized).not.toContain("opencodeSessionId")
        expect(serialized).not.toContain("hero@example.com")
    })
})
