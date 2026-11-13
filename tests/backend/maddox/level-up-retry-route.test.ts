import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeJsonRequest } from "../helpers/http"
import { importFresh } from "../helpers/module"

/** Rota "Tentar de novo" da subida de nível do Personagem Opex (DND-56): `maddox.play`, corpo vazio, serviço com o usuário efetivo. */

const permissions: string[] = []
let who: "player" | "noPermission" | "anonymous" = "player"

vi.doMock("@/features/auth/server/actor", () => ({
    requirePermissionActor: vi.fn(async (permission: string) => {
        permissions.push(permission)
        const { DomainError } = await import("@/lib/api/route")
        if (who === "anonymous") throw new DomainError(401, "Faça login para continuar.", "UNAUTHORIZED")
        if (who === "noPermission") throw new DomainError(403, "Você não tem permissão para esta ação.", "FORBIDDEN")
        return { id: "user-1", name: "Ana", role: "user", permissions: ["maddox.play"] }
    }),
}))
const service = { retryOpexLevelUp: vi.fn(async () => ({ campaignId: "c1" })) }
vi.doMock("@/features/maddox/server/level-up-opex", () => service)

type Route = typeof import("@/app/api/maddox/campaigns/[id]/game/level-ups/[stepId]/retry/route")
const PATH = "@/app/api/maddox/campaigns/[id]/game/level-ups/[stepId]/retry/route"
const URL = "http://localhost/api/maddox/campaigns/c1/game/level-ups/s1/retry"
const ctx = { params: Promise.resolve({ id: "c1", stepId: "s1" }) }
const post = async (body: unknown) => (await importFresh<Route>(PATH)).POST(makeJsonRequest(URL, { method: "POST", body: JSON.stringify(body) }), ctx as never)

describe("POST …/game/level-ups/[stepId]/retry", () => {
    beforeEach(() => {
        who = "player"
        permissions.length = 0
        service.retryOpexLevelUp.mockClear()
    })

    it("exige maddox.play: sem login 401, sem permissão 403, e não chama o serviço", async () => {
        for (const [state, status] of [["anonymous", 401], ["noPermission", 403]] as const) {
            who = state
            expect((await post({})).status).toBe(status)
        }
        expect(permissions.every((permission) => permission === "maddox.play")).toBe(true)
        expect(service.retryOpexLevelUp).not.toHaveBeenCalled()
    })

    it("corpo com campos responde 400 em pt-BR", async () => {
        const response = await post({ stepId: "outro" })
        expect(response.status).toBe(400)
        expect(JSON.stringify(await response.json())).toContain("Esta ação não aceita dados no corpo.")
        expect(service.retryOpexLevelUp).not.toHaveBeenCalled()
    })

    it("corpo vazio chama o serviço com a campanha, o degrau e o usuário efetivo; erro de domínio vira o status", async () => {
        const ok = await post({})
        expect(ok.status).toBe(200)
        expect(service.retryOpexLevelUp).toHaveBeenCalledWith("c1", "s1", "user-1")
        service.retryOpexLevelUp.mockImplementationOnce(async () => {
            const { DomainError } = await import("@/lib/api/route")
            throw new DomainError(403, "Só o dono da campanha pode fazer isso.", "FORBIDDEN")
        })
        const refused = await post({})
        expect(refused.status).toBe(403)
        expect(JSON.stringify(await refused.json())).toContain("Só o dono da campanha pode fazer isso.")
    })
})
