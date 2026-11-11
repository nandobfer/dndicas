import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * DND-49: a preparação da mesa e o pedido de ajuste rodam com as ferramentas de catálogo — na AI SDK elas entram na
 * chamada (e cada leitura vai ao registro da execução); no OpenCode, pelo MCP do Maddox com o token de catálogo.
 * Nunca há rede: a SDK `ai`, o narrador e o OpenCode são mockados.
 */

process.env.AUTH_SECRET ||= "segredo-de-teste-do-maddox"

const narrator = { provider: "openai" as string }
const generateText = vi.fn()
const generateAiText = vi.fn(async () => ({ text: '{"sheetChanges":[]}', usage: null, durationMs: 1 }))
const ensureMaddoxMcp = vi.fn(async () => undefined)
const getCatalogEntity = vi.fn(async () => ({ name: "Adaga", description: "Arma simples. Dano 1d4 perfurante." }))

vi.mock("ai", () => ({ generateText, stepCountIs: (count: number) => ({ count }), dynamicTool: (def: Record<string, unknown>) => def }))
vi.mock("@/lib/ai/stream", () => ({
    generateAiText,
    prepareModel: vi.fn(async () => ({ model: "modelo", providerOptions: {}, reasoning: null, dispose: async () => undefined })),
    samplingOptions: () => ({}),
    describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock("@/lib/ai/consumption", () => ({ recordAiConsumption: vi.fn(async () => undefined) }))
vi.mock("@/lib/ai/step-cost", () => ({ stepCostUsd: () => null }))
vi.mock("@/features/maddox/server/narrator", () => ({
    loadNarrator: vi.fn(async () => ({ settings: (await import("@/features/maddox/schemas")).DEFAULT_MADDOX_SETTINGS, model: { provider: narrator.provider, model: "m", agent: null, variant: null, temperature: null, maxOutputTokens: null } })),
}))
vi.mock("@/features/maddox/server/settings", async () => ({ loadMaddoxSettings: vi.fn(async () => ({ settings: (await import("@/features/maddox/schemas")).DEFAULT_MADDOX_SETTINGS, isDefault: true, updatedAt: null })) }))
vi.mock("@/features/maddox/server/opencode-mcp", () => ({ ensureMaddoxMcp }))
vi.mock("@/features/mcp/server/catalog-entity-service", () => ({ getCatalogEntity, searchCatalogEntities: vi.fn(async () => ({ items: [] })) }))

const ai = await import("@/features/maddox/server/combat-prep-ai")
const { createCatalogReadLog } = await import("@/features/maddox/server/catalog-reads")
const { verifyMaddoxCatalogToken } = await import("@/features/maddox/server/master-turn-token")

const campaign = { _id: "6a0000000000000000000001", name: "Mesa", rigor: "fiel-dnd" as const }
const input = (reads = createCatalogReadLog()) => ({ campaign, characterName: "Nala", sheetText: "## Ficha", optionsText: "- opção", sneakAttack: "1d6", reads, jobId: "job-1" })

beforeEach(() => {
    narrator.provider = "openai"
    generateText.mockReset()
    generateAiText.mockClear()
    ensureMaddoxMcp.mockClear()
})

describe("DND-49 — preparação com as ferramentas de catálogo", () => {
    it("AI SDK: a revisão recebe search_catalog e get_catalog_entity, as instruções exigem a fonte e cada leitura entra no registro", async () => {
        const reads = createCatalogReadLog()
        generateText.mockImplementation(async (request: { tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>; instructions: string }) => {
            await request.tools.get_catalog_entity!.execute({ tipo: "Item", id: "69af29565ba7ae07cb540466" })
            return { steps: [{ text: "Vou consultar.", providerMetadata: null }, { text: '{"sheetChanges":[],"modify":[]}', providerMetadata: null }], text: '{"sheetChanges":[],"modify":[]}', totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
        })
        const raw = await ai.reviewCombatSheet(input(reads))
        expect(raw).toEqual({ sheetChanges: [], modify: [] })
        const request = generateText.mock.calls[0]![0] as { tools: Record<string, unknown>; instructions: string; stopWhen: { count: number } }
        expect(Object.keys(request.tools).sort()).toEqual(["get_catalog_entity", "search_catalog"])
        expect(request.instructions).toContain("Fonte das regras (obrigatória)")
        expect(request.instructions).toContain('"source":{"ref":"Tipo:id da entidade lida","quote":"trecho exato do texto dela"}')
        expect(request.stopWhen.count).toBeGreaterThan(1)
        expect(reads.refs).toEqual(["Item:69af29565ba7ae07cb540466"])
        expect(generateAiText).not.toHaveBeenCalled()
    })

    it("AI SDK: a consulta que falha conta como falha no registro (o que dependia dela é recusado)", async () => {
        const reads = createCatalogReadLog()
        getCatalogEntity.mockRejectedValueOnce(new Error("banco fora"))
        generateText.mockImplementation(async (request: { tools: Record<string, { execute: (input: unknown) => Promise<unknown> }> }) => {
            await request.tools.get_catalog_entity!.execute({ tipo: "Item", id: "x" }).catch(() => undefined)
            return { steps: [{ text: "{}", providerMetadata: null }], text: "{}", totalUsage: {} }
        })
        await ai.reviewCombatSheet(input(reads))
        expect(reads.failures).toBe(1)
        expect(reads.refs).toEqual([])
    })

    it("OpenCode: confere o MCP e manda o token de catálogo (desta campanha, deste job) nas instruções do ajuste", async () => {
        narrator.provider = "opencode"
        generateAiText.mockResolvedValueOnce({ text: '{"decision":"refuse","reason":"Não existe no catálogo."}', usage: null, durationMs: 1 })
        const raw = await ai.reviewAdjustment({ ...input(), optionText: "Adaga", request: "dano 2d6", previous: "" })
        expect(raw).toMatchObject({ decision: "refuse" })
        expect(ensureMaddoxMcp).toHaveBeenCalledTimes(1)
        const request = (generateAiText.mock.calls[0] as unknown as [{ instructions: string; provider: string }])[0]
        expect(request.provider).toBe("opencode")
        expect(request.instructions).toContain("dndicas-maddox")
        expect(request.instructions).toContain("Se a regra que o jogador cita bate com o catálogo, aceite com a fonte")
        const token = /`turno` exatamente com este valor: `([^`]+)`/.exec(request.instructions)![1]
        expect(verifyMaddoxCatalogToken(token)).toMatchObject({ campaignId: campaign._id, jobId: "job-1" })
        expect(generateText).not.toHaveBeenCalled()
    })
})
