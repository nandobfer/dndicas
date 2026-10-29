import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { normalizeOpexUrl, OpexClient, portalToken } from "@/features/opex-feedback/server/opex-client"

const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset() })
afterEach(() => vi.unstubAllGlobals())
const client = new OpexClient("https://opex.example/sub/")
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

describe("OpexClient", () => {
    it("normaliza URL e preserva subcaminho", () => { expect(normalizeOpexUrl("https://opex.example/sub/")).toBe("https://opex.example/sub") })
    it.each(["javascript:alert(1)", "https://u:p@opex.example", "https://opex.example?t=secret", "inválida"])("recusa URL insegura %s", (url) => { expect(() => normalizeOpexUrl(url)).toThrow() })
    it("captura cookie sem seguir redirects ou enviar credenciais ao navegador", async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 307, headers: { "Set-Cookie": "opex_session=abc; HttpOnly; Secure" } }))
        expect(await client.login("cli_foo")).toBe("opex_session=abc")
        expect(fetchMock).toHaveBeenCalledWith("https://opex.example/sub/api/auth/client-login?t=cli_foo", expect.objectContaining({ redirect: "manual", cache: "no-store" }))
    })
    it.each([new Response(null, { status: 401 }), new Response(null, { status: 307 }), new Response(null, { status: 200, headers: { "Set-Cookie": "opex_session=abc" } })])("recusa handshake inválido", async (response) => {
        fetchMock.mockResolvedValue(response)
        await expect(client.login("cli_secret")).rejects.toMatchObject({ code: "OPEX_CLIENT_TOKEN_INVALID" })
    })
    it("não expõe erro de rede contendo token", async () => {
        fetchMock.mockRejectedValue(new Error("https://opex.example?t=cli_secret"))
        await expect(client.login("cli_secret")).rejects.toThrow("Não foi possível conectar ao Opex")
    })
    it("reconhece conflitos sem expor mensagem remota", async () => {
        fetchMock.mockResolvedValue(json({ success: false, code: "EMAIL_IN_USE", error: "secret" }, 409))
        await expect(client.createUser("opex_session=abc", { username: "teste", admin: false })).rejects.toMatchObject({ code: "EMAIL_IN_USE", status: 409 })
    })
    it("valida resposta antes de devolver ao serviço", async () => {
        fetchMock.mockResolvedValue(json({ success: true, data: "invalid" }))
        await expect(client.request("/api/test", "session", z.number())).rejects.toMatchObject({ code: "OPEX_UNAVAILABLE" })
    })
    it("seleção de cliente utiliza o cookie reemitido", async () => {
        fetchMock.mockResolvedValue(new Response("{}", { headers: { "set-cookie": "opex_session=new; HttpOnly" } }))
        expect(await client.selectClient("opex_session=old", "client-1")).toBe("opex_session=new")
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/client-select"), expect.objectContaining({ body: '{"clientId":"client-1"}' }))
    })
    it("aceita somente link individual local", () => {
        expect(portalToken("/cliente?t=usr_abc")).toBe("usr_abc")
        for (const url of ["https://evil.example/cliente?t=usr_abc", "/cliente?t=cli_admin", "/other?t=usr_abc"]) expect(() => portalToken(url)).toThrow()
    })
})
