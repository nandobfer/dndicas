import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { DomainError } from "@/lib/api/route"

const mocks = vi.hoisted(() => ({ requestAccess: vi.fn(), listClasses: vi.fn() }))
vi.mock("@/features/perfix/server/access", () => ({ requestAccess: mocks.requestAccess }))
vi.mock("@/features/users/models/user", () => ({ User: { findById: vi.fn() } }))
vi.mock("@/features/classes/api/classes-service", () => ({ listClasses: mocks.listClasses, createClass: vi.fn() }))

import { auth, currentUser } from "@/features/perfix/server/auth"
import { GET } from "@/app/api/classes/route"

describe("auth()/currentUser() tratam sessão inválida como visitante", () => {
    beforeEach(() => {
        mocks.requestAccess.mockReset()
        mocks.listClasses.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 })
    })

    it.each([
        ["usuário inativo ou excluído", new DomainError(401, "Sessão expirada", "UNAUTHORIZED")],
        ["simulação inválida", new DomainError(403, "Simulação inválida", "VIEW_AS_INVALID")],
        ["simulação proibida", new DomainError(403, "Somente administradores reais podem simular acesso.", "VIEW_AS_FORBIDDEN")],
    ])("%s vira visitante", async (_, error) => {
        mocks.requestAccess.mockRejectedValue(error)
        await expect(auth()).resolves.toEqual({ userId: null })
        await expect(currentUser()).resolves.toBeNull()
    })

    it("outras falhas continuam propagando", async () => {
        mocks.requestAccess.mockRejectedValue(new Error("mongo fora do ar"))
        await expect(auth()).rejects.toThrow("mongo fora do ar")
    })

    it("rota pública do catálogo responde como visitante para usuário inativo", async () => {
        mocks.requestAccess.mockRejectedValue(new DomainError(401, "Sessão expirada", "UNAUTHORIZED"))
        const response = await GET(new NextRequest("http://localhost/api/classes"))
        expect(response.status).toBe(200)
        expect(mocks.listClasses).toHaveBeenCalled()
    })
})
