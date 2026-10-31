import { beforeEach, describe, expect, it, vi } from "vitest"

const store = new Map<string, { feature: string; settings: Record<string, unknown>; updatedAt: Date; updatedBy: string }>()
const recordAudit = vi.fn<(entry: { acao: string }) => Promise<void>>(async () => undefined)
const statuses = vi.fn(async () => [
    { id: "opencode", configured: true, connected: true },
    { id: "gemini", configured: true, connected: true },
    { id: "anthropic", configured: true, connected: false },
])
const listAiModels = vi.fn(async (provider: string) => (provider === "opencode" ? [{ id: "anthropic/claude", name: "Claude", variants: ["high"] }] : [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", variants: [] }]))
const listAiAgents = vi.fn(async () => [{ id: "build", name: "build" }])

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR", ATUALIZAR: "ATUALIZAR", EXCLUIR: "EXCLUIR" } }))
vi.mock("@/lib/db/models/Ai", () => ({
    AiFeatureSetting: {
        findOne: ({ feature }: { feature: string }) => ({ lean: async () => store.get(feature) ?? null }),
        updateOne: async ({ feature }: { feature: string }, update: { $set: { settings: Record<string, unknown>; updatedAt: Date; updatedBy: string } }) => {
            store.set(feature, { feature, ...update.$set })
        },
    },
}))
vi.mock("@/lib/ai/catalog", () => ({ getAiProviderStatuses: statuses, listAiModels, listAiAgents, listAiImageModels: vi.fn(async () => []) }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn(async () => undefined) }))
vi.mock("@/features/maddox/server/scripts", () => ({ getAllMaddoxScripts: vi.fn(async () => ({ scenario: { current: { version: 0 }, history: [] }, character: { current: { version: 0 }, history: [] } })) }))

const { getMaddoxSettings, saveMaddoxSettings, normalizeMaddoxSettings, withMaddoxDefaults } = await import("@/features/maddox/server/settings")
const { DEFAULT_MADDOX_SETTINGS, maddoxSettingsSchema } = await import("@/features/maddox/schemas")
type Settings = typeof DEFAULT_MADDOX_SETTINGS

const configured = (patch: Partial<Settings> = {}): Settings => ({
    ...DEFAULT_MADDOX_SETTINGS,
    enabled: true,
    main: { provider: "opencode", model: "anthropic/claude", agent: "build", variant: "high", temperature: 0.7, maxOutputTokens: 4096 },
    interviewer: { provider: "gemini", model: "gemini-2.5-pro", agent: "build", variant: null },
    avatar: { url: "/api/files/ai/generated/u/maddox.png", persona: "Mestre ancião" },
    opencode: { sessionScope: "campaign", deleteOnCampaignEnd: false, directory: "  /srv/maddox  ", mcpUrl: null },
    jev: { ...DEFAULT_MADDOX_SETTINGS.jev, "question-or-action": true, "scene-image": true },
    ...patch,
})

describe("configuração do Agente Maddox", () => {
    beforeEach(() => {
        store.clear()
        recordAudit.mockClear()
    })

    it("sem nada salvo devolve o padrão (desativado, com o motivo)", async () => {
        const dto = await getMaddoxSettings()
        expect(dto.isDefault).toBe(true)
        expect(dto.settings).toEqual(DEFAULT_MADDOX_SETTINGS)
        expect(dto.availability.available).toBe(false)
        expect(dto.availability.reason).toMatch(/Agente Maddox/)
    })

    it("salvar e recarregar devolve os mesmos valores, com OpenCode e agente", async () => {
        await saveMaddoxSettings(configured(), "admin-1")
        const reloaded = await getMaddoxSettings()
        expect(reloaded.isDefault).toBe(false)
        // OpenCode não tem amostragem: temperatura e tokens ficam vazios; o diretório é aparado.
        expect(reloaded.settings.main).toEqual({ provider: "opencode", model: "anthropic/claude", agent: "build", variant: "high", temperature: null, maxOutputTokens: null })
        // Agente só vale no OpenCode.
        expect(reloaded.settings.interviewer).toEqual({ provider: "gemini", model: "gemini-2.5-pro", agent: null, variant: null })
        expect(reloaded.settings.avatar).toEqual({ url: "/api/files/ai/generated/u/maddox.png", persona: "Mestre ancião" })
        expect(reloaded.settings.opencode).toEqual({ sessionScope: "campaign", deleteOnCampaignEnd: false, directory: "/srv/maddox", mcpUrl: null })
        expect(reloaded.settings.jev["question-or-action"]).toBe(true)
        expect(reloaded.settings.jev["requires-check"]).toBe(false)
        expect(reloaded.availability.available).toBe(true)
    })

    it("audita a criação e depois a atualização", async () => {
        await saveMaddoxSettings(configured(), "admin-1")
        await saveMaddoxSettings(configured({ main: { provider: "gemini", model: "gemini-2.5-pro", agent: null, variant: null, temperature: 0.5, maxOutputTokens: 2048 } }), "admin-1")
        expect(recordAudit.mock.calls.map(([entry]) => entry.acao)).toEqual(["CRIAR", "ATUALIZAR"])
        const reloaded = await getMaddoxSettings()
        expect(reloaded.settings.main).toMatchObject({ provider: "gemini", temperature: 0.5, maxOutputTokens: 2048 })
    })

    it("agente do OpenCode inexistente é recusado (400)", async () => {
        await expect(saveMaddoxSettings(configured({ main: { ...configured().main, agent: "fantasma" } }), "admin-1")).rejects.toMatchObject({ status: 400, code: "AI_AGENT_NOT_FOUND" })
        expect(store.size).toBe(0)
    })

    it("provedor desconectado com o Maddox ativo é recusado (409)", async () => {
        await expect(saveMaddoxSettings(configured({ main: { provider: "anthropic", model: "claude", agent: null, variant: null, temperature: null, maxOutputTokens: null } }), "admin-1")).rejects.toMatchObject({ status: 409 })
    })

    it("entrevistador sem provedor usa o do Maddox (gravado vazio)", () => {
        const next = normalizeMaddoxSettings(configured({ interviewer: { provider: null, model: "x", agent: "build", variant: "y" } }))
        expect(next.interviewer).toEqual({ provider: null, model: null, agent: null, variant: null })
    })

    it("configuração salva antes de um campo novo recebe o padrão dele", () => {
        const parsed = maddoxSettingsSchema.safeParse(withMaddoxDefaults({ enabled: false, jev: { "scene-image": true } }))
        expect(parsed.success).toBe(true)
        if (parsed.success) {
            expect(parsed.data.jev["scene-image"]).toBe(true)
            expect(parsed.data.opencode).toEqual(DEFAULT_MADDOX_SETTINGS.opencode)
        }
    })

    it("ativo exige provedor e modelo; entrevistador com provedor exige modelo", () => {
        const result = maddoxSettingsSchema.safeParse({ ...DEFAULT_MADDOX_SETTINGS, enabled: true, interviewer: { provider: "gemini", model: null, agent: null, variant: null } })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["main.provider", "main.model", "interviewer.model"]))
    })

    it("campos sem mensagem na tela têm erros em pt-BR (viram o aviso do Salvar)", async () => {
        const { firstHiddenFormError } = await import("@/features/maddox/form-errors")
        const cases: Array<[Partial<Settings>, string]> = [
            [{ avatar: { url: `/${"x".repeat(2001)}`, persona: "p" } }, "A URL do avatar é longa demais (até 2.000 caracteres)"],
            [{ main: { ...DEFAULT_MADDOX_SETTINGS.main, agent: "a".repeat(101) } }, "O nome do agente do OpenCode é longo demais (até 100 caracteres)"],
            [{ interviewer: { ...DEFAULT_MADDOX_SETTINGS.interviewer, variant: "v".repeat(51) } }, "O nome da variante é longo demais (até 50 caracteres)"],
            [{ opencode: { ...DEFAULT_MADDOX_SETTINGS.opencode, sessionScope: "global" as never } }, "Escolha como as sessões do OpenCode são criadas"],
        ]
        for (const [patch, message] of cases) {
            const result = maddoxSettingsSchema.safeParse({ ...DEFAULT_MADDOX_SETTINGS, ...patch })
            expect(result.success).toBe(false)
            if (result.success) continue
            const issue = result.error.issues[0]!
            expect(issue.message).toBe(message)
            // Mesmo formato que o react-hook-form entrega ao callback de erro.
            const nested = issue.path.reduceRight<unknown>((acc, key) => ({ [String(key)]: acc }), { message: issue.message, type: issue.code })
            expect(firstHiddenFormError(nested)).toBe(message)
        }
    })

    it("URL do MCP do Maddox: vazia usa a do app; preenchida precisa ser http(s)", () => {
        const parse = (mcpUrl: string | null) => maddoxSettingsSchema.safeParse({ ...DEFAULT_MADDOX_SETTINGS, opencode: { ...DEFAULT_MADDOX_SETTINGS.opencode, mcpUrl } })
        expect(parse(null).success).toBe(true)
        expect(parse("https://dndicas.example/api/maddox/mcp").success).toBe(true)
        const invalid = parse("dndicas.example/mcp")
        expect(invalid.success).toBe(false)
        if (!invalid.success) expect(invalid.error.issues[0]!.message).toBe("Informe uma URL começando com http:// ou https://")
    })
})

