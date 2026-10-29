import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ use: vi.fn(), eject: vi.fn(), header: "none" }))
vi.mock("@nandobfer/perfix/react", () => ({ getViewAsHeaderValue: () => mocks.header }))
vi.mock("@/core/utils/api", () => ({ default: { interceptors: { request: { use: mocks.use, eject: mocks.eject } } } }))
import { installViewAsTransport } from "@/features/perfix/transport"
const originalFetch = window.fetch
let cleanup: (() => void) | undefined
beforeEach(() => { mocks.header = "tab-marker"; window.fetch = vi.fn().mockResolvedValue(new Response()) })
afterEach(() => { cleanup?.(); window.fetch = originalFetch })
describe("Transporte de impersonação por aba", () => {
    it("anexa o cabeçalho em APIs/RSC same-origin e remove o interceptor ao desmontar", async () => {
        const fetch = window.fetch
        cleanup = installViewAsTransport()
        await window.fetch("/api/me", { credentials: "same-origin" })
        const request = vi.mocked(fetch).mock.calls[0][0] as Request
        expect(request.headers.get("x-perfix-view-as")).toBe("tab-marker")
        expect(request.credentials).toBe("same-origin")
        cleanup()
        expect(window.fetch).toBe(fetch)
        expect(mocks.eject).toHaveBeenCalled()
    })
    it("não transmite identidade para serviços externos", async () => {
        const fetch = window.fetch
        cleanup = installViewAsTransport()
        await window.fetch("https://example.com/provider")
        expect(fetch).toHaveBeenCalledWith("https://example.com/provider", undefined)
    })
    it("mantém o override none para sair de uma simulação inválida", async () => {
        const fetch = window.fetch
        cleanup = installViewAsTransport()
        await window.fetch("/api/perfix/view-as", { headers: { "x-perfix-view-as": "none" } })
        expect((vi.mocked(fetch).mock.calls[0][0] as Request).headers.get("x-perfix-view-as")).toBe("none")
    })
})
