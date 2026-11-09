import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeJsonRequest, makeRequest } from "../helpers/http"
import { importFresh } from "../helpers/module"

/**
 * Rotas dos NPCs Opex (DND-27): promover e remover exigem `maddox.play` e a permissão "Adicionar Personagens Opex"
 * (`maddox.opex`); as regras de dono, NPC conhecido, limite e campanha encerrada ficam no serviço (testado em
 * opex-npc-tools). As memórias globais dos NPCs Opex exigem `integrations.ai.view`/`edit`.
 */

const permissions: string[] = []
let actorPermissions: string[] = ["maddox.play", "maddox.opex"]
let who: "user" | "anonymous" = "user"

vi.doMock("@/features/auth/server/actor", () => ({
    requirePermissionActor: vi.fn(async (permission: string) => {
        permissions.push(permission)
        const { DomainError } = await import("@/lib/api/route")
        if (who === "anonymous") throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
        if (!actorPermissions.includes(permission)) throw new DomainError(403, "Você não tem permissão para esta operação.", "FORBIDDEN")
        return { id: "user-1", name: "Ana", role: "user", permissions: actorPermissions }
    }),
    requireAdminActor: vi.fn(async (permission: string) => {
        permissions.push(permission)
        const { DomainError } = await import("@/lib/api/route")
        if (!actorPermissions.includes(permission)) throw new DomainError(403, "Você não tem permissão para esta operação.", "FORBIDDEN")
        return { id: "admin-1", name: "Admin", role: "admin", permissions: actorPermissions }
    }),
}))

const state = { campaignId: "c1" }
const service = {
    promoteOpexNpcAsOwner: vi.fn(async () => state),
    retireOpexNpcAsOwner: vi.fn(async () => state),
}
vi.doMock("@/features/maddox/server/opex-npcs", () => service)
const memories = {
    listOpexNpcGlobalMemories: vi.fn(async () => [{ id: "m_1", title: "Estranhos", text: "Desconfie.", updatedAt: null }]),
    createOpexNpcGlobalMemory: vi.fn(async (input: { title: string; text: string }) => ({ id: "m_2", ...input, updatedAt: null })),
    updateOpexNpcGlobalMemory: vi.fn(async (id: string, input: { title: string; text: string }) => ({ id, ...input, updatedAt: null })),
    deleteOpexNpcGlobalMemory: vi.fn(async () => undefined),
}
vi.doMock("@/features/engramind/server/opex-npcs", () => memories)

type OpexRoute = typeof import("@/app/api/maddox/campaigns/[id]/npcs/[npcId]/opex/route")
type MemoriesRoute = typeof import("@/app/api/ai/features/maddox/opex-npc-memories/route")
type MemoryRoute = typeof import("@/app/api/ai/features/maddox/opex-npc-memories/[memoryId]/route")
const opexPath = "@/app/api/maddox/campaigns/[id]/npcs/[npcId]/opex/route"
const url = "http://localhost/api/maddox/campaigns/c1/npcs/n1/opex"
const params = { params: Promise.resolve({ id: "c1", npcId: "n1" }) }

describe("rotas dos NPCs Opex", () => {
    beforeEach(() => {
        who = "user"
        actorPermissions = ["maddox.play", "maddox.opex"]
        permissions.length = 0
        Object.values(service).forEach((fn) => fn.mockClear())
        Object.values(memories).forEach((fn) => fn.mockClear())
    })

    it("promover e remover chamam o serviço com o usuário efetivo e devolvem a mesa", async () => {
        const route = await importFresh<OpexRoute>(opexPath)
        const promoted = await route.POST(makeJsonRequest(url, { method: "POST", body: "{}" }), params)
        expect(promoted.status).toBe(200)
        expect(await promoted.json()).toMatchObject({ success: true, data: { campaignId: "c1" } })
        expect(service.promoteOpexNpcAsOwner).toHaveBeenCalledWith("c1", "n1", "user-1")
        const removed = await route.DELETE(makeRequest(url, { method: "DELETE" }), params)
        expect(removed.status).toBe(200)
        expect(service.retireOpexNpcAsOwner).toHaveBeenCalledWith("c1", "n1", "user-1")
        expect(permissions).toEqual(["maddox.play", "maddox.play"])
    })

    it("sem a permissão Adicionar Personagens Opex: 403 em pt-BR, sem chamar o serviço; visitante: 401", async () => {
        actorPermissions = ["maddox.play"]
        const route = await importFresh<OpexRoute>(opexPath)
        for (const response of [await route.POST(makeJsonRequest(url, { method: "POST", body: "{}" }), params), await route.DELETE(makeRequest(url, { method: "DELETE" }), params)]) {
            expect(response.status).toBe(403)
            expect(await response.json()).toMatchObject({ success: false, error: "Você não tem permissão para cuidar de NPCs Opex." })
        }
        expect(service.promoteOpexNpcAsOwner).not.toHaveBeenCalled()
        expect(service.retireOpexNpcAsOwner).not.toHaveBeenCalled()
        who = "anonymous"
        expect((await route.POST(makeJsonRequest(url, { method: "POST", body: "{}" }), params)).status).toBe(401)
    })

    it("memórias globais dos NPCs Opex: listar exige integrations.ai.view e gravar integrations.ai.edit", async () => {
        const list = await importFresh<MemoriesRoute>("@/app/api/ai/features/maddox/opex-npc-memories/route")
        const base = "http://localhost/api/ai/features/maddox/opex-npc-memories"
        actorPermissions = ["integrations.ai.view"]
        expect(await (await list.GET(makeRequest(base), { params: Promise.resolve({}) })).json()).toMatchObject({ success: true, data: [{ id: "m_1" }] })
        expect((await list.POST(makeJsonRequest(base, { method: "POST", body: JSON.stringify({ title: "A", text: "B" }) }), { params: Promise.resolve({}) })).status).toBe(403)
        expect(memories.createOpexNpcGlobalMemory).not.toHaveBeenCalled()
        actorPermissions = ["integrations.ai.view", "integrations.ai.edit"]
        expect((await list.POST(makeJsonRequest(base, { method: "POST", body: JSON.stringify({ title: "A", text: "B" }) }), { params: Promise.resolve({}) })).status).toBe(201)
        expect(memories.createOpexNpcGlobalMemory).toHaveBeenCalledWith({ title: "A", text: "B" }, "admin-1")
        // Importar de novo recarrega os módulos: só depois de usar a rota da lista.
        const one = await importFresh<MemoryRoute>("@/app/api/ai/features/maddox/opex-npc-memories/[memoryId]/route")
        const memoryParams = { params: Promise.resolve({ memoryId: "m_1" }) }
        expect((await one.PATCH(makeJsonRequest(`${base}/m_1`, { method: "PATCH", body: JSON.stringify({ title: "A", text: "C" }) }), memoryParams)).status).toBe(200)
        expect(memories.updateOpexNpcGlobalMemory).toHaveBeenCalledWith("m_1", { title: "A", text: "C" }, "admin-1")
        expect((await one.DELETE(makeRequest(`${base}/m_1`, { method: "DELETE" }), memoryParams)).status).toBe(200)
        expect(memories.deleteOpexNpcGlobalMemory).toHaveBeenCalledWith("m_1", "admin-1")
    })
})
