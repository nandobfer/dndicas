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
    opencode: { deleteOnCampaignEnd: false, directory: "  /srv/maddox  ", mcpUrl: null },
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
        expect(reloaded.settings.opencode).toEqual({ deleteOnCampaignEnd: false, directory: "/srv/maddox", mcpUrl: null })
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

    it("imagens nas cenas (Maddox 10): configuração antiga recebe o bloco desligado e as situações novas, sem perder as gravadas", () => {
        const old = maddoxSettingsSchema.safeParse(withMaddoxDefaults({ enabled: false }))
        expect(old.success).toBe(true)
        if (old.success) {
            expect(old.data.sceneImages).toEqual(DEFAULT_MADDOX_SETTINGS.sceneImages)
            expect(old.data.sceneImages).toMatchObject({ enabled: false, minNarrationsBetween: 3, maxPerDay: 10, aspectRatio: "16:9", custom: [] })
            expect(Object.values(old.data.sceneImages.situations).every((value) => value === false)).toBe(true)
        }
        const partial = maddoxSettingsSchema.safeParse(withMaddoxDefaults({ enabled: false, sceneImages: { enabled: true, situations: { climax: true } } }))
        expect(partial.success).toBe(true)
        if (partial.success) expect(partial.data.sceneImages).toMatchObject({ enabled: true, maxPerDay: 10, situations: { climax: true, "new-location": false } })
    })

    it("retrato automático de NPC (DND-43): configuração sem o campo assume ligado; desligado gravado é mantido", () => {
        expect(DEFAULT_MADDOX_SETTINGS.sceneImages.autoPortraits).toBe(true)
        const old = maddoxSettingsSchema.safeParse(withMaddoxDefaults({ enabled: false, sceneImages: { enabled: true, situations: { "npc-portrait": true } } }))
        expect(old.success && old.data.sceneImages.autoPortraits).toBe(true)
        const off = maddoxSettingsSchema.safeParse(withMaddoxDefaults({ enabled: false, sceneImages: { enabled: true, autoPortraits: false } }))
        expect(off.success && off.data.sceneImages.autoPortraits).toBe(false)
    })

    it("imagens nas cenas: limites da frequência e situação personalizada exige nome e descrição", () => {
        const base = DEFAULT_MADDOX_SETTINGS.sceneImages
        const invalid = maddoxSettingsSchema.safeParse({
            ...DEFAULT_MADDOX_SETTINGS,
            sceneImages: { ...base, minNarrationsBetween: -1, maxPerDay: 0, custom: [{ id: "a", label: "", description: "", active: true }] },
        })
        expect(invalid.success).toBe(false)
        if (!invalid.success) {
            expect(invalid.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["sceneImages.minNarrationsBetween", "sceneImages.maxPerDay", "sceneImages.custom.0.label", "sceneImages.custom.0.description"]))
        }
        const duplicated = maddoxSettingsSchema.safeParse({ ...DEFAULT_MADDOX_SETTINGS, sceneImages: { ...base, custom: [{ id: "a", label: "A", description: "a", active: true }, { id: "a", label: "B", description: "b", active: true }] } })
        expect(duplicated.success).toBe(false)
        expect(normalizeMaddoxSettings(configured({ sceneImages: { ...base, style: "  óleo  " } })).sceneImages.style).toBe("óleo")
    })

    it("limite de NPCs Opex (DND-27): padrão sem limite (null), aceita 0 e positivos e recusa negativo ou fracionário", () => {
        expect(DEFAULT_MADDOX_SETTINGS.opexNpcLimit).toBeNull()
        const legacy = maddoxSettingsSchema.safeParse(withMaddoxDefaults({ enabled: false }))
        expect(legacy.success && legacy.data.opexNpcLimit).toBeNull()
        for (const value of [null, 0, 3]) expect(maddoxSettingsSchema.safeParse({ ...DEFAULT_MADDOX_SETTINGS, opexNpcLimit: value }).success).toBe(true)
        for (const value of [-1, 1.5]) {
            const result = maddoxSettingsSchema.safeParse({ ...DEFAULT_MADDOX_SETTINGS, opexNpcLimit: value })
            expect(result.success).toBe(false)
            if (!result.success) expect(result.error.issues[0]!.path).toEqual(["opexNpcLimit"])
        }
        expect(normalizeMaddoxSettings(configured({ opexNpcLimit: 2 })).opexNpcLimit).toBe(2)
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
            [{ opencode: { ...DEFAULT_MADDOX_SETTINGS.opencode, deleteOnCampaignEnd: "sim" as never } }, "Informe se as sessões são excluídas ao encerrar a campanha"],
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

    it("configuração antiga com sessionScope carrega sem o campo (sessões nunca compartilhadas)", () => {
        const legacy = { ...DEFAULT_MADDOX_SETTINGS, opencode: { ...DEFAULT_MADDOX_SETTINGS.opencode, sessionScope: "campaign" } }
        const result = maddoxSettingsSchema.safeParse(withMaddoxDefaults(legacy))
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.opencode).not.toHaveProperty("sessionScope")
    })

    it("URL do MCP do Maddox: vazia usa a do app; preenchida precisa ser http(s)", () => {
        const parse = (mcpUrl: string | null) => maddoxSettingsSchema.safeParse({ ...DEFAULT_MADDOX_SETTINGS, opencode: { ...DEFAULT_MADDOX_SETTINGS.opencode, mcpUrl } })
        expect(parse(null).success).toBe(true)
        expect(parse("https://dndicas.example/api/maddox/mcp").success).toBe(true)
        const invalid = parse("dndicas.example/mcp")
        expect(invalid.success).toBe(false)
        if (!invalid.success) expect(invalid.error.issues[0]!.message).toBe("Informe uma URL começando com http:// ou https://")
    })

    describe("modelo por rigor (DND-32)", () => {
        const block = (rigor: string, patch: Record<string, unknown> = {}) => ({ rigor, provider: "gemini", model: "gemini-2.5-pro", agent: null, variant: null, ...patch }) as never
        const withBlocks = (main: never[], interviewer: never[] = []) => configured({ rigorModels: { main, interviewer, opexCharacter: [] } })

        it("configuração antiga recebe as listas vazias sem perder o resto", () => {
            const legacy: Record<string, unknown> = { ...configured() }
            delete legacy.rigorModels
            const parsed = maddoxSettingsSchema.safeParse(withMaddoxDefaults(legacy))
            expect(parsed.success).toBe(true)
            if (parsed.success) {
                expect(parsed.data.rigorModels).toEqual({ main: [], interviewer: [], opexCharacter: [] })
                expect(parsed.data.main.model).toBe("anthropic/claude")
            }
        })

        it("salvar e recarregar devolve os blocos do narrador e do entrevistador, com agente e variante", async () => {
            await saveMaddoxSettings(withBlocks([block("rigoroso", { provider: "opencode", model: "anthropic/claude", agent: "build", variant: "high" })], [block("narrativo", { agent: "build" })]), "admin-1")
            const reloaded = await getMaddoxSettings()
            expect(reloaded.settings.rigorModels.main).toEqual([{ rigor: "rigoroso", provider: "opencode", model: "anthropic/claude", agent: "build", variant: "high" }])
            // Agente só vale no OpenCode.
            expect(reloaded.settings.rigorModels.interviewer).toEqual([{ rigor: "narrativo", provider: "gemini", model: "gemini-2.5-pro", agent: null, variant: null }])
            const audit = recordAudit.mock.calls.at(-1)![0] as unknown as { depois: { rigorModels: unknown } }
            expect(audit.depois.rigorModels).toEqual(reloaded.settings.rigorModels)
        })

        it("rigor repetido na mesma lista é recusado; o mesmo rigor no narrador e no entrevistador é aceito", () => {
            const repeated = maddoxSettingsSchema.safeParse(withBlocks([block("rigoroso"), block("rigoroso")]))
            expect(repeated.success).toBe(false)
            if (!repeated.success) expect(repeated.error.issues).toEqual([expect.objectContaining({ path: ["rigorModels", "main", 1, "rigor"], message: "Já existe uma configuração para o rigor Rigoroso" })])
            expect(maddoxSettingsSchema.safeParse(withBlocks([block("rigoroso")], [block("rigoroso")])).success).toBe(true)
        })

        it("bloco sem provedor ou modelo é recusado mesmo com o Maddox desativado; rigor fora dos níveis também", () => {
            const result = maddoxSettingsSchema.safeParse({ ...withBlocks([block("narrativo", { provider: null, model: null })]), enabled: false })
            expect(result.success).toBe(false)
            if (!result.success) expect(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)).toEqual(["rigorModels.main.0.provider: Selecione o provedor", "rigorModels.main.0.model: Selecione o modelo"])
            const invalid = maddoxSettingsSchema.safeParse(withBlocks([block("lendario")]))
            expect(invalid.success).toBe(false)
            if (!invalid.success) expect(invalid.error.issues[0]!.message).toBe("Escolha um grau de rigor válido")
        })

        it("modelo inexistente num bloco é recusado (400) e provedor do bloco desconectado com o Maddox ativo, 409", async () => {
            await expect(saveMaddoxSettings(withBlocks([block("flexivel", { model: "fantasma" })]), "admin-1")).rejects.toMatchObject({ status: 400, code: "AI_MODEL_NOT_FOUND" })
            await expect(saveMaddoxSettings(withBlocks([], [block("flexivel", { provider: "anthropic", model: "claude" })]), "admin-1")).rejects.toMatchObject({ status: 409, code: "AI_PROVIDER_DISCONNECTED" })
            expect(store.size).toBe(0)
        })

        it("erros dos blocos aparecem no próprio bloco (não viram o aviso do Salvar)", async () => {
            const { firstHiddenFormError } = await import("@/features/maddox/form-errors")
            expect(firstHiddenFormError({ rigorModels: { main: [undefined, { model: { message: "Selecione o modelo", type: "custom" } }] } })).toBeNull()
            expect(firstHiddenFormError({ rigorModels: { interviewer: [{ rigor: { message: "Já existe", type: "custom" } }] } })).toBeNull()
            expect(firstHiddenFormError({ rigorModels: { main: [{ agent: { message: "Longo demais", type: "too_big" } }] } })).toBe("Longo demais")
        })

        it("disponibilidade por rigor: o modelo do bloco precisa estar conectado", async () => {
            const { maddoxAvailability } = await import("@/features/maddox/server/settings")
            const settings = withBlocks([block("rigoroso", { provider: "anthropic", model: "claude" })])
            expect((await maddoxAvailability(settings)).available).toBe(true)
            expect((await maddoxAvailability(settings, "narrativo")).available).toBe(true)
            const rigoroso = await maddoxAvailability(settings, "rigoroso")
            expect(rigoroso.available).toBe(false)
            expect(rigoroso.reason).toMatch(/Anthropic/)
        })
    })
})
