import { describe, expect, it } from "vitest"
import { getFeedbackChannelName, shouldRefetchFeedbackForTimelineEvent } from "@/features/feedback/realtime/feedback-pusher"

describe("feedback pusher realtime", () => {
    it("monta o canal publico do feedback", () => {
        expect(getFeedbackChannelName("feedback-123")).toBe("feedback.feedback-123")
    })

    it("marca eventos que devem atualizar o detalhe do feedback", () => {
        expect(shouldRefetchFeedbackForTimelineEvent("plan_created")).toBe(true)
        expect(shouldRefetchFeedbackForTimelineEvent("agent_failed")).toBe(true)
        expect(shouldRefetchFeedbackForTimelineEvent("comment_created")).toBe(false)
        expect(shouldRefetchFeedbackForTimelineEvent("agent_progress")).toBe(false)
    })
})
