/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxCampaignDetailDto, MaddoxCampaignMemberDto } from "@/features/maddox/campaign-types"
import type { MaddoxJournalSummaryDto } from "@/features/maddox/journal-types"

const get = vi.fn()
const post = vi.fn()

type Handler = () => void
const handlers = new Map<string, Set<Handler>>()
const channel = {
    bind: vi.fn((event: string, handler: Handler) => {
        if (!handlers.has(event)) handlers.set(event, new Set())
        handlers.get(event)!.add(handler)
    }),
    unbind: vi.fn((event: string, handler: Handler) => handlers.get(event)?.delete(handler)),
}
const emit = (event: string) => handlers.get(event)?.forEach((handler) => handler())

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/campanhas/c1" }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-owner", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => true, acquireChannel: () => channel, releaseChannel: vi.fn() }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })

const member = (id: string, userId: string, name: string, role: "owner" | "player"): MaddoxCampaignMemberDto => ({
    id,
    userId,
    name,
    username: name.toLowerCase().split(" ")[0]!,
    avatarUrl: null,
    role,
    joinedAt: "2026-10-30T10:00:00.000Z",
    character: { id: `ch-${id}`, name: role === "owner" ? "Kael" : "Lyra", portraitUrl: null, portraitStatus: null, interviewStatus: "done", profile: {}, sheetSlug: null },
    ready: true,
})

const detail = (over: Partial<MaddoxCampaignDetailDto> = {}): MaddoxCampaignDetailDto => ({
    id: "c1",
    name: "Brumas de Valdrenn",
    rigor: "equilibrado",
    status: "lobby",
    coverUrl: null,
    ownerId: "u-owner",
    ownerName: "Marina Dona",
    myRole: "owner",
    myCharacter: null,
    members: [member("m1", "u-owner", "Marina Dona", "owner"), member("m2", "u-ana", "Ana Jogadora", "player")],
    turnNumber: 0,
    turnPhase: "master",
    startedAt: null,
    scenarioStatus: "done",
    showCheckDc: false,
    sceneImages: true,
    hidePlayerActions: false,
    showEnemyHp: false,
    showAllyHp: false,
    density: "equilibrada",
    combatDifficulty: "equilibrado",
    startingLevel: null,
    startingStage: "",
    worldCatalog: { races: [], classes: [] },
    createdAt: "2026-10-30T10:00:00.000Z",
    updatedAt: "2026-10-30T10:00:00.000Z",
    myMemberId: "m1",
    inviteOpen: true,
    setting: "## Universo\nAethra, um reino coberto de brumas.",
    openingSituation: "Numa taverna à beira da estrada.",
    rigorLocked: false,
    ...over,
})

const EMPTY_STATE = { scene: "", location: "", situation: "", pendingDecision: "", updatedTurn: null }

const summary = (over: Partial<MaddoxJournalSummaryDto> = {}): MaddoxJournalSummaryDto => ({
    campaignId: "c1",
    name: "Brumas de Valdrenn",
    rigor: "equilibrado",
    status: "lobby",
    turnNumber: 0,
    myMemberId: "m1",
    maddoxAvatarUrl: null,
    setting: "Aethra, um reino coberto de brumas.",
    openingSituation: "Numa taverna à beira da estrada.",
    state: EMPTY_STATE,
    activeQuests: [],
    counts: { npcs: 0, party: 2, images: 0, memories: { fato: 0, evento: 0, local: 0, missao: 0, relacao: 0, outro: 0 } },
    memoriesUnavailable: false,
    ...over,
})

const withState = (over: Partial<MaddoxJournalSummaryDto> = {}) =>
    summary({
        status: "active",
        turnNumber: 2,
        state: { scene: "A ponte de corda balança sobre o abismo.", location: "Desfiladeiro de Karn", situation: "", pendingDecision: "Atravessar agora ou esperar a névoa?", updatedTurn: 2 },
        activeQuests: [{ id: "q1", kind: "missao", title: "Resgatar o ferreiro", text: "", tags: [], status: "ativa", turnNumber: 1, updatedAt: "2026-10-31T10:00:00.000Z" }],
        ...over,
    })

let campaign: MaddoxCampaignDetailDto
let journal: () => Promise<unknown>

