import { beforeEach, describe, expect, it, vi } from "vitest"
import { DomainError } from "@/lib/api/route"
const mocks = vi.hoisted(() => ({ config: vi.fn(), fetch: vi.fn() }))
vi.mock("@/lib/integrations/config", () => ({ getIntegrationConfig: mocks.config }))
import { testOpex } from "@/features/opex-feedback/server/tester"
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); mocks.config.mockResolvedValue({ baseUrl: "https://opex.example", clientToken: "cli_secret" }) })
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "content-type": "application/json" } })
describe("testOpex", () => {
    it("confirma cliente/admin e listagem sem criar usuários", async () => {
        mocks.fetch.mockImplementation(async (url: string) => url.includes("client-login") ? new Response(null, { status: 307, headers: { "set-cookie": "opex_session=abc; HttpOnly" } }) : url.endsWith("session") ? response({ clientId: "c", clientName: "DnDicas", isAdmin: true, user: { id: "u", username: "default", email: null } }) : response([]))
        const emit = vi.fn()
        await expect(testOpex({ emit, signal: new AbortController().signal })).resolves.toContain("validada")
        expect(JSON.stringify(emit.mock.calls)).not.toContain("cli_secret")
        expect(mocks.fetch.mock.calls.every(([, options]) => !options.method || options.method === "GET")).toBe(true)
    })
    it.each([{}, { baseUrl: "https://opex.example", clientToken: "usr_user" }])("recusa configuração ausente ou token individual", async (config) => {
        mocks.config.mockResolvedValue(config)
        await expect(testOpex({ emit: vi.fn(), signal: new AbortController().signal })).rejects.toBeInstanceOf(DomainError)
        expect(mocks.fetch).not.toHaveBeenCalled()
    })
    it("recusa token inválido", async () => {
        mocks.fetch.mockResolvedValue(new Response(null, { status: 401 }))
        await expect(testOpex({ emit: vi.fn(), signal: new AbortController().signal })).rejects.toMatchObject({ code: "OPEX_CLIENT_TOKEN_INVALID" })
    })
})
