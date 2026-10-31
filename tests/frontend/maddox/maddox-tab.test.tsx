/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import { DEFAULT_MADDOX_SETTINGS } from "@/features/maddox/schemas"
import { defaultMaddoxScript } from "@/features/maddox/script-draft"
import type { MaddoxSettingsDto } from "@/features/maddox/types"

const saveSettings = vi.fn()
const saveScript = vi.fn()
const generateAvatar = vi.fn()
const deleteSession = vi.fn()
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
}))

/** Integrações falsas; o filtro de provedores é o real (`toProviderStatuses`). */
let integrations: Array<{ id: string; configured: boolean; health: { status: string } }> = []
const healthy = (id: string) => ({ id, configured: true, health: { status: "ok" } })

vi.mock("@/features/ai/hooks/useAi", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/ai/hooks/useAi")>()
    return {
        AI_QUERY_KEY: "ai",
        useAiProviderStatuses: (includeAll = false) => ({ providers: actual.toProviderStatuses(integrations as never, includeAll) }),
        useImageGeneratorSettings: () => ({ data: { availability: { available: true, reason: null } } }),
        useAiModels: () => ({ data: [], isLoading: false, isError: false }),
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

const lastSaved = () => saveSettings.mock.calls.at(-1)![0] as typeof DEFAULT_MADDOX_SETTINGS

describe("aba Agente Maddox", () => {
    beforeEach(() => {
        current = dto()
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
        expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Geral", "Entrevista: cenário", "Entrevista: personagem", "JEV", "OpenCode", "Memórias"])
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

    it("seção OpenCode: muda a política e salva", async () => {
        renderTab()
        fireEvent.click(screen.getByRole("tab", { name: "OpenCode" }))
        fireEvent.click(await screen.findByRole("radio", { name: "Uma sessão por campanha" }))
        const remove = document.getElementById("maddox-opencode-delete") as HTMLInputElement
        fireEvent.click(remove)
        await waitFor(() => expect(remove.checked).toBe(false))
        fireEvent.change(screen.getByLabelText("Diretório das sessões"), { target: { value: "/srv/maddox" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(saveSettings).toHaveBeenCalled())
        expect(lastSaved().opencode).toEqual({ sessionScope: "campaign", deleteOnCampaignEnd: false, directory: "/srv/maddox" })
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
})
