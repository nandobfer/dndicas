import { beforeEach, describe, expect, it, vi } from "vitest"

process.env.AUTH_SECRET ||= "segredo-de-teste-do-maddox"

const runMaddoxTool = vi.fn(async (_tool: { name: string }, _context: unknown, input: unknown) => ({ saved: true, input }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/master-tools", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/master-tools")>()), runMaddoxTool }))
const runInterviewTool = vi.fn(async (_tool: { name: string }, _context: unknown, input: unknown) => ({ ok: true, input }))
vi.mock("@/features/maddox/server/interview-tools", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/interview-tools")>()), runInterviewTool }))

const runCatalogTool = vi.fn(async (_tool: { name: string }, input: unknown) => ({ itens: [], input }))
vi.mock("@/features/maddox/server/catalog-tools", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/maddox/server/catalog-tools")>()), runCatalogTool }))

const { createMaddoxTurnToken, verifyMaddoxTurnToken, createMaddoxInterviewToken, verifyMaddoxInterviewToken } = await import("@/features/maddox/server/master-turn-token")
const { enqueueMaddoxJob, waitForCampaignIdle } = await import("@/features/maddox/server/game-live")
const route = await import("@/app/api/maddox/mcp/route")
const publicRoute = await import("@/app/api/mcp/route")
const { MaddoxInterviewModel } = await import("@/features/maddox/models")

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
        expect(names).toEqual(expect.arrayContaining(["save_npc", "save_memory", "update_campaign_state", "update_character_state", "get_campaign_state", "request_check"]))
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

    it("request_check pelo MCP recebe o job da geração (os testes ficam nele até a narração ser gravada)", async () => {
        await withActiveJob(async (jobId) => {
            const turno = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId, turnNumber: 2 })
            const result = await rpc(route.POST, "tools/call", { name: "request_check", arguments: { turno, personagem: "Lyra", tipo: "pericia", pericia: "Furtividade", cd: 15, motivo: "Passar pelos guardas" } })
            expect(result.result!.isError).toBeFalsy()
            const [tool, context, input] = runMaddoxTool.mock.calls[0]!
            expect(tool.name).toBe("request_check")
            expect(context).toMatchObject({ turnNumber: 2, jobId })
            expect(input).toMatchObject({ personagem: "Lyra", cd: 15 })
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

describe("ferramentas da entrevista no MCP do Maddox (Maddox 5)", () => {
    const INTERVIEW = "6a00000000000000000000aa"
    beforeEach(() => {
        runInterviewTool.mockClear()
        runMaddoxTool.mockClear()
    })

    it("as três ferramentas de atributos estão no mesmo MCP, exigindo `turno`", async () => {
        const list = await rpc(route.POST, "tools/list")
        const tools = list.result!.tools!.filter((tool) => ["request_ability_scores", "get_ability_scores", "apply_ability_bonus"].includes(tool.name))
        expect(tools).toHaveLength(3)
        for (const tool of tools) expect(tool.inputSchema.properties).toHaveProperty("turno")
    })

    it("as ferramentas da ficha (escolhas e card de PV) também estão no MCP, com o esquema de entrada e `turno`", async () => {
        const list = await rpc(route.POST, "tools/list")
        const tools = Object.fromEntries(list.result!.tools!.map((tool) => [tool.name, tool]))
        for (const name of ["update_character_build", "get_character_build", "request_hit_points"]) {
            expect(tools[name], name).toBeDefined()
            expect(tools[name]!.inputSchema.properties).toHaveProperty("turno")
        }
        expect(tools.update_character_build!.inputSchema.properties).toHaveProperty("periciasClasse")
        expect(tools.update_character_build!.inputSchema.properties).toHaveProperty("equipamento")
        const turno = createMaddoxInterviewToken({ interviewId: INTERVIEW, lockToken: "trava-2" })
        const result = await rpc(route.POST, "tools/call", { name: "update_character_build", arguments: { turno, raca: "Humano" } })
        expect(result.result!.isError).toBeFalsy()
        expect(runInterviewTool).toHaveBeenCalledWith(expect.objectContaining({ name: "update_character_build" }), expect.objectContaining({ lockToken: "trava-2" }), { raca: "Humano" })
        // Token do narrador não grava a ficha.
        const narrador = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId: "j1", turnNumber: 1 })
        runInterviewTool.mockClear()
        const refused = await rpc(route.POST, "tools/call", { name: "update_character_build", arguments: { turno: narrador, raca: "Humano" } })
        expect(refused.result!.isError).toBe(true)
        expect(runInterviewTool).not.toHaveBeenCalled()
    })

    it("token de entrevista chega à ferramenta com a entrevista e a trava do token", async () => {
        const turno = createMaddoxInterviewToken({ interviewId: INTERVIEW, lockToken: "trava-1" })
        const result = await rpc(route.POST, "tools/call", { name: "get_ability_scores", arguments: { turno } })
        expect(result.result!.isError).toBeFalsy()
        expect(runInterviewTool).toHaveBeenCalledWith(expect.objectContaining({ name: "get_ability_scores" }), expect.objectContaining({ lockToken: "trava-1" }), {})
        expect(String((runInterviewTool.mock.calls[0]![1] as { interviewId: unknown }).interviewId)).toBe(INTERVIEW)
    })

    it("token do narrador não serve na entrevista, e o da entrevista não serve no narrador", async () => {
        const narrador = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId: "j1", turnNumber: 1 })
        const entrevista = createMaddoxInterviewToken({ interviewId: INTERVIEW, lockToken: "trava-1" })
        expect(verifyMaddoxInterviewToken(narrador)).toBeNull()
        expect(verifyMaddoxTurnToken(entrevista)).toBeNull()
        const asInterview = await rpc(route.POST, "tools/call", { name: "get_ability_scores", arguments: { turno: narrador } })
        expect(asInterview.result!.isError).toBe(true)
        const asNarrator = await rpc(route.POST, "tools/call", { name: "get_campaign_state", arguments: { turno: entrevista } })
        expect(asNarrator.result!.isError).toBe(true)
        expect(runInterviewTool).not.toHaveBeenCalled()
        expect(runMaddoxTool).not.toHaveBeenCalled()
    })
})

