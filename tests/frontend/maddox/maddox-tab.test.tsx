/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import { DEFAULT_MADDOX_SETTINGS } from "@/features/maddox/schemas"
import { defaultMaddoxScript } from "@/features/maddox/script-draft"
import type { MaddoxSettingsDto, MaddoxMcpStatusDto } from "@/features/maddox/types"

const saveSettings = vi.fn()
const saveScript = vi.fn()
const generateAvatar = vi.fn()
const deleteSession = vi.fn()
const registerMcp = vi.fn()
let mcpStatus: MaddoxMcpStatusDto = { url: "https://dndicas.example/api/maddox/mcp", registeredUrl: null, server: "dndicas-maddox", status: "missing", error: null }
const toastError = vi.fn()
let sessions: Array<Record<string, unknown>> = []

vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn(), warning: vi.fn() } }))

const dto = (): MaddoxSettingsDto => ({
    settings: structuredClone(DEFAULT_MADDOX_SETTINGS),
    isDefault: false,
    availability: { available: false, reason: '"Agente Maddox" está desativada em Integrações › Provedores de IA' },
    updatedAt: null,
    scripts: {
        scenario: { current: defaultMaddoxScript("scenario"), history: [{ kind: "scenario", version: 0, notes: "Roteiro padrão", createdBy: null, createdByName: null, createdAt: null }] },
        character: { current: defaultMaddoxScript("character"), history: [{ kind: "character", version: 0, notes: "Roteiro padrão", createdBy: null, createdByName: null, createdAt: null }] },
    },
})

vi.mock("@/features/maddox/hooks/useMaddoxSettings", () => ({
    useMaddoxSettings: () => ({ data: current, isLoading: false, isError: false, refetch: vi.fn() }),
    useSaveMaddoxSettings: () => ({ mutateAsync: saveSettings, isPending: false }),
    useSaveMaddoxScript: () => ({ mutateAsync: saveScript, isPending: false }),
    useMaddoxScriptVersion: () => ({ data: undefined, isLoading: false }),
    useGenerateMaddoxAvatar: () => ({ mutateAsync: generateAvatar, isPending: false }),
    useMaddoxSessions: () => ({ data: sessions, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
    useDeleteMaddoxSession: () => ({ mutate: deleteSession, isPending: false }),
    useMaddoxMcpStatus: () => ({ data: mcpStatus, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
    useRegisterMaddoxMcp: () => ({ mutate: registerMcp, isPending: false }),
    useMaddoxOpexMemories: () => ({ data: opexMemories, isLoading: false, isError: false, error: null }),
    useMaddoxOpexMemoryMutations: () => ({ create: { mutate: createOpexMemory, isPending: false }, update: { mutate: updateOpexMemory, isPending: false }, remove: { mutate: removeOpexMemory, isPending: false } }),
}))
const createOpexMemory = vi.fn()
const updateOpexMemory = vi.fn()
const removeOpexMemory = vi.fn()
let opexMemories: Array<{ id: string; title: string; text: string; updatedAt: string | null }> = []

/** Modelos falsos por provedor (vazio = nenhum). */
let aiModels: Record<string, Array<{ id: string; name: string; variants: string[]; group: string | null; contextWindow: number | null }>> = {}

/** Integrações falsas; o filtro de provedores é o real (`toProviderStatuses`). */
let integrations: Array<{ id: string; configured: boolean; health: { status: string } }> = []
const healthy = (id: string) => ({ id, configured: true, health: { status: "ok" } })

vi.mock("@/features/ai/hooks/useAi", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/ai/hooks/useAi")>()
    return {
        AI_QUERY_KEY: "ai",
        useAiProviderStatuses: (includeAll = false) => ({ providers: actual.toProviderStatuses(integrations as never, includeAll) }),
        useImageGeneratorSettings: () => ({ data: { availability: { available: true, reason: null } } }),
        useAiModels: (provider: string | null) => ({ data: (provider && aiModels[provider]) || [], isLoading: false, isError: false }),
        useAiAgents: () => ({ data: [], isLoading: false, isError: false }),
    }
})

let current: MaddoxSettingsDto = dto()
const { MaddoxTab } = await import("@/features/maddox/components/settings/MaddoxTab")

function renderTab() {
    return renderWithQueryClient(<MaddoxTab onDirtyChange={vi.fn()} />)
}

/** Relê o interruptor (o nó pode ter sido remontado) e confere o estado. */
const checkedNow = (name: string) => (screen.getByRole("checkbox", { name }) as HTMLInputElement).checked

/**
 * O painel da aba é montado pelo `AnimatePresence` em dois commits e o nó do interruptor pode ser
 * substituído logo depois de aparecer. Espera ele ficar estável (duas leituras seguidas no mesmo nó)
 * para o clique não cair num nó que acabou de sair do DOM.
 */
async function stableCheckbox(name: string, settleMs = 60): Promise<HTMLInputElement> {
    let node = (await screen.findByRole("checkbox", { name })) as HTMLInputElement
    for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, settleMs))
        const current = screen.queryAllByRole("checkbox", { name })[0] as HTMLInputElement | undefined
        if (current === node) return node
        if (current) node = current
    }
    return node
}

