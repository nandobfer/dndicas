import { describe, expect, it, vi } from "vitest"
import { makeJsonRequest, readJson } from "../helpers/http"
import { importFresh } from "../helpers/module"

describe("POST /api/admin/entity-generation/spells/[id]/generate", () => {
    it("requires an admin user", async () => {
        vi.doMock("@/core/auth/server", () => ({
            currentUser: vi.fn().mockResolvedValue(null),
        }))

        const mod = await importFresh<typeof import("@/app/api/admin/entity-generation/spells/[id]/generate/route")>("@/app/api/admin/entity-generation/spells/[id]/generate/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/admin/entity-generation/spells/spell-1/generate", {
            method: "POST",
            body: JSON.stringify({ runId: "run-1" }),
        }), { params: Promise.resolve({ id: "spell-1" }) })

        expect(response.status).toBe(403)
    })

    it("publishes progress through Pusher and returns generated candidates", async () => {
        const publishProgress = vi.fn().mockResolvedValue(undefined)
        const publishFailure = vi.fn().mockResolvedValue(undefined)
        const generateSpellCandidates = vi.fn(async (_id: string, _userId: string, onProgress: (progress: { current: number; total: number; message: string }) => Promise<void>) => {
            await onProgress({ current: 1, total: 1, message: "Gerando magia magic missile" })
            return { current: { _id: "spell-1" }, candidates: [{ candidateId: "magic missile:xphb:1" }] }
        })

        vi.doMock("@/core/auth/server", () => ({
            currentUser: vi.fn().mockResolvedValue({ id: "user-1", publicMetadata: { role: "admin" } }),
        }))
        vi.doMock("@/features/entity-generation/server/spell-ai-generation-service", () => ({
            generateSpellCandidates,
        }))
        vi.doMock("@/features/entity-generation/realtime/entity-generation-pusher-service", () => ({
            EntityGenerationPusherService: {
                getInstance: vi.fn(() => ({ publishProgress, publishFailure })),
            },
        }))

        const mod = await importFresh<typeof import("@/app/api/admin/entity-generation/spells/[id]/generate/route")>("@/app/api/admin/entity-generation/spells/[id]/generate/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/admin/entity-generation/spells/spell-1/generate", {
            method: "POST",
            body: JSON.stringify({ runId: "run-1" }),
        }), { params: Promise.resolve({ id: "spell-1" }) })
        const payload = await readJson<{ candidates: Array<{ candidateId: string }> }>(response)

        expect(response.status).toBe(200)
        expect(generateSpellCandidates).toHaveBeenCalledWith("spell-1", "user-1", expect.any(Function))
        expect(publishProgress).toHaveBeenCalledWith("run-1", { current: 0, total: 1, message: "Buscando fonte de dados..." })
        expect(publishProgress).toHaveBeenCalledWith("run-1", { current: 1, total: 1, message: "Gerando magia magic missile" })
        expect(publishFailure).not.toHaveBeenCalled()
        expect(payload.candidates[0].candidateId).toBe("magic missile:xphb:1")
    })
})
