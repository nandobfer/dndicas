import { beforeEach, describe, expect, it, vi } from "vitest"

process.env.AUTH_SECRET ||= "segredo-de-teste-do-maddox"

const runMaddoxTool = vi.fn(async (_tool: { name: string }, _context: unknown, input: unknown) => ({ saved: true, input }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/master-tools", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/master-tools")>()), runMaddoxTool }))

const { createMaddoxTurnToken, verifyMaddoxTurnToken } = await import("@/features/maddox/server/master-turn-token")
const { enqueueMaddoxJob, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const route = await import("@/app/api/maddox/mcp/route")
const publicRoute = await import("@/app/api/mcp/route")

const CAMPAIGN = "6a0000000000000000000001"

async function rpc(handler: (request: Request) => Promise<Response>, method: string, params: Record<string, unknown> = {}) {
    const res = await handler(
        new Request("http://localhost/api/maddox/mcp", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
    )
    const text = await res.text()
    const data = text.includes("data:") ? text.split("\n").find((line) => line.startsWith("data:"))!.slice(5) : text
    return JSON.parse(data) as { result?: { tools?: { name: string; inputSchema: { properties: Record<string, unknown> } }[]; isError?: boolean; structuredContent?: Record<string, unknown> } }
}

/** Mantém um job da campanha rodando enquanto o teste chama o MCP. */
async function withActiveJob(test: (jobId: string) => Promise<void>) {
    let release!: () => void
    const hold = new Promise<void>((resolve) => (release = resolve))
    let jobId = ""
    const started = new Promise<void>((resolve) => {
        void enqueueMaddoxJob(CAMPAIGN, "teste", async (job) => {
            jobId = job.jobId
            resolve()
            await hold
        })
    })
    await started
    try {
        await test(jobId)
    } finally {
        release()
        await waitForCampaignIdle(CAMPAIGN)
    }
}

describe("token de turno do MCP do Maddox", () => {
    it("assinado, com validade e à prova de adulteração", () => {
        const token = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId: "j1", turnNumber: 3 }, 1_000)
        expect(verifyMaddoxTurnToken(token, 2_000)).toMatchObject({ campaignId: CAMPAIGN, jobId: "j1", turnNumber: 3 })
        expect(verifyMaddoxTurnToken(token, 1_000 + 21 * 60 * 1000)).toBeNull()
        const [payload, signature] = token.split(".")
        const forged = Buffer.from(JSON.stringify({ campaignId: "outra", jobId: "j1", turnNumber: 3, exp: 9e15 })).toString("base64url")
        expect(verifyMaddoxTurnToken(`${forged}.${signature}`)).toBeNull()
        expect(verifyMaddoxTurnToken(`${payload}.x${signature}`)).toBeNull()
        expect(verifyMaddoxTurnToken("lixo")).toBeNull()
    })
})

describe("MCP do Maddox (/api/maddox/mcp)", () => {
    beforeEach(() => runMaddoxTool.mockClear())

    it("lista as ferramentas do narrador, todas exigindo `turno`; o MCP público não as expõe", async () => {
        const list = await rpc(route.POST, "tools/list")
        const names = list.result!.tools!.map((tool) => tool.name)
        expect(names).toEqual(expect.arrayContaining(["save_npc", "save_memory", "update_campaign_state", "update_character_state", "get_campaign_state"]))
        for (const tool of list.result!.tools!) expect(tool.inputSchema.properties).toHaveProperty("turno")
        const publicList = await rpc(publicRoute.POST, "tools/list")
        expect(publicList.result!.tools!.map((tool) => tool.name)).not.toContain("save_npc")
    })

    it("token válido de uma geração ativa grava na campanha do token", async () => {
        await withActiveJob(async (jobId) => {
            const turno = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId, turnNumber: 4 })
            const result = await rpc(route.POST, "tools/call", { name: "save_npc", arguments: { turno, name: "Bartolomeu" } })
            expect(result.result!.isError).toBeFalsy()
            expect(runMaddoxTool).toHaveBeenCalledTimes(1)
            const [tool, context, input] = runMaddoxTool.mock.calls[0]!
            expect(tool.name).toBe("save_npc")
            expect(String((context as { campaignId: unknown }).campaignId)).toBe(CAMPAIGN)
            expect(context).toMatchObject({ turnNumber: 4 })
            expect(input).toEqual({ name: "Bartolomeu" })
        })
    })

    it("token inválido, adulterado ou de geração encerrada é recusado sem gravar", async () => {
        const bad = await rpc(route.POST, "tools/call", { name: "save_npc", arguments: { turno: "lixo", name: "X" } })
        expect(bad.result).toMatchObject({ isError: true })
        const ended = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId: "job-que-acabou", turnNumber: 1 })
        const late = await rpc(route.POST, "tools/call", { name: "save_npc", arguments: { turno: ended, name: "X" } })
        expect(late.result).toMatchObject({ isError: true })
        expect(JSON.stringify(late.result)).toContain("só funcionam durante a geração")
        expect(runMaddoxTool).not.toHaveBeenCalled()
    })
})
