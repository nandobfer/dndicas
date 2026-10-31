import { beforeEach, describe, expect, it, vi } from "vitest"

type Server = { name: string; status: { status: string; error?: string } }
const servers: Server[] = []
const opencode = {
    mcp: {
        list: vi.fn<(input?: unknown) => Promise<{ location: object; data: Server[] }>>(async () => ({ location: {}, data: [...servers] })),
        add: vi.fn(async (input: { server: string }) => void servers.push({ name: input.server, status: { status: "pending" } })),
        connect: vi.fn<(input: unknown) => Promise<void>>(async () => {
            for (const server of servers) server.status = { status: "connected" }
        }),
    },
}
vi.mock("@/lib/ai/opencode-client", () => ({ getOpencodeClient: vi.fn(async () => opencode) }))
vi.mock("@/lib/ai/opencode", () => ({ getOpencodeConnection: vi.fn(async () => ({ baseUrl: "http://oc", headers: {}, directory: "/srv/maddox" })) }))

const { ensureMaddoxMcp, maddoxMcpStatus, maddoxMcpUrl } = await import("@/features/maddox/server/opencode-mcp")

const settings = (mcpUrl: string | null = null) => ({ opencode: { sessionScope: "campaign" as const, deleteOnCampaignEnd: true, directory: null, mcpUrl } })

beforeEach(() => {
    servers.length = 0
    Object.values(opencode.mcp).forEach((fn) => fn.mockClear())
    ;(globalThis as { __maddoxMcpReady?: unknown }).__maddoxMcpReady = null
    process.env.NEXT_PUBLIC_APP_URL = "https://dndicas.example/"
})

describe("MCP do Maddox no OpenCode", () => {
    it("URL: a configurada ou a do app + /api/maddox/mcp", () => {
        expect(maddoxMcpUrl(settings())).toBe("https://dndicas.example/api/maddox/mcp")
        expect(maddoxMcpUrl(settings("https://outro/mcp"))).toBe("https://outro/mcp")
    })

    it("consultar não registra; registrar adiciona no diretório das sessões e conecta", async () => {
        expect(await maddoxMcpStatus(settings())).toMatchObject({ status: "missing" })
        expect(opencode.mcp.add).not.toHaveBeenCalled()
        expect(await maddoxMcpStatus(settings(), true)).toMatchObject({ status: "connected", url: "https://dndicas.example/api/maddox/mcp" })
        expect(opencode.mcp.add).toHaveBeenCalledWith({ server: "dndicas-maddox", location: { directory: "/srv/maddox" }, config: { type: "remote", url: "https://dndicas.example/api/maddox/mcp", oauth: false } })
    })

    it("antes de narrar: conecta se faltar, guarda em cache e responde 409 quando não conecta", async () => {
        await ensureMaddoxMcp(settings())
        await ensureMaddoxMcp(settings())
        expect(opencode.mcp.list.mock.calls.length).toBeLessThanOrEqual(3)
        const calls = opencode.mcp.list.mock.calls.length
        await ensureMaddoxMcp(settings())
        expect(opencode.mcp.list.mock.calls.length).toBe(calls)

        ;(globalThis as { __maddoxMcpReady?: unknown }).__maddoxMcpReady = null
        servers.length = 0
        servers.push({ name: "dndicas-maddox", status: { status: "failed", error: "connection refused" } })
        opencode.mcp.connect.mockImplementationOnce(async () => undefined)
        await expect(ensureMaddoxMcp(settings())).rejects.toMatchObject({ status: 409, code: "MADDOX_UNAVAILABLE", message: expect.stringContaining("connection refused") })
    })

    it("OpenCode fora do ar vira situação `unknown`, sem lançar", async () => {
        opencode.mcp.list.mockRejectedValueOnce(new Error("ECONNREFUSED"))
        expect(await maddoxMcpStatus(settings())).toMatchObject({ status: "unknown", error: "ECONNREFUSED" })
    })
})