/**
 * Liga o interruptor e espera o formulário registrar a alteração: com `mode: "onChange"`, o
 * `isDirty` (que habilita o Salvar) só vale depois da validação.
 */
async function toggleOn(name: string) {
    fireEvent.click(await stableCheckbox(name))
    await waitFor(() => expect(checkedNow(name)).toBe(true))
    await waitFor(() => expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(false))
}

/** Interruptor sem nome acessível próprio (o `ToggleCard` usa o rótulo pelo `id`): liga pelo id quando o painel estabiliza. */
async function turnOnById(id: string) {
    await waitFor(() => expect(document.getElementById(id)).toBeTruthy())
    await new Promise((resolve) => setTimeout(resolve, 60))
    fireEvent.click(document.getElementById(id)!)
    await waitFor(() => expect((document.getElementById(id) as HTMLInputElement).checked).toBe(true))
}

const lastSaved = () => saveSettings.mock.calls.at(-1)![0] as typeof DEFAULT_MADDOX_SETTINGS

describe("aba Agente Maddox", () => {
    beforeEach(() => {
        current = dto()
        aiModels = {}
        integrations = [healthy("ai_opencode"), healthy("ai_gemini"), healthy("ai_jev")]
        window.history.replaceState(null, "", "/integracoes/ia?aba=agente-maddox")
        saveSettings.mockReset().mockImplementation(async (values) => ({ ...current, settings: values }))
        saveScript.mockReset()
        generateAvatar.mockReset()
        deleteSession.mockReset()
        toastError.mockReset()
        sessions = []
    })

    it("mostra as seções e o aviso de disponibilidade", () => {
        renderTab()
        const tabs = screen.getByRole("tablist", { name: "Seções do Agente Maddox" })
        expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Geral", "Entrevista: cenário", "Entrevista: personagem", "Personagem Opex", "Imagens", "JEV", "OpenCode"])
        expect(screen.getByText(/está desativada/)).toBeTruthy()
        expect(screen.getByText("Avatar")).toBeTruthy()
    })

    it("trocar o provedor para OpenCode salva com o modelo limpo", async () => {
        renderTab()
        const [mainProviders] = screen.getAllByRole("radiogroup")
        fireEvent.click(within(mainProviders!).getByRole("radio", { name: "OpenCode" }))
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        expect(lastSaved().main).toMatchObject({ provider: "opencode", model: null, agent: null })
    })

    it("gerar o avatar preenche a imagem e só vale ao salvar", async () => {
        generateAvatar.mockResolvedValueOnce({ url: "/api/files/ai/generated/maddox.png" })
        renderTab()
        fireEvent.click(screen.getByRole("button", { name: /Gerar com o Gerador de imagens/ }))
        await waitFor(() => expect(generateAvatar).toHaveBeenCalledWith(DEFAULT_MADDOX_SETTINGS.avatar.persona))
        await waitFor(() => expect(document.querySelector('img[src="/api/files/ai/generated/maddox.png"]')).toBeTruthy())
        expect(saveSettings).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        expect(lastSaved().avatar.url).toBe("/api/files/ai/generated/maddox.png")
    })

    it("liga uma decisão do JEV e salva", async () => {
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "JEV" }))
        await toggleOn("Pedir teste")
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        expect(lastSaved().jev["requires-check"]).toBe(true)
        expect(lastSaved().jev["scene-image"]).toBe(false)
    })

    it("Imagens: liga a geração e uma situação, cria uma personalizada e ajusta a frequência; tudo vai no mesmo Salvar", async () => {
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "Imagens" }))
        await turnOnById("maddox-scene-images-enabled")
        await toggleOn("Novo local ou cenário")
        fireEvent.click(screen.getByRole("button", { name: /Adicionar situação/ }))
        fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Ritual mágico" } })
        fireEvent.change(screen.getByLabelText("Quando acontece"), { target: { value: "Um ritual grandioso diante do grupo." } })
        fireEvent.change(screen.getByLabelText("Intervalo mínimo (turnos do mestre)"), { target: { value: "5" } })
        fireEvent.change(screen.getByLabelText("Máximo por campanha em 24 h"), { target: { value: "4" } })
        await waitFor(() => expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        const saved = lastSaved().sceneImages
        expect(saved).toMatchObject({ enabled: true, minNarrationsBetween: 5, maxPerDay: 4, aspectRatio: "16:9" })
        expect(saved.situations["new-location"]).toBe(true)
        expect(saved.situations.climax).toBe(false)
        expect(saved.custom).toEqual([expect.objectContaining({ label: "Ritual mágico", description: "Um ritual grandioso diante do grupo.", active: true })])
    })

    it("Imagens: situação personalizada sem nome não salva e o erro aparece na seção", async () => {
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "Imagens" }))
        await turnOnById("maddox-scene-images-enabled")
        fireEvent.click(screen.getByRole("button", { name: /Adicionar situação/ }))
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        expect(await screen.findByText("Dê um nome à situação")).toBeTruthy()
        expect(saveSettings).not.toHaveBeenCalled()
    })

    it("JEV configurado e testado não mostra o aviso de desconectado", async () => {
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "JEV" }))
        await screen.findByRole("checkbox", { name: "Pedir teste" })
        expect(screen.queryByText(/O JEV não está conectado/)).toBeNull()
    })

    it("JEV sem teste ou com falha mostra o aviso", async () => {
        integrations = [healthy("ai_opencode"), healthy("ai_gemini"), { id: "ai_jev", configured: true, health: { status: "error" } }]
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "JEV" }))
        expect(await screen.findByText(/O JEV não está conectado/)).toBeTruthy()
    })

    it("adiciona e remove tópicos e salva uma nova versão do roteiro com a versão da abertura", async () => {
        saveScript.mockImplementation(async (input) => ({ current: { ...defaultMaddoxScript("scenario"), version: 1, topics: input.topics }, history: [] }))
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "Entrevista: cenário" }))
        const total = defaultMaddoxScript("scenario").topics.length
        const save = (await screen.findByRole("button", { name: "Salvar nova versão do roteiro" })) as HTMLButtonElement
        expect(save.disabled).toBe(true)
        fireEvent.click(screen.getByRole("button", { name: "Remover o tópico 1" }))
        fireEvent.click(screen.getByRole("button", { name: /Adicionar tópico/ }))
        fireEvent.change(screen.getByLabelText(`${total}. Tópico`), { target: { value: "Facções e conflitos" } })
        expect(save.disabled).toBe(false)
        fireEvent.click(save)
        await waitFor(() => expect(saveScript).toHaveBeenCalled())
        const input = saveScript.mock.calls[0]![0]
        expect(input.version).toBe(0)
        expect(input.topics).toHaveLength(total)
        expect(input.topics.at(-1)).toMatchObject({ text: "Facções e conflitos", active: true })
        expect(input.topics[0].text).not.toBe(defaultMaddoxScript("scenario").topics[0]!.text)
    })

    it("Personagem Opex (DND-26): instruções com Restaurar padrão no mesmo Salvar e memórias globais salvas à parte", async () => {
        opexMemories = [{ id: "m_1", title: "Coopere", text: "Prefira cooperar.", updatedAt: null }]
        createOpexMemory.mockReset()
        removeOpexMemory.mockReset()
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "Personagem Opex" }))
        const instructions = (await screen.findByLabelText("Instruções")) as HTMLTextAreaElement
        expect(instructions.value).toBe(DEFAULT_MADDOX_SETTINGS.opexCharacterInstructions)
        fireEvent.change(instructions, { target: { value: "Jogue com coragem." } })
        await waitFor(() => expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        expect(lastSaved().opexCharacterInstructions).toBe("Jogue com coragem.")
        fireEvent.change(screen.getByLabelText("Instruções"), { target: { value: "Outra." } })
        fireEvent.click(screen.getAllByRole("button", { name: /Restaurar padrão/ })[0]!)
        expect((screen.getByLabelText("Instruções") as HTMLTextAreaElement).value).toBe(DEFAULT_MADDOX_SETTINGS.opexCharacterInstructions)

        expect(screen.getByTestId("opex-global-memory")).toHaveTextContent("Prefira cooperar.")
        fireEvent.click(screen.getByRole("button", { name: /Incluir memória/ }))
        fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Fale pouco" } })
        fireEvent.change(screen.getByLabelText("Memória"), { target: { value: "Declarações curtas." } })
        fireEvent.click(screen.getByRole("button", { name: "Incluir memória" }))
        expect(createOpexMemory).toHaveBeenCalledWith({ title: "Fale pouco", text: "Declarações curtas." }, expect.anything())
        fireEvent.click(screen.getByRole("button", { name: "Remover Coopere" }))
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }))
        expect(removeOpexMemory).toHaveBeenCalledWith("m_1", expect.anything())
        opexMemories = []
    })

    it("seção OpenCode: muda a política e salva", async () => {
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "OpenCode" }))
        await screen.findByLabelText("Diretório das sessões")
        // Sessões nunca compartilhadas: não há mais escolha de política.
        expect(screen.queryByRole("radio", { name: "Uma sessão por campanha" })).toBeNull()
        const remove = document.getElementById("maddox-opencode-delete") as HTMLInputElement
        fireEvent.click(remove)
        await waitFor(() => expect(remove.checked).toBe(false))
        fireEvent.change(screen.getByLabelText("Diretório das sessões"), { target: { value: "/srv/maddox" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        expect(lastSaved().opencode).toEqual({ deleteOnCampaignEnd: false, directory: "/srv/maddox", mcpUrl: null })
    })

    it("seção OpenCode: MCP do Maddox mostra a situação, registra no OpenCode e salva a URL", async () => {
        registerMcp.mockClear()
        mcpStatus = { url: "https://dndicas.example/api/maddox/mcp", registeredUrl: null, server: "dndicas-maddox", status: "missing", error: null }
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "OpenCode" }))
        expect(await screen.findByTestId("maddox-mcp-status")).toHaveTextContent("Não registrado")
        expect(screen.getByTestId("maddox-mcp-status")).toHaveTextContent("https://dndicas.example/api/maddox/mcp")
        fireEvent.click(screen.getByRole("button", { name: /Registrar no OpenCode/ }))
        expect(registerMcp).toHaveBeenCalledTimes(1)
        fireEvent.change(screen.getByLabelText("URL do MCP do Maddox"), { target: { value: "https://outro.example/api/maddox/mcp" } })
        await waitFor(() => expect((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        expect(lastSaved().opencode.mcpUrl).toBe("https://outro.example/api/maddox/mcp")
    })

    it("seção OpenCode: MCP conectado com a URL atual não oferece registrar", async () => {
        mcpStatus = { url: "https://dndicas.example/api/maddox/mcp", registeredUrl: "https://dndicas.example/api/maddox/mcp", server: "dndicas-maddox", status: "connected", error: null }
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "OpenCode" }))
        expect(await screen.findByTestId("maddox-mcp-status")).toHaveTextContent("Conectado")
        expect(screen.queryByRole("button", { name: /Registrar no OpenCode/ })).not.toBeInTheDocument()
    })

    it("seção OpenCode: URL desatualizada mostra a registrada; conectado sem URL conhecida avisa e oferece registrar", async () => {
        mcpStatus = { url: "https://novo.example/api/maddox/mcp", registeredUrl: "https://antigo.example/api/maddox/mcp", server: "dndicas-maddox", status: "outdated", error: null }
        const view = renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "OpenCode" }))
        expect(await screen.findByTestId("maddox-mcp-status")).toHaveTextContent("URL desatualizada")
        expect(screen.getByText("Registrado no OpenCode com https://antigo.example/api/maddox/mcp.")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Registrar no OpenCode/ })).toBeInTheDocument()
        view.unmount()

        mcpStatus = { url: "https://novo.example/api/maddox/mcp", registeredUrl: null, server: "dndicas-maddox", status: "connected", error: null }
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "OpenCode" }))
        expect(await screen.findByText(/O OpenCode não informa a URL registrada/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Registrar no OpenCode/ })).toBeInTheDocument()
    })

    it("seção OpenCode: lista as sessões e exclui só depois de confirmar", async () => {
        sessions = [{ id: "s1", campaignId: "c1", campaignName: "A Torre", purpose: "narrator", memberId: null, sessionId: "ses_1", directory: null, status: "active", lastError: null, lastUsedAt: null, createdAt: "2026-10-29T12:00:00.000Z" }]
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "OpenCode" }))
        expect(await screen.findByText("A Torre")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Excluir" }))
        expect(deleteSession).not.toHaveBeenCalled()
        fireEvent.click(await screen.findByRole("button", { name: "Excluir sessão" }))
        expect(deleteSession).toHaveBeenCalledWith("s1", expect.anything())
    })

    it("ativar sem provedor e modelo não salva e mostra o erro em Geral", async () => {
        renderTab()
        const enabled = document.getElementById("maddox-enabled") as HTMLInputElement
        fireEvent.click(enabled)
        await waitFor(() => expect(enabled.checked).toBe(true))
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        expect(await screen.findByText("Selecione o provedor")).toBeTruthy()
        expect(saveSettings).not.toHaveBeenCalled()
        expect(toastError).not.toHaveBeenCalled()
    })

    it("erro em campo sem mensagem na tela vira aviso (não falha em silêncio)", async () => {
        current.settings.avatar.url = `/api/files/${"x".repeat(2000)}`
        current.isDefault = true
        renderTab()
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(toastError).toHaveBeenCalledWith("Não foi possível salvar: A URL do avatar é longa demais (até 2.000 caracteres)"))
        expect(saveSettings).not.toHaveBeenCalled()
    })

    it("falha ao salvar mantém o rascunho para tentar de novo", async () => {
        saveSettings.mockRejectedValueOnce(new Error("500"))
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "JEV" }))
        await toggleOn("Pedir teste")
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        expect(checkedNow("Pedir teste")).toBe(true)
        expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(false)
    })

    it("roteiro desatualizado avisa e Desfazer carrega a versão nova", async () => {
        const view = renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "Entrevista: cenário" }))
        await screen.findByRole("button", { name: "Salvar nova versão do roteiro" })
        current = { ...current, scripts: { ...current.scripts, scenario: { ...current.scripts.scenario, current: { ...defaultMaddoxScript("scenario"), version: 3, guide: "Guia da v3" } } } }
        view.rerender(<MaddoxTab onDirtyChange={vi.fn()} />)
        expect(await screen.findByText(/Outra pessoa salvou a versão v3/)).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Desfazer roteiro" }))
        await waitFor(() => expect(screen.queryByText(/Outra pessoa salvou a versão v3/)).toBeNull())
        expect((screen.getByLabelText("Guia da entrevista") as HTMLTextAreaElement).value).toBe("Guia da v3")
    })

    describe("modelo por rigor (DND-32)", () => {
        const blocks = (target: "main" | "interviewer" = "main") => screen.queryAllByTestId(`maddox-${target}-rigor-block`)
        const addButton = (index = 0) => screen.getAllByRole("button", { name: "Por rigor" })[index] as HTMLButtonElement
        const blockTitle = (block: HTMLElement) => block.querySelector("p")?.textContent
        const pickModel = async (block: HTMLElement, name: string) => {
            fireEvent.click(await within(block).findByRole("button", { name: "Modelo" }))
            fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }))
        }
        const block = (rigor: string, provider = "gemini", model = "gemini-2.5-pro") => ({ rigor, provider, model, agent: null, variant: null }) as never

        beforeEach(() => {
            aiModels = { gemini: [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", variants: [], group: null, contextWindow: null }], opencode: [{ id: "anthropic/claude", name: "Claude", variants: [], group: null, contextWindow: null }] }
        })

        it("sem configurações por rigor a tela fica como antes e salva as listas vazias", async () => {
            renderTab()
            expect(blocks()).toHaveLength(0)
            const [mainProviders] = screen.getAllByRole("radiogroup")
            fireEvent.click(within(mainProviders!).getByRole("radio", { name: "OpenCode" }))
            fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
            await waitFor(() => expect(saveSettings).toHaveBeenCalled())
            expect(lastSaved().rigorModels).toEqual({ main: [], interviewer: [], opexCharacter: [] })
        })

        it("o botão curto abre um bloco no primeiro nível livre; escolher provedor e modelo e salvar grava o bloco", async () => {
            renderTab()
            expect(addButton().textContent?.trim()).toBe("Por rigor")
            fireEvent.click(addButton())
            await waitFor(() => expect(blocks()).toHaveLength(1))
            const [first] = blocks()
            expect(blockTitle(first!)).toBe("Rigor: Narrativo")
            fireEvent.click(within(first!).getByRole("radio", { name: "Gemini" }))
            await pickModel(first!, "Gemini 2.5 Pro")
            fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
            await waitFor(() => expect(saveSettings).toHaveBeenCalled())
            expect(lastSaved().rigorModels.main).toEqual([{ rigor: "narrativo", provider: "gemini", model: "gemini-2.5-pro", agent: null, variant: null }])
        })

        it("um segundo bloco nasce no próximo nível livre e o slider pula o nível já usado", async () => {
            current.settings.rigorModels.main = [block("narrativo")]
            renderTab()
            fireEvent.click(addButton())
            await waitFor(() => expect(blocks()).toHaveLength(2))
            expect(blockTitle(blocks()[1]!)).toBe("Rigor: Flexível")
            // Do Narrativo para a direita: o Flexível é do outro bloco, então vai ao Equilibrado.
            fireEvent.keyDown(within(blocks()[0]!).getByRole("slider"), { key: "ArrowRight" })
            await waitFor(() => expect(blockTitle(blocks()[0]!)).toBe("Rigor: Equilibrado"))
            // Do Flexível para a esquerda: o Narrativo ficou livre.
            fireEvent.keyDown(within(blocks()[1]!).getByRole("slider"), { key: "ArrowLeft" })
            await waitFor(() => expect(blockTitle(blocks()[1]!)).toBe("Rigor: Narrativo"))
        })

        it("o slider não sai do lugar quando não há nível livre na direção", async () => {
            current.settings.rigorModels.main = [block("narrativo"), block("flexivel")]
            renderTab()
            fireEvent.keyDown(within(blocks()[1]!).getByRole("slider"), { key: "ArrowLeft" })
            await new Promise((resolve) => setTimeout(resolve, 50))
            expect(blockTitle(blocks()[1]!)).toBe("Rigor: Flexível")
            expect(addButton().disabled).toBe(false)
        })

        it("com os cinco níveis configurados o botão fica desabilitado", () => {
            current.settings.rigorModels.main = ["narrativo", "flexivel", "equilibrado", "rigoroso", "fiel-dnd"].map((rigor) => block(rigor))
            renderTab()
            expect(blocks()).toHaveLength(5)
            expect(addButton().disabled).toBe(true)
            expect(addButton().title).toBe("Todos os níveis já têm configuração própria")
        })

        it("remove um bloco e edita outro carregado do servidor; o salvo reflete os dois", async () => {
            current.settings.rigorModels.main = [block("rigoroso"), block("fiel-dnd")]
            renderTab()
            fireEvent.click(screen.getByRole("button", { name: "Remover configuração do rigor Rigoroso" }))
            await waitFor(() => expect(blocks()).toHaveLength(1))
            const [remaining] = blocks()
            expect(blockTitle(remaining!)).toBe("Rigor: Fiel ao D&D")
            fireEvent.click(within(remaining!).getByRole("radio", { name: "OpenCode" }))
            await pickModel(remaining!, "Claude")
            fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
            await waitFor(() => expect(saveSettings).toHaveBeenCalled())
            expect(lastSaved().rigorModels.main).toEqual([{ rigor: "fiel-dnd", provider: "opencode", model: "anthropic/claude", agent: null, variant: null }])
        })

        it("bloco sem modelo não salva e mostra o erro no próprio bloco, sem o aviso genérico", async () => {
            renderTab()
            fireEvent.click(addButton())
            await waitFor(() => expect(blocks()).toHaveLength(1))
            fireEvent.click(within(blocks()[0]!).getByRole("radio", { name: "Gemini" }))
            fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
            expect(await within(blocks()[0]!).findByText("Selecione o modelo")).toBeTruthy()
            expect(saveSettings).not.toHaveBeenCalled()
            expect(toastError).not.toHaveBeenCalled()
        })

        it("entrevistador: blocos próprios, sem a opção \"Mesmo do Maddox\"", async () => {
            renderTab()
            fireEvent.click(addButton(1))
            await waitFor(() => expect(blocks("interviewer")).toHaveLength(1))
            expect(within(blocks("interviewer")[0]!).queryByRole("radio", { name: "Mesmo do Maddox" })).toBeNull()
            expect(blocks("main")).toHaveLength(0)
        })
    })
})
