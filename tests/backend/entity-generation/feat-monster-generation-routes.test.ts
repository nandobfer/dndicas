import { describe, expect, it, vi } from "vitest"
import { makeJsonRequest, readJson } from "../helpers/http"
import { importFresh } from "../helpers/module"

describe("entity generation feat and monster routes", () => {
    it("generates feat candidates through Pusher", async () => {
        const publishProgress = vi.fn().mockResolvedValue(undefined)
        const publishFailure = vi.fn().mockResolvedValue(undefined)
        const generateFeatCandidates = vi.fn(async (_id: string, onProgress: (progress: { current: number; total: number; message: string }) => Promise<void>) => {
            await onProgress({ current: 1, total: 1, message: "Gerando talento Actor" })
            return { current: { _id: "feat-1" }, candidates: [{ candidateId: "actor:xphb" }] }
        })

        vi.doMock("@/core/auth/server", () => ({
            currentUser: vi.fn().mockResolvedValue({ id: "user-1", publicMetadata: { role: "admin" } }),
        }))
        vi.doMock("@/features/entity-generation/server/feat-ai-generation-service", () => ({ generateFeatCandidates }))
        vi.doMock("@/features/entity-generation/realtime/entity-generation-pusher-service", () => ({
            EntityGenerationPusherService: { getInstance: vi.fn(() => ({ publishProgress, publishFailure })) },
        }))

        const mod = await importFresh<typeof import("@/app/api/admin/entity-generation/feats/[id]/generate/route")>("@/app/api/admin/entity-generation/feats/[id]/generate/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/admin/entity-generation/feats/feat-1/generate", {
            method: "POST",
            body: JSON.stringify({ runId: "run-feat" }),
        }), { params: Promise.resolve({ id: "feat-1" }) })
        const payload = await readJson<{ candidates: Array<{ candidateId: string }> }>(response)

        expect(response.status).toBe(200)
        expect(generateFeatCandidates).toHaveBeenCalledWith("feat-1", expect.any(Function))
        expect(publishProgress).toHaveBeenCalledWith("run-feat", { current: 0, total: 1, message: "Buscando fonte de dados..." })
        expect(publishProgress).toHaveBeenCalledWith("run-feat", { current: 1, total: 1, message: "Gerando talento Actor" })
        expect(publishFailure).not.toHaveBeenCalled()
        expect(payload.candidates[0].candidateId).toBe("actor:xphb")
    })

    it("generates monster candidates through Pusher", async () => {
        const publishProgress = vi.fn().mockResolvedValue(undefined)
        const publishFailure = vi.fn().mockResolvedValue(undefined)
        const generateMonsterCandidates = vi.fn(async (_id: string, _userId: string, onProgress: (progress: { current: number; total: number; message: string }) => Promise<void>) => {
            await onProgress({ current: 1, total: 2, message: "Gerando monstro Goblin" })
            await onProgress({ current: 2, total: 2, message: "Gerando características" })
            return { current: { _id: "monster-1" }, candidates: [{ candidateId: "goblin:mm" }] }
        })

        vi.doMock("@/core/auth/server", () => ({
            currentUser: vi.fn().mockResolvedValue({ id: "user-1", publicMetadata: { role: "admin" } }),
        }))
        vi.doMock("@/features/entity-generation/server/monster-ai-generation-service", () => ({ generateMonsterCandidates }))
        vi.doMock("@/features/entity-generation/realtime/entity-generation-pusher-service", () => ({
            EntityGenerationPusherService: { getInstance: vi.fn(() => ({ publishProgress, publishFailure })) },
        }))

        const mod = await importFresh<typeof import("@/app/api/admin/entity-generation/monsters/[id]/generate/route")>("@/app/api/admin/entity-generation/monsters/[id]/generate/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/admin/entity-generation/monsters/monster-1/generate", {
            method: "POST",
            body: JSON.stringify({ runId: "run-monster" }),
        }), { params: Promise.resolve({ id: "monster-1" }) })
        const payload = await readJson<{ candidates: Array<{ candidateId: string }> }>(response)

        expect(response.status).toBe(200)
        expect(generateMonsterCandidates).toHaveBeenCalledWith("monster-1", "user-1", expect.any(Function))
        expect(publishProgress).toHaveBeenCalledWith("run-monster", { current: 0, total: 1, message: "Buscando fonte de dados..." })
        expect(publishProgress).toHaveBeenCalledWith("run-monster", { current: 1, total: 2, message: "Gerando monstro Goblin" })
        expect(publishProgress).toHaveBeenCalledWith("run-monster", { current: 2, total: 2, message: "Gerando características" })
        expect(publishFailure).not.toHaveBeenCalled()
        expect(payload.candidates[0].candidateId).toBe("goblin:mm")
    })
})
