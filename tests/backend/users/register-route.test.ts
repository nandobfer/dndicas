import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const dbConnect = vi.fn()
const findOne = vi.fn()
const create = vi.fn()
const hash = vi.fn()
const signupRoleIds = vi.fn()
const loggerError = vi.fn()

vi.mock("@/lib/db", () => ({ dbConnect }))
vi.mock("bcryptjs", () => ({ hash }))
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError, warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/features/users/models/user", () => ({ User: { findOne, create } }))
vi.mock("@/features/perfix/server/settings", () => ({ signupRoleIds }))

const { POST } = await import("@/app/api/auth/register/route")

const payload = {
    username: "novo_hero",
    email: "novo@example.com",
    name: "Novo Herói",
    password: "segredo123",
}

function register(body: unknown = payload) {
    return POST(new NextRequest("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }))
}

function createdUser() {
    return { _id: { toString: () => "user-new" }, email: payload.email, username: payload.username }
}

describe("POST /api/auth/register", () => {
    beforeEach(() => {
        dbConnect.mockReset().mockResolvedValue(undefined)
        findOne.mockReset().mockResolvedValue(null)
        create.mockReset().mockResolvedValue(createdUser())
        hash.mockReset().mockResolvedValue("hash-bcrypt")
        signupRoleIds.mockReset().mockResolvedValue(["role-user"])
        loggerError.mockReset()
    })

    it("cria a conta e devolve 201", async () => {
        const response = await register()

        expect(response.status).toBe(201)
        await expect(response.json()).resolves.toEqual({ id: "user-new", email: payload.email, username: payload.username })
        expect(dbConnect).toHaveBeenCalled()
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            username: payload.username,
            email: payload.email,
            passwordHash: "hash-bcrypt",
            passwordSetupRequired: false,
            roles: ["role-user"],
            status: "active",
            deleted: false,
        }))
    })

    it("recusa dados inválidos sem tocar no banco", async () => {
        const response = await register({ ...payload, email: "sem-arroba" })

        expect(response.status).toBe(400)
        expect(dbConnect).not.toHaveBeenCalled()
    })

    it("devolve 409 quando a conta já existe", async () => {
        findOne.mockResolvedValue({ _id: "existing" })

        const response = await register()

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toEqual({ error: "Já existe uma conta com este email ou usuário." })
        expect(create).not.toHaveBeenCalled()
    })

    it("converte o E11000 de email/usuário numa corrida em 409", async () => {
        create.mockRejectedValue(Object.assign(new Error("E11000 duplicate key error"), {
            code: 11000,
            keyPattern: { email: 1 },
            keyValue: { email: payload.email },
        }))

        const response = await register()

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toEqual({ error: "Já existe uma conta com este email ou usuário." })
        expect(loggerError).not.toHaveBeenCalled()
    })

    it("responde 500 sem detalhes internos e loga só metadados", async () => {
        create.mockRejectedValue(Object.assign(new Error(`E11000 duplicate key error dup key: { email: "${payload.email}" }`), {
            code: 11000,
            keyPattern: { clerkId: 1 },
            keyValue: { clerkId: null },
        }))

        const response = await register()

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: "Erro ao criar conta" })
        expect(loggerError).toHaveBeenCalledWith(
            { route: "auth/register", method: "POST", errorName: "Error", code: 11000 },
            "Falha ao criar conta",
        )
        // O valor duplicado (email) nunca vai para o log.
        expect(JSON.stringify(loggerError.mock.calls)).not.toContain(payload.email)
    })

    it("responde 500 sem detalhes para falhas genéricas", async () => {
        create.mockRejectedValue(new Error("conexão caiu"))

        const response = await register()

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: "Erro ao criar conta" })
        expect(JSON.stringify(loggerError.mock.calls)).not.toContain("conexão caiu")
    })
})