describe("consulta ao catálogo no MCP do Maddox", () => {
    const INTERVIEW = "6a00000000000000000000bb"
    beforeEach(() => {
        runCatalogTool.mockClear()
        runMaddoxTool.mockClear()
        runInterviewTool.mockClear()
        vi.restoreAllMocks()
    })

    it("search_catalog e get_catalog_entity aparecem uma vez cada, só leitura e exigindo `turno`", async () => {
        const list = await rpc(route.POST, "tools/list")
        const tools = list.result!.tools!.filter((tool) => ["search_catalog", "get_catalog_entity"].includes(tool.name))
        expect(tools.map((tool) => tool.name).sort()).toEqual(["get_catalog_entity", "search_catalog"])
        for (const tool of tools) expect(tool.inputSchema.properties).toHaveProperty("turno")
        expect((tools as unknown as { annotations?: { readOnlyHint?: boolean } }[]).every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
    })

    it("funciona com o token do narrador de uma geração ativa", async () => {
        await withActiveJob(async (jobId) => {
            const turno = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId, turnNumber: 3 })
            const result = await rpc(route.POST, "tools/call", { name: "search_catalog", arguments: { turno, tipos: ["Magia"], consulta: "bola de fogo" } })
            expect(result.result!.isError).toBeFalsy()
            expect(runCatalogTool).toHaveBeenCalledWith(expect.objectContaining({ name: "search_catalog" }), { tipos: ["Magia"], consulta: "bola de fogo" })
        })
    })

    it("funciona com o token da entrevista enquanto a geração dela roda (trava do token)", async () => {
        const exists = vi.spyOn(MaddoxInterviewModel, "exists").mockResolvedValue({ _id: INTERVIEW } as never)
        const turno = createMaddoxInterviewToken({ interviewId: INTERVIEW, lockToken: "trava-9" })
        const result = await rpc(route.POST, "tools/call", { name: "search_catalog", arguments: { turno, tipos: ["Origem"] } })
        expect(result.result!.isError).toBeFalsy()
        expect(exists).toHaveBeenCalledWith({ _id: INTERVIEW, "generating.token": "trava-9" })
        expect(runCatalogTool).toHaveBeenCalledTimes(1)
    })

    it("token inválido, de narração encerrada ou de entrevista que já respondeu é recusado sem consultar", async () => {
        const bad = await rpc(route.POST, "tools/call", { name: "search_catalog", arguments: { turno: "lixo", tipos: ["Origem"] } })
        expect(bad.result).toMatchObject({ isError: true })
        const ended = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId: "job-que-acabou", turnNumber: 1 })
        const late = await rpc(route.POST, "tools/call", { name: "search_catalog", arguments: { turno: ended, tipos: ["Origem"] } })
        expect(JSON.stringify(late.result)).toContain("só funcionam durante a geração")
        vi.spyOn(MaddoxInterviewModel, "exists").mockResolvedValue(null as never)
        const done = await rpc(route.POST, "tools/call", { name: "get_catalog_entity", arguments: { turno: createMaddoxInterviewToken({ interviewId: INTERVIEW, lockToken: "velha" }), tipo: "Origem", id: "x" } })
        expect(done.result).toMatchObject({ isError: true })
        expect(runCatalogTool).not.toHaveBeenCalled()
    })

    it("as ferramentas que gravam continuam recusando o token do outro tipo", async () => {
        const entrevista = createMaddoxInterviewToken({ interviewId: INTERVIEW, lockToken: "trava-1" })
        const asNarrator = await rpc(route.POST, "tools/call", { name: "save_npc", arguments: { turno: entrevista, name: "X" } })
        expect(asNarrator.result!.isError).toBe(true)
        const narrador = createMaddoxTurnToken({ campaignId: CAMPAIGN, jobId: "j1", turnNumber: 1 })
        const asInterview = await rpc(route.POST, "tools/call", { name: "apply_ability_bonus", arguments: { turno: narrador, antecedente: "Soldado", bonus: { "Força": 2, "Constituição": 1 } } })
        expect(asInterview.result!.isError).toBe(true)
        expect(runMaddoxTool).not.toHaveBeenCalled()
        expect(runInterviewTool).not.toHaveBeenCalled()
    })
})
