import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { DomainError } from "@/lib/api/route"

const mocks = vi.hoisted(() => ({ signupRoleIds: vi.fn(), create: vi.fn(), findOne: vi.fn() }))
vi.mock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/features/perfix/server/settings", () => ({ signupRoleIds: mocks.signupRoleIds }))
vi.mock("@/features/users/models/user", () => ({ User: { findOne: mocks.findOne, create: mocks.create } }))
vi.mock("bcryptjs", () => ({ hash: vi.fn().mockResolvedValue("hash") }))

import { POST } from "@/app/api/auth/register/route"

const request = () => new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: "novo_user", email: "novo@example.com", password: "segredo123" }),
})

describe("cadastro local com perfil padrão do Perfix", () => {
    beforeEach(() => {
        mocks.signupRoleIds.mockReset()
        mocks.create.mockReset().mockImplementation(async (data: Record<string, unknown>) => ({ _id: { toString: () => "u1" }, ...data }))
        mocks.findOne.mockReset().mockResolvedValue(null)
    })

    it("atribui o perfil padrão configurado", async () => {
        mocks.signupRoleIds.mockResolvedValue(["role-user"])
        const response = await POST(request())
        expect(response.status).toBe(201)
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ roles: ["role-user"] }))
        expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty("role")
    })

    it("falha fechado com 503 quando não há perfil padrão válido", async () => {
        mocks.signupRoleIds.mockRejectedValue(new DomainError(503, "Cadastro indisponível: configure um perfil padrão válido na integração Perfix.", "SIGNUP_UNAVAILABLE"))
        const response = await POST(request())
        expect(response.status).toBe(503)
        expect(await response.json()).toMatchObject({ code: "SIGNUP_UNAVAILABLE" })
        expect(mocks.create).not.toHaveBeenCalled()
    })
})