beforeEach(() => {
    handlers.clear()
    get.mockReset()
    post.mockReset()
    campaign = detail()
    journal = async () => ok(summary())
    get.mockImplementation(async (url: string) => {
        if (url.endsWith("/invite")) return ok({ token: "a".repeat(43), rotatedAt: null })
        if (url.endsWith("/journal")) return journal()
        return ok(campaign)
    })
})

afterEach(() => {
    // happy-dom não calcula layout: a altura do conteúdo é fixada só no teste da situação longa.
    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
})

const { CampaignPage } = await import("@/features/maddox/components/campaigns/CampaignPage")

const journalCalls = () => get.mock.calls.filter(([url]) => String(url).endsWith("/journal")).length

describe("card da história na página da campanha (DND-37)", () => {
    it("cenário não concluído: dono vê a chamada para a entrevista e o resumo do Diário não é buscado", async () => {
        campaign = detail({ scenarioStatus: "pending" })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByRole("link", { name: /Começar entrevista de cenário/ })).toHaveAttribute("href", "/campanhas/c1/entrevista/cenario")
        expect(screen.queryByTestId("table-tutorial")).not.toBeInTheDocument()
        expect(journalCalls()).toBe(0)
    })

    it("cenário em andamento: dono continua a entrevista; jogador aguarda", async () => {
        campaign = detail({ scenarioStatus: "in-progress", status: "interview" })
        const view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByRole("link", { name: /Continuar entrevista de cenário/ })).toBeInTheDocument()
        view.unmount()

        campaign = detail({ scenarioStatus: "pending", myRole: "player", myMemberId: "m2" })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByText(/Aguardando Marina Dona definir o cenário com o Maddox/)).toBeInTheDocument()
        expect(screen.getByText(/Você poderá fazer a entrevista do seu personagem/)).toBeInTheDocument()
        expect(journalCalls()).toBe(0)
    })

    it("cenário pronto e sem situação: tutorial com o ciclo do turno, os botões reais em demonstração e o link do cenário", async () => {
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const tutorial = await screen.findByTestId("table-tutorial")
        expect(within(tutorial).getByText("Como funciona a mesa")).toBeInTheDocument()
        const steps = within(tutorial).getAllByTestId("tutorial-step")
        expect(steps.map((step) => step.textContent)).toEqual([expect.stringContaining("O Maddox narra"), expect.stringContaining("Cada jogador declara"), expect.stringContaining("O Maddox resolve")])

        const composer = within(tutorial).getByTestId("tutorial-demo-composer")
        expect(composer).toHaveAttribute("aria-hidden", "true")
        expect(composer.hasAttribute("inert")).toBe(true)
        for (const label of ["Perguntar ao mestre", "Não fazer nada", "Declarar"]) expect(within(composer).getByRole("button", { name: label, hidden: true })).toBeInTheDocument()
        expect(within(tutorial).getByTestId("tutorial-demo-reminder")).toHaveTextContent("Injetar Lembrança")
        expect(within(tutorial).getByTestId("tutorial-demo-journal")).toHaveTextContent("Diário")
        expect(within(tutorial).getByTestId("tutorial-demo-scene-image")).toHaveTextContent("Gerar imagem da cena")

        // O texto do cenário sai do card e fica no Diário.
        expect(screen.queryByText(/Aethra, um reino coberto de brumas/)).not.toBeInTheDocument()
        expect(screen.getByTestId("campaign-scenario-link")).toHaveAttribute("href", "/campanhas/c1/diario")
    })

    it("os botões da demonstração não têm efeito: a lembrança não abre nem envia nada", async () => {
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const reminder = within(await screen.findByTestId("tutorial-demo-reminder")).getByTestId("inject-reminder-button")
        expect(reminder.closest("[inert]")).not.toBeNull()
        expect(reminder.closest(".pointer-events-none")).not.toBeNull()
        expect(screen.queryByTestId("inject-reminder-popover")).not.toBeInTheDocument()
        expect(post).not.toHaveBeenCalled()
    })

    it("jogador não vê a demonstração de \"Gerar imagem da cena\" (só o dono pede imagens)", async () => {
        campaign = detail({ myRole: "player", myMemberId: "m2" })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const tutorial = await screen.findByTestId("table-tutorial")
        expect(within(tutorial).queryByTestId("tutorial-demo-scene-image")).not.toBeInTheDocument()
        expect(within(tutorial).getByTestId("tutorial-demo-reminder")).toBeInTheDocument()
    })

    it("\"Ver mais dicas\" expande e recolhe com aria-expanded e funciona pelo teclado", async () => {
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const tutorial = await screen.findByTestId("table-tutorial")
        const toggle = within(tutorial).getByRole("button", { name: /Ver mais dicas/ })
        expect(toggle).toHaveAttribute("aria-expanded", "false")
        expect(screen.queryByTestId("tutorial-extras")).not.toBeInTheDocument()

        toggle.focus()
        expect(document.activeElement).toBe(toggle)
        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute("aria-expanded", "true")
        expect(toggle).toHaveAttribute("aria-controls", "tutorial-extras")
        const extras = await screen.findByTestId("tutorial-extras")
        expect(extras).toHaveTextContent("Perguntas ao mestre não encerram o seu turno")
        expect(within(extras).getByTestId("tutorial-shortcuts")).toHaveTextContent("Enter declara")
        expect(within(extras).getByTestId("tutorial-shortcuts")).toHaveTextContent("Shift+Enter quebra a linha")

        fireEvent.click(within(tutorial).getByRole("button", { name: /Mostrar menos/ }))
        expect(toggle).toHaveAttribute("aria-expanded", "false")
        await waitFor(() => expect(screen.queryByTestId("tutorial-extras")).not.toBeInTheDocument())
    })

    it("com situação registrada: mostra a situação atual igual à do Diário (só os campos preenchidos) e as missões ativas", async () => {
        campaign = detail({ status: "active", turnNumber: 2, turnPhase: "players", rigorLocked: true })
        journal = async () => ok(withState({ memoriesUnavailable: true }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const card = await screen.findByTestId("journal-state")
        expect(screen.queryByTestId("table-tutorial")).not.toBeInTheDocument()
        expect(within(card).getByText("Situação atual")).toBeInTheDocument()
        expect(within(card).getByText("atualizada no turno 2")).toBeInTheDocument()
        expect(within(card).getByTestId("journal-state-scene")).toHaveTextContent("A ponte de corda balança sobre o abismo.")
        expect(within(card).getByTestId("journal-state-location")).toHaveTextContent("Desfiladeiro de Karn")
        expect(within(card).getByTestId("journal-state-pendingDecision")).toHaveTextContent("Atravessar agora ou esperar a névoa?")
        expect(within(card).queryByTestId("journal-state-situation")).not.toBeInTheDocument()
        expect(within(card).getByRole("list", { name: "Missões ativas" })).toHaveTextContent("Resgatar o ferreiro")
        expect(within(card).getByTestId("journal-memories-unavailable")).toBeInTheDocument()
        expect(within(card).getByTestId("campaign-scenario-link")).toHaveAttribute("href", "/campanhas/c1/diario")
    })

    it("situação longa: \"Ver mais\" expande e recolhe com aria-expanded", async () => {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 900 })
        campaign = detail({ status: "active", turnNumber: 2, turnPhase: "players", rigorLocked: true })
        journal = async () => ok(withState())
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        // A troca do esqueleto pela situação passa pelo AnimatePresence: busque o botão sempre na árvore atual.
        const toggle = await waitFor(() => within(screen.getByTestId("journal-state-expand")).getByRole("button", { name: /Ver mais/ }))
        expect(toggle).toHaveAttribute("aria-expanded", "false")
        const region = document.getElementById(toggle.getAttribute("aria-controls")!)!
        expect(region).toHaveAttribute("data-expanded", "false")
        // Já nasce recolhido (sem encolher a partir da altura inteira) e a parte cortada não recebe foco.
        expect(region.style.height).toBe("240px")
        expect(screen.getByTestId("journal-state-expand-content").hasAttribute("inert")).toBe(true)

        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute("aria-expanded", "true")
        expect(toggle).toHaveTextContent("Mostrar menos")
        expect(region).toHaveAttribute("data-expanded", "true")
        expect(screen.getByTestId("journal-state-expand-content").hasAttribute("inert")).toBe(false)

        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute("aria-expanded", "false")
        expect(region).toHaveAttribute("data-expanded", "false")
    })

    it("falha num refetch mantém a situação atual já carregada (sem trocar pelo aviso de erro)", async () => {
        campaign = detail({ status: "active", turnNumber: 2, turnPhase: "players", rigorLocked: true })
        journal = async () => ok(withState())
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        await waitFor(() => expect(screen.getByTestId("journal-state-location")).toHaveTextContent("Desfiladeiro de Karn"))

        journal = async () => {
            throw Object.assign(new Error("500"), { response: { status: 500 } })
        }
        act(() => emit("maddox.game.changed"))
        await waitFor(() => expect(journalCalls()).toBe(2))
        await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
        expect(screen.queryByTestId("campaign-story-error")).not.toBeInTheDocument()
        expect(screen.getByTestId("journal-state-location")).toHaveTextContent("Desfiladeiro de Karn")
    })

    it("mesa já iniciada sem situação registrada: o tutorial não diz \"antes do primeiro turno\"", async () => {
        campaign = detail({ status: "active", turnNumber: 4, turnPhase: "players", rigorLocked: true })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const tutorial = await screen.findByTestId("table-tutorial")
        expect(tutorial).toHaveTextContent("Mesa em andamento · Turno 4")
        expect(tutorial).not.toHaveTextContent("Antes do primeiro turno")
        expect(screen.getByTestId("table-tutorial-description")).toHaveTextContent("O Maddox ainda não registrou a situação atual da história.")
        expect(screen.getByTestId("table-tutorial-description")).not.toHaveTextContent("antes da primeira narração")
    })

    it("tutorial no lobby avisa que é antes do primeiro turno", async () => {
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const tutorial = await screen.findByTestId("table-tutorial")
        expect(tutorial).toHaveTextContent("Antes do primeiro turno")
        expect(screen.getByTestId("table-tutorial-description")).toHaveTextContent("O cenário está pronto.")
    })

    it("situação curta: sem corte e sem botão de ver mais", async () => {
        campaign = detail({ status: "active", turnNumber: 2, turnPhase: "players", rigorLocked: true })
        journal = async () => ok(withState())
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const expand = await screen.findByTestId("journal-state-expand")
        expect(within(expand).queryByRole("button", { name: /Ver mais/ })).not.toBeInTheDocument()
        expect(screen.getByTestId("journal-state-expand-content").hasAttribute("inert")).toBe(false)
    })

    it("a primeira narração troca o tutorial pela situação atual pelo maddox.game.changed, sem recarregar a página", async () => {
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("table-tutorial")).toBeInTheDocument()

        campaign = detail({ status: "active", turnNumber: 1, turnPhase: "players", rigorLocked: true })
        journal = async () => ok(withState())
        act(() => emit("maddox.game.changed"))

        expect(await screen.findByTestId("journal-state")).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByTestId("table-tutorial")).not.toBeInTheDocument())
        expect(screen.getByTestId("journal-state-location")).toHaveTextContent("Desfiladeiro de Karn")
    })

    it("carregando mostra o esqueleto; erro mostra um aviso discreto com \"Tentar de novo\" sem derrubar a página", async () => {
        let release: (value: unknown) => void = () => undefined
        journal = () => new Promise((resolve) => (release = resolve))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("campaign-story-loading")).toBeInTheDocument()
        await act(async () => release(ok(summary())))
        expect(await screen.findByTestId("table-tutorial")).toBeInTheDocument()
    })

    it("erro no resumo: aviso discreto e nova tentativa", async () => {
        journal = async () => {
            throw Object.assign(new Error("500"), { response: { status: 500 } })
        }
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const error = await screen.findByTestId("campaign-story-error")
        expect(error).toHaveTextContent("Não foi possível carregar a situação da campanha.")
        expect(screen.getByRole("list", { name: "Participantes" })).toBeInTheDocument()

        journal = async () => ok(summary())
        fireEvent.click(within(error).getByRole("button", { name: /Tentar de novo/ }))
        expect(await screen.findByTestId("table-tutorial")).toBeInTheDocument()
    })
})
