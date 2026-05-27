import { describe, expect, it, vi } from "vitest"
import { makeJsonRequest, readJson } from "../helpers/http"
import { importFresh } from "../helpers/module"

describe("POST /api/admin/entity-generation/races/[id]/generate", () => {
    it("requires an admin user", async () => {
        vi.doMock("@clerk/nextjs/server", () => ({
            currentUser: vi.fn().mockResolvedValue(null),
        }))

        const mod = await importFresh<typeof import("@/app/api/admin/entity-generation/races/[id]/generate/route")>("@/app/api/admin/entity-generation/races/[id]/generate/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/admin/entity-generation/races/race-1/generate", {
            method: "POST",
            body: JSON.stringify({ runId: "run-1" }),
        }), { params: Promise.resolve({ id: "race-1" }) })

        expect(response.status).toBe(403)
    })

    it("publishes progress through Pusher and returns generated candidates", async () => {
        const publishProgress = vi.fn().mockResolvedValue(undefined)
        const publishFailure = vi.fn().mockResolvedValue(undefined)
        const generateRaceCandidates = vi.fn(async (_id: string, onProgress: (progress: { current: number; total: number; message: string }) => Promise<void>) => {
            await onProgress({ current: 1, total: 2, message: "Gerando raça" })
            return { current: { _id: "race-1" }, candidates: [{ candidateId: "candidate-1" }] }
        })

        vi.doMock("@clerk/nextjs/server", () => ({
            currentUser: vi.fn().mockResolvedValue({ id: "user-1", publicMetadata: { role: "admin" } }),
        }))
        vi.doMock("@/features/entity-generation/server/race-ai-generation-service", () => ({
            generateRaceCandidates,
        }))
        vi.doMock("@/features/entity-generation/realtime/entity-generation-pusher-service", () => ({
            EntityGenerationPusherService: {
                getInstance: vi.fn(() => ({ publishProgress, publishFailure })),
            },
        }))

        const mod = await importFresh<typeof import("@/app/api/admin/entity-generation/races/[id]/generate/route")>("@/app/api/admin/entity-generation/races/[id]/generate/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/admin/entity-generation/races/race-1/generate", {
            method: "POST",
            body: JSON.stringify({ runId: "run-1" }),
        }), { params: Promise.resolve({ id: "race-1" }) })
        const payload = await readJson<{ candidates: Array<{ candidateId: string }> }>(response)

        expect(response.status).toBe(200)
        expect(generateRaceCandidates).toHaveBeenCalledWith("race-1", expect.any(Function))
        expect(publishProgress).toHaveBeenCalledWith("run-1", { current: 0, total: 1, message: "Buscando fonte de dados..." })
        expect(publishProgress).toHaveBeenCalledWith("run-1", { current: 1, total: 2, message: "Gerando raça" })
        expect(publishFailure).not.toHaveBeenCalled()
        expect(payload.candidates[0].candidateId).toBe("candidate-1")
    })

    it("publishes failure when generation fails", async () => {
        const publishProgress = vi.fn().mockResolvedValue(undefined)
        const publishFailure = vi.fn().mockResolvedValue(undefined)

        vi.doMock("@clerk/nextjs/server", () => ({
            currentUser: vi.fn().mockResolvedValue({ id: "user-1", publicMetadata: { role: "admin" } }),
        }))
        vi.doMock("@/features/entity-generation/server/race-ai-generation-service", () => ({
            generateRaceCandidates: vi.fn().mockRejectedValue(new Error("Falhou")),
        }))
        vi.doMock("@/features/entity-generation/realtime/entity-generation-pusher-service", () => ({
            EntityGenerationPusherService: {
                getInstance: vi.fn(() => ({ publishProgress, publishFailure })),
            },
        }))

        const mod = await importFresh<typeof import("@/app/api/admin/entity-generation/races/[id]/generate/route")>("@/app/api/admin/entity-generation/races/[id]/generate/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/admin/entity-generation/races/race-1/generate", {
            method: "POST",
            body: JSON.stringify({ runId: "run-1" }),
        }), { params: Promise.resolve({ id: "race-1" }) })

        expect(response.status).toBe(500)
        expect(publishFailure).toHaveBeenCalledWith("run-1", "Falhou")
    })

})
