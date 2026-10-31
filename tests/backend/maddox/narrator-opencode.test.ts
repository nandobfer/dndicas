import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

/** Narrador com o OpenCode: sem ferramentas da AI SDK, MCP conferido antes, sessão `narrator` e token de turno. */

process.env.AUTH_SECRET ||= "segredo-de-teste-do-maddox"

const requests: Record<string, unknown>[] = []
const ensureMaddoxMcp = vi.fn(async () => undefined)
const ensureMaddoxSession = vi.fn<(input: Record<string, unknown>) => Promise<string>>(async () => "ses_narrador")

vi.mock("@/features/maddox/server/settings", () => ({
    loadMaddoxSettings: vi.fn(async () => ({
        settings: {
            enabled: true,
            main: { provider: "opencode", model: "anthropic/claude", agent: "maddox", variant: null, temperature: null, maxOutputTokens: null },
            instructions: "Você é Maddox.",
            avatar: { url: null },
            opencode: { sessionScope: "campaign", deleteOnCampaignEnd: true, directory: null, mcpUrl: null },
            jev: {},
        },
        isDefault: false,
        updatedAt: null,
    })),
}))
vi.mock("@/features/ai/server/settings", () => ({ availability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock("@/features/ai/server/agent-memory-service", () => ({ agentMemoryTexts: vi.fn(async () => []) }))
vi.mock("@/features/maddox/server/opencode-mcp", () => ({ ensureMaddoxMcp }))
vi.mock("@/features/maddox/server/opencode-sessions", () => ({ ensureMaddoxSession }))
vi.mock("@/lib/ai/stream", () => ({
    streamAi: async function* (request: Record<string, unknown>) {
        requests.push(request)
        yield { type: "tool", id: "t1", name: "dndicas-maddox_save_npc", state: "running" }
        yield { type: "tool", id: "t1", name: "dndicas-maddox_save_npc", state: "done" }
        yield { type: "delta", text: "A névoa " }
        yield { type: "delta", text: "sobe." }
        yield { type: "done", finishReason: "stop", usage: {}, durationMs: 1 }
    },
}))

const { MaddoxCampaignModel } = await import("@/features/maddox/models")
const { aiMaddoxMaster } = await import("@/features/maddox/server/narrator")
const { verifyMaddoxTurnToken } = await import("@/features/maddox/server/master-turn-token")

let mongo: MongoMemoryServer

beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri(), { dbName: "maddox_narrator_opencode_test" })
}, 180_000)

afterAll(async () => {
    await mongoose.disconnect()
    await mongo?.stop()
}, 30_000)

beforeEach(() => {
    requests.length = 0
    ensureMaddoxMcp.mockClear()
    ensureMaddoxSession.mockClear()
})

describe("Maddox narrador no OpenCode", () => {
    it("confere o MCP, usa a sessão do narrador e passa o token de turno nas instruções; o texto chega ao vivo", async () => {
        const campaign = await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo", setting: "Porto." })
        const deltas: string[] = []
        const tools: boolean[] = []
        const content = await aiMaddoxMaster.narrate({ campaignId: String(campaign._id), jobId: "job-1", turnNumber: 1, declarations: [] }, { delta: (text) => deltas.push(text), tool: (running) => tools.push(running) })
        expect(content).toBe("A névoa sobe.")
        expect(deltas.join("")).toBe("A névoa sobe.")
        expect(tools.slice(0, 2)).toEqual([true, false])
        expect(tools.at(-1)).toBe(false)
        expect(ensureMaddoxMcp).toHaveBeenCalledTimes(1)
        expect(ensureMaddoxSession).toHaveBeenCalledWith(expect.objectContaining({ campaignId: String(campaign._id), purpose: "narrator", agent: "maddox" }))
        const request = requests[0]!
        expect(request).toMatchObject({ provider: "opencode", opencodeSessionId: "ses_narrador", consumption: { origin: "maddox-narration", subject: String(campaign._id) } })
        expect(request).not.toHaveProperty("tools")
        const token = /exatamente com este valor: `([^`]+)`/.exec(String(request.instructions))?.[1]
        expect(verifyMaddoxTurnToken(token)).toMatchObject({ campaignId: String(campaign._id), jobId: "job-1", turnNumber: 1 })
        expect(String(request.prompt)).toContain("Abertura da campanha")
    })

    it("MCP indisponível impede a narração (o motor marca a falha e tenta de novo depois)", async () => {
        const campaign = await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" })
        const { DomainError } = await import("@/lib/api/route")
        ensureMaddoxMcp.mockRejectedValueOnce(new DomainError(409, "O MCP do Maddox não está conectado no OpenCode.", "MADDOX_UNAVAILABLE"))
        await expect(aiMaddoxMaster.narrate({ campaignId: String(campaign._id), jobId: "job-2", turnNumber: 1, declarations: [] }, { delta: () => undefined, tool: () => undefined })).rejects.toMatchObject({ code: "MADDOX_UNAVAILABLE" })
        expect(requests).toHaveLength(0)
    })

    it("geração abortada pelo teto de duração nunca devolve o texto parcial como narração", async () => {
        const campaign = await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" })
        const controller = new AbortController()
        controller.abort()
        await expect(aiMaddoxMaster.narrate({ campaignId: String(campaign._id), jobId: "job-3", turnNumber: 1, declarations: [], signal: controller.signal }, { delta: () => undefined, tool: () => undefined })).rejects.toThrow("O Maddox demorou demais para responder.")
        expect(requests[0]).toMatchObject({ signal: controller.signal })
    })
})
