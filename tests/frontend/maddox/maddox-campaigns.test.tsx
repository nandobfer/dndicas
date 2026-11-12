/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxCampaignDetailDto, MaddoxCampaignListItemDto, MaddoxCampaignMemberDto } from "@/features/maddox/campaign-types"
import type { MaddoxJournalSummaryDto } from "@/features/maddox/journal-types"
import { rarityColors } from "@/lib/config/colors"
import { rigorColor } from "@/features/maddox/components/campaigns/campaign-visuals"

const push = vi.fn()
const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const patch = vi.fn()
const del = vi.fn()

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/campanhas" }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-owner", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post, put, patch, delete: del } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })
const TOKEN = "a".repeat(43)

const member = (id: string, userId: string, name: string, role: "owner" | "player", character: MaddoxCampaignMemberDto["character"] = null): MaddoxCampaignMemberDto => ({
    id,
    userId,
    name,
    username: name.toLowerCase().split(" ")[0]!,
    avatarUrl: null,
    role,
    joinedAt: "2026-10-30T10:00:00.000Z",
    character,
    ready: character?.interviewStatus === "done",
})

const listItem = (over: Partial<MaddoxCampaignListItemDto> = {}): MaddoxCampaignListItemDto => ({
    id: "c1",
    name: "Brumas de Valdrenn",
    rigor: "fiel-dnd",
    status: "lobby",
    coverUrl: null,
    lastSceneImageUrl: null,
    ownerId: "u-owner",
    ownerName: "Marina Dona",
    myRole: "owner",
    myCharacter: null,
    members: [member("m1", "u-owner", "Marina Dona", "owner"), member("m2", "u-ana", "Ana Jogadora", "player", { id: "ch1", name: "Lyra", portraitUrl: null, portraitStatus: null, interviewStatus: "pending", profile: {}, sheetSlug: null })],
    turnNumber: 0,
    turnPhase: "master",
    startedAt: null,
    scenarioStatus: "pending",
    showCheckDc: false,
    sceneImages: true,
    hidePlayerActions: false,
    density: "equilibrada",
    combatDifficulty: "equilibrado",
    startingLevel: null,
    startingStage: "",
    worldCatalog: { races: [], classes: [] },
    createdAt: "2026-10-30T10:00:00.000Z",
    updatedAt: new Date().toISOString(),
    ...over,
})

const detail = (over: Partial<MaddoxCampaignDetailDto> = {}): MaddoxCampaignDetailDto => ({ ...listItem(), myMemberId: "m1", inviteOpen: true, setting: "", openingSituation: "", rigorLocked: false, ...over })

/** Resumo do Diário sem situação registrada (a página da campanha mostra o tutorial da mesa, DND-37). */
const emptyJournal = (campaignId = "c1"): MaddoxJournalSummaryDto => ({
    campaignId,
    name: "Brumas de Valdrenn",
    rigor: "fiel-dnd",
    status: "lobby",
    turnNumber: 0,
    myMemberId: "m1",
    maddoxAvatarUrl: null,
    setting: "",
    openingSituation: "",
    state: { scene: "", location: "", situation: "", pendingDecision: "", updatedTurn: null },
    activeQuests: [],
    counts: { npcs: 0, party: 0, images: 0, memories: { local: 0, missao: 0, evento: 0, relacao: 0, fato: 0, outro: 0 } },
    memoriesUnavailable: false,
})

const { CampaignsPage } = await import("@/features/maddox/components/campaigns/CampaignsPage")
const { CampaignPage } = await import("@/features/maddox/components/campaigns/CampaignPage")
const { InviteAcceptPage } = await import("@/features/maddox/components/campaigns/InviteAcceptPage")

/** O happy-dom devolve a cor como foi escrita (hex); um navegador devolveria `rgb(...)`. */
const sameColor = (actual: string, hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16)
    return [hex.toLowerCase(), `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`].includes(actual.toLowerCase())
}

beforeEach(() => {
    for (const fn of [push, get, post, put, patch, del]) fn.mockReset()
})

/** O card da lista (DND-55: o link é esticado por baixo do conteúdo, que fica no card, não dentro do link). */
const cardOf = (link: HTMLElement) => link.closest<HTMLElement>('[data-testid="campaign-card"]')!

describe("lista de campanhas", () => {
    it("um card por campanha, com cores de raridade e link para a página da campanha", async () => {
        get.mockResolvedValue(ok([listItem(), listItem({ id: "c2", name: "Mar de Cinzas", rigor: "narrativo", status: "active", myRole: "player", ownerName: "Ana" })]))
        renderWithQueryClient(<CampaignsPage />)

        const first = cardOf(await screen.findByRole("link", { name: "Abrir a campanha Brumas de Valdrenn" }))
        expect(screen.getByRole("link", { name: "Abrir a campanha Brumas de Valdrenn" })).toHaveAttribute("href", "/campanhas/c1")
        expect(screen.getByRole("link", { name: "Abrir a campanha Mar de Cinzas" })).toHaveAttribute("href", "/campanhas/c2")
        expect(sameColor(within(first).getByText("Fiel ao D&D").style.color, rarityColors.legendary)).toBe(true)
        expect(within(first).getByText("Dono")).toBeInTheDocument()
        expect(within(first).getByText("Você ainda não criou seu personagem")).toBeInTheDocument()
        const second = cardOf(screen.getByRole("link", { name: "Abrir a campanha Mar de Cinzas" }))
        expect(sameColor(within(second).getByText("Narrativo").style.color, rarityColors.common)).toBe(true)
        expect(within(second).getByText("Jogador")).toBeInTheDocument()
        expect(get).toHaveBeenCalledWith("/maddox/campaigns")
        // DND-42: chip da dificuldade só no grau tático (Fiel ao D&D), não no Narrativo.
        expect(within(first).getByTestId("maddox-combat-difficulty-chip")).toHaveTextContent("Combate equilibrado")
        expect(within(second).queryByTestId("maddox-combat-difficulty-chip")).not.toBeInTheDocument()
    })

    it("card da lista: chip do nível nos graus com ficha; estágio narrativo longo aparece inteiro, sem reticências", async () => {
        const stageText = "caçadores recém-iniciados, com algumas missões nas costas e uma dívida antiga com a guilda"
        get.mockResolvedValue(ok([listItem({ rigor: "fiel-dnd", startingLevel: 3 }), listItem({ id: "c2", name: "Mar de Cinzas", rigor: "narrativo", startingLevel: null, startingStage: stageText })]))
        renderWithQueryClient(<CampaignsPage />)
        expect(await screen.findByTestId("starting-level-chip")).toHaveTextContent("Nível inicial 3")
        const stage = screen.getByTestId("starting-stage")
        expect(stage).toHaveTextContent(`Estágio inicial: ${stageText}`)
        expect(stage.className).toContain("whitespace-normal")
        for (const element of [stage, ...stage.querySelectorAll("*")]) expect(element.className).not.toContain("truncate")
        expect(screen.getAllByTestId("starting-level-chip")).toHaveLength(1)
    })

    it("capa (DND-35): a última imagem da campanha fica atrás do gradiente do rigor, sem as espadas", async () => {
        get.mockResolvedValue(ok([listItem({ lastSceneImageUrl: "https://cdn.example/cena-2.png", coverUrl: "https://cdn.example/capa.png" }), listItem({ id: "c2", name: "Mar de Cinzas", rigor: "narrativo" })]))
        renderWithQueryClient(<CampaignsPage />)

        const first = cardOf(await screen.findByRole("link", { name: "Abrir a campanha Brumas de Valdrenn" }))
        const image = within(first).getByTestId("campaign-cover-image")
        expect(image).toHaveAttribute("src", "https://cdn.example/cena-2.png")
        expect(image.className).toContain("object-cover")
        const gradient = within(first).getByTestId("campaign-cover-gradient")
        expect(gradient.getAttribute("style")).toContain(`${rigorColor("fiel-dnd")}26`)
        // O gradiente vem depois da imagem: fica por cima dela.
        expect(image.compareDocumentPosition(gradient) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(within(first).queryByTestId("campaign-cover-swords")).not.toBeInTheDocument()

        // Sem imagem: gradiente e espadas como antes.
        const second = cardOf(screen.getByRole("link", { name: "Abrir a campanha Mar de Cinzas" }))
        expect(within(second).queryByTestId("campaign-cover-image")).not.toBeInTheDocument()
        expect(within(second).getByTestId("campaign-cover-gradient").getAttribute("style")).toContain(`${rigorColor("narrativo")}26`)
        expect(within(second).getByTestId("campaign-cover-swords")).toBeInTheDocument()
    })

    it("capa (DND-35): sem imagem de cena usa a capa da campanha, também atrás do gradiente", async () => {
        get.mockResolvedValue(ok([listItem({ coverUrl: "https://cdn.example/capa.png" })]))
        renderWithQueryClient(<CampaignsPage />)
        const card = cardOf(await screen.findByRole("link", { name: "Abrir a campanha Brumas de Valdrenn" }))
        expect(within(card).getByTestId("campaign-cover-image")).toHaveAttribute("src", "https://cdn.example/capa.png")
        expect(within(card).getByTestId("campaign-cover-gradient")).toBeInTheDocument()
        expect(within(card).queryByTestId("campaign-cover-swords")).not.toBeInTheDocument()
    })

    it("capa (DND-35): imagem que não carrega volta às espadas", async () => {
        get.mockResolvedValue(ok([listItem({ lastSceneImageUrl: "https://cdn.example/sumiu.png" })]))
        renderWithQueryClient(<CampaignsPage />)
        const card = cardOf(await screen.findByRole("link", { name: "Abrir a campanha Brumas de Valdrenn" }))
        fireEvent.error(within(card).getByTestId("campaign-cover-image"))
        await waitFor(() => expect(within(card).queryByTestId("campaign-cover-image")).not.toBeInTheDocument())
        expect(within(card).getByTestId("campaign-cover-swords")).toBeInTheDocument()
    })

    it("avatares do card (DND-55): ficam fora do link, abrem o retrato sem navegar e o link continua cobrindo o card", async () => {
        get.mockResolvedValue(ok([listItem()]))
        renderWithQueryClient(<CampaignsPage />)
        const link = await screen.findByRole("link", { name: "Abrir a campanha Brumas de Valdrenn" })
        const card = cardOf(link)
        const lyra = within(card).getByRole("button", { name: "Ver retrato de Lyra" })
        expect(lyra.closest("a")).toBeNull()
        expect(link.className).toContain("absolute inset-0")
        expect(within(card).getByRole("button", { name: "Ver retrato de Marina Dona" })).toBeInTheDocument()
        fireEvent.click(lyra)
        const viewer = await screen.findByTestId("member-portrait-viewer")
        expect(viewer).toHaveTextContent("Lyra")
        expect(viewer).toHaveTextContent("Jogador · Ana Jogadora")
    })

    it("sem campanhas mostra o estado vazio em pt-BR", async () => {
        get.mockResolvedValue(ok([]))
        renderWithQueryClient(<CampaignsPage />)
        expect(await screen.findByText("Nenhuma campanha por aqui")).toBeInTheDocument()
    })

    it("cria com o rigor escolhido no slider (teclado e marca) e abre a campanha", async () => {
        get.mockResolvedValue(ok([]))
        post.mockResolvedValue(ok(detail({ id: "c9", name: "Nova Mesa", rigor: "fiel-dnd" })))
        renderWithQueryClient(<CampaignsPage />)
        fireEvent.click(await screen.findByRole("button", { name: /Nova campanha/ }))

        const slider = await screen.findByRole("slider", { name: "Grau de rigor da campanha" })
        expect(slider).toHaveAttribute("aria-valuetext", "Equilibrado")
        fireEvent.keyDown(slider, { key: "ArrowRight" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Rigoroso"))
        expect(screen.getByTestId("maddox-rigor-description")).toHaveTextContent("Rigoroso: Regras do D&D na maior parte das situações")
        fireEvent.keyDown(slider, { key: "Home" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Narrativo"))
        expect(screen.getByText("• Nenhuma: sem rolagens e sem números")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Fiel ao D&D", hidden: true }))
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Fiel ao D&D"))
        // Maddox 8: o Fiel ao D&D diz que o mundo é de fantasia D&D com povos e classes do catálogo.
        expect(screen.getByText("• Mundo de fantasia D&D, oficial ou próprio, com povos e classes do catálogo do DnDicas")).toBeInTheDocument()
        expect(screen.getByText("• Só magias e itens cadastrados no DnDicas")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        expect(await screen.findByText(/ao menos 3 caracteres/)).toBeInTheDocument()
        expect(post).not.toHaveBeenCalled()

        fireEvent.change(screen.getByLabelText("Nome da campanha"), { target: { value: "Nova Mesa" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns", { name: "Nova Mesa", rigor: "fiel-dnd", density: "equilibrada", combatDifficulty: "equilibrado", showCheckDc: false }))
        await waitFor(() => expect(push).toHaveBeenCalledWith("/campanhas/c9/entrevista/cenario"))
    })

    it("CD dos testes na criação: 'Visível' vai no POST nos graus com testes; em grau narrativo o campo some e não é enviado", async () => {
        post.mockResolvedValue(ok(detail({ id: "c9", name: "Nova Mesa", rigor: "rigoroso", showCheckDc: true })))
        renderWithQueryClient(<CampaignsPage />)
        fireEvent.click(await screen.findByRole("button", { name: /Nova campanha/ }))
        const slider = await screen.findByRole("slider", { name: "Grau de rigor da campanha" })
        // Equilibrado (padrão) usa testes: o campo aparece com a CD secreta.
        const field = screen.getByTestId("check-dc-field")
        expect(field).toHaveTextContent("o Maddox define a CD em segredo")
        fireEvent.click(within(field).getByRole("button", { name: "Visível" }))
        await waitFor(() => expect(screen.getByTestId("check-dc-field")).toHaveTextContent("Os jogadores veem a classe de dificuldade"))
        fireEvent.keyDown(slider, { key: "ArrowRight" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Rigoroso"))
        fireEvent.change(screen.getByLabelText("Nome da campanha"), { target: { value: "Nova Mesa" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns", { name: "Nova Mesa", rigor: "rigoroso", density: "equilibrada", combatDifficulty: "equilibrado", showCheckDc: true }))
    })

    it("CD dos testes na criação: grau narrativo esconde o campo e não envia showCheckDc", async () => {
        post.mockResolvedValue(ok(detail({ id: "c9", name: "Só História", rigor: "narrativo" })))
        renderWithQueryClient(<CampaignsPage />)
        fireEvent.click(await screen.findByRole("button", { name: /Nova campanha/ }))
        const slider = await screen.findByRole("slider", { name: "Grau de rigor da campanha" })
        fireEvent.click(within(screen.getByTestId("check-dc-field")).getByRole("button", { name: "Visível" }))
        fireEvent.keyDown(slider, { key: "Home" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Narrativo"))
        expect(screen.queryByTestId("check-dc-field")).not.toBeInTheDocument()
        fireEvent.change(screen.getByLabelText("Nome da campanha"), { target: { value: "Só História" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns", { name: "Só História", rigor: "narrativo", density: "equilibrada" }))
    })

    it("imagens nas cenas na criação: ligadas por padrão (não vão no POST); desligadas enviam sceneImages: false", async () => {
        post.mockResolvedValue(ok(detail({ id: "c9", name: "Sem Imagens", rigor: "narrativo" })))
        renderWithQueryClient(<CampaignsPage />)
        fireEvent.click(await screen.findByRole("button", { name: /Nova campanha/ }))
        const field = await screen.findByTestId("scene-images-field")
        expect(field).toHaveTextContent("O Maddox ilustra os momentos marcantes")
        fireEvent.click(within(field).getByRole("button", { name: "Desligadas" }))
        await waitFor(() => expect(screen.getByTestId("scene-images-field")).toHaveTextContent("Sem imagens automáticas"))
        fireEvent.change(screen.getByLabelText("Nome da campanha"), { target: { value: "Sem Imagens" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns", expect.objectContaining({ name: "Sem Imagens", sceneImages: false })))
    })

    it("ações dos outros jogadores na criação (DND-36): visíveis por padrão (não vão no POST); ocultas enviam hidePlayerActions: true", async () => {
        post.mockResolvedValue(ok(detail({ id: "c9", name: "Às Escuras", rigor: "narrativo" })))
        renderWithQueryClient(<CampaignsPage />)
        fireEvent.click(await screen.findByRole("button", { name: /Nova campanha/ }))
        const field = await screen.findByTestId("player-actions-field")
        expect(field).toHaveTextContent("Todos veem o texto das declarações no chat.")
        fireEvent.click(within(field).getByRole("button", { name: "Ocultas" }))
        await waitFor(() => expect(screen.getByTestId("player-actions-field")).toHaveTextContent("Os outros jogadores veem só \"Fulano declarou sua ação\""))
        fireEvent.change(screen.getByLabelText("Nome da campanha"), { target: { value: "Às Escuras" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns", expect.objectContaining({ name: "Às Escuras", hidePlayerActions: true })))
    })

    it("densidade na criação (DND-22): slider no modelo do rigor, com descrição e tamanho por passo, e o valor vai no POST", async () => {
        post.mockResolvedValue(ok(detail({ id: "c9", name: "Mesa Curta", density: "breve" })))
        renderWithQueryClient(<CampaignsPage />)
        fireEvent.click(await screen.findByRole("button", { name: /Nova campanha/ }))
        const slider = await screen.findByRole("slider", { name: "Densidade das narrações da campanha" })
        expect(slider).toHaveAttribute("aria-valuetext", "Equilibrada")
        expect(screen.getByTestId("maddox-density-size")).toHaveTextContent("2 a 3 parágrafos")
        for (const label of ["Concisa", "Breve", "Detalhada", "Extensa"]) expect(screen.getByRole("button", { name: label, hidden: true })).toBeInTheDocument()
        fireEvent.keyDown(slider, { key: "ArrowLeft" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Breve"))
        expect(screen.getByTestId("maddox-density-description")).toHaveTextContent("Breve: Narrações curtas")
        expect(screen.getByTestId("maddox-density-size")).toHaveTextContent("1 a 2 parágrafos")
        fireEvent.click(screen.getByRole("button", { name: "Extensa", hidden: true }))
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Extensa"))
        fireEvent.keyDown(slider, { key: "Home" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Concisa"))
        fireEvent.keyDown(slider, { key: "ArrowRight" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Breve"))
        fireEvent.change(screen.getByLabelText("Nome da campanha"), { target: { value: "Mesa Curta" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns", expect.objectContaining({ name: "Mesa Curta", density: "breve" })))
    })

    it("dificuldade dos combates na criação (DND-42): só nos graus táticos, 5 passos com descrição no formato do rigor, e o valor vai no POST", async () => {
        post.mockResolvedValue(ok(detail({ id: "c9", name: "Mesa Fácil", rigor: "rigoroso", combatDifficulty: "facil" })))
        renderWithQueryClient(<CampaignsPage />)
        fireEvent.click(await screen.findByRole("button", { name: /Nova campanha/ }))
        const rigor = await screen.findByRole("slider", { name: "Grau de rigor da campanha" })
        // Equilibrado (padrão) não tem combate tático: o card não aparece.
        expect(screen.queryByRole("slider", { name: "Dificuldade dos combates da campanha" })).not.toBeInTheDocument()
        fireEvent.keyDown(rigor, { key: "ArrowRight" })
        await waitFor(() => expect(rigor).toHaveAttribute("aria-valuetext", "Rigoroso"))
        const slider = await screen.findByRole("slider", { name: "Dificuldade dos combates da campanha" })
        expect(slider).toHaveAttribute("aria-valuetext", "Equilibrado")
        expect(screen.getByTestId("maddox-combat-difficulty-description")).toHaveTextContent("Equilibrado: Combates equilibrados")
        expect(screen.getByText("• Adversários na medida do grupo (4 goblins para 4 personagens de nível 1)")).toBeInTheDocument()
        for (const label of ["Muito fácil", "Fácil", "Difícil", "Mortal"]) expect(screen.getByRole("button", { name: label, hidden: true })).toBeInTheDocument()
        fireEvent.keyDown(slider, { key: "ArrowLeft" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Fácil"))
        expect(screen.getByTestId("maddox-combat-difficulty-description")).toHaveTextContent("Fácil: Os combates são favoráveis ao grupo")
        expect(screen.getByText("• Menos adversários do que personagens (no máximo 3 goblins para 4 personagens de nível 1)")).toBeInTheDocument()
        expect(screen.getByText("• Ou a quantidade cheia, enfraquecida pela cena (bêbados, sonolentos, feridos), com desvantagem nos ataques")).toBeInTheDocument()
        // Fiel ao D&D também mostra; voltar a um grau sem combate tático esconde.
        fireEvent.keyDown(rigor, { key: "End" })
        await waitFor(() => expect(rigor).toHaveAttribute("aria-valuetext", "Fiel ao D&D"))
        expect(screen.getByRole("slider", { name: "Dificuldade dos combates da campanha" })).toBeInTheDocument()
        fireEvent.keyDown(rigor, { key: "Home" })
        await waitFor(() => expect(rigor).toHaveAttribute("aria-valuetext", "Narrativo"))
        expect(screen.queryByRole("slider", { name: "Dificuldade dos combates da campanha" })).not.toBeInTheDocument()
        // De volta ao Rigoroso, a escolha continua no formulário e vai no POST.
        fireEvent.keyDown(rigor, { key: "End" })
        fireEvent.keyDown(rigor, { key: "ArrowLeft" })
        await waitFor(() => expect(rigor).toHaveAttribute("aria-valuetext", "Rigoroso"))
        expect(screen.getByRole("slider", { name: "Dificuldade dos combates da campanha" })).toHaveAttribute("aria-valuetext", "Fácil")
        fireEvent.change(screen.getByLabelText("Nome da campanha"), { target: { value: "Mesa Fácil" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns", expect.objectContaining({ name: "Mesa Fácil", rigor: "rigoroso", combatDifficulty: "facil" })))
    })

    it("Maddox indisponível: mostra o motivo no diálogo", async () => {
        get.mockResolvedValue(ok([]))
        post.mockRejectedValue(Object.assign(new Error("409"), { isAxiosError: true, response: { status: 409, data: { success: false, error: 'O "Agente Maddox" está desativado.' } } }))
        renderWithQueryClient(<CampaignsPage />)
        fireEvent.click(await screen.findByRole("button", { name: /Nova campanha/ }))
        fireEvent.change(await screen.findByLabelText("Nome da campanha"), { target: { value: "Sem mestre" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        expect(await screen.findByText('O "Agente Maddox" está desativado.')).toBeInTheDocument()
        expect(push).not.toHaveBeenCalled()
    })
})

describe("página da campanha (lobby)", () => {
    it("dono vê participantes, copia o link e gera outro com confirmação", async () => {
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(detail())))
        post.mockResolvedValue(ok({ token: "b".repeat(43), rotatedAt: null }))
        const writeText = vi.fn(async () => undefined)
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)

        const list = await screen.findByRole("list", { name: "Participantes" })
        expect(within(list).getByText("Lyra")).toBeInTheDocument()
        expect(within(list).getByText(/Ana Jogadora/)).toBeInTheDocument()
        expect(screen.getByText(/Preparação: o dono define o cenário com o Maddox/)).toBeInTheDocument()

        const link = await screen.findByLabelText("Link de convite")
        // O link ocupa a linha inteira; os botões ficam num bloco abaixo (não vazam da coluna).
        expect([...link.parentElement!.children].filter((element) => element.tagName === "BUTTON")).toHaveLength(0)
        const actions = screen.getByTestId("invite-actions")
        expect(actions.contains(link)).toBe(false)
        expect(within(actions).getByRole("button", { name: /Copiar link/ })).toBeInTheDocument()
        expect(within(actions).getByRole("button", { name: /Gerar novo link/ })).toBeInTheDocument()
        expect(link.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(link.className).toContain("w-full")
        expect((link as HTMLInputElement).value).toBe(`${window.location.origin}/campanhas/convite/${TOKEN}`)
        fireEvent.click(screen.getByRole("button", { name: /Copiar link/ }))
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/campanhas/convite/${TOKEN}`))

        fireEvent.click(screen.getByRole("button", { name: /Gerar novo link/ }))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText(/O link atual deixa de funcionar/)).toBeInTheDocument()
        fireEvent.click(within(dialog).getByRole("button", { name: /Gerar novo link/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/invite"))
        await waitFor(() => expect((screen.getByLabelText("Link de convite") as HTMLInputElement).value).toContain("b".repeat(43)))
    })

    it("dono remove jogador com confirmação", async () => {
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(detail())))
        del.mockResolvedValue(ok({ left: false }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: "Remover Ana Jogadora" }))
        const dialog = await screen.findByRole("alertdialog")
        expect(del).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole("button", { name: /Remover/ }))
        await waitFor(() => expect(del).toHaveBeenCalledWith("/maddox/campaigns/c1/members/m2"))
    })

    it("Criar personagem vai direto para a entrevista (sem formulário de nome e retrato); antes do cenário fica desabilitado", async () => {
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(detail({ scenarioStatus: "done" }))))
        const view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const create = await screen.findByRole("link", { name: /Criar personagem/ })
        expect(create).toHaveAttribute("href", "/campanhas/c1/entrevista/personagem")
        fireEvent.click(create)
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        expect(screen.queryByLabelText("Nome do personagem")).not.toBeInTheDocument()
        expect(put).not.toHaveBeenCalled()
        view.unmount()

        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(detail())))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const pending = await screen.findByRole("button", { name: /Criar personagem/ })
        expect(pending).toBeDisabled()
        expect(pending).toHaveAttribute("title", "Disponível depois que o cenário estiver pronto")
    })

    it("jogador não vê o link nem pode remover; pode sair da campanha", async () => {
        get.mockResolvedValue(ok(detail({ myRole: "player", myMemberId: "m2" })))
        del.mockResolvedValue(ok({ left: true }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByText(/Só o dono \(Marina Dona\) pode compartilhar/)).toBeInTheDocument()
        expect(screen.queryByLabelText("Link de convite")).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /^Remover/ })).not.toBeInTheDocument()
        expect(get).not.toHaveBeenCalledWith("/maddox/campaigns/c1/invite")
        fireEvent.click(screen.getByRole("button", { name: /Sair da campanha/ }))
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /Sair/ }))
        await waitFor(() => expect(del).toHaveBeenCalledWith("/maddox/campaigns/c1/members/m2"))
        await waitFor(() => expect(push).toHaveBeenCalledWith("/campanhas"))
    })

    const ownerDetail = (over: Partial<MaddoxCampaignDetailDto> = {}) => {
        const campaign = detail(over)
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(campaign)))
        patch.mockImplementation(async (_url: string, body: Record<string, unknown>) => ok({ ...campaign, ...body }))
        return campaign
    }

    async function openEdit() {
        fireEvent.click(await screen.findByRole("button", { name: /^Editar$/ }))
        return screen.findByRole("dialog")
    }

    it("editar: o formulário vem com os dados da campanha e envia só o nome alterado", async () => {
        ownerDetail({ rigor: "equilibrado" })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const dialog = await openEdit()
        const name = within(dialog).getByLabelText("Nome da campanha") as HTMLInputElement
        expect(name.value).toBe("Brumas de Valdrenn")
        expect(within(dialog).getByRole("slider", { name: "Grau de rigor da campanha" })).toHaveAttribute("aria-valuetext", "Equilibrado")
        fireEvent.change(name, { target: { value: "Brumas Eternas" } })
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { name: "Brumas Eternas" }))
    })

    it("editar no lobby: mudar o rigor envia só o rigor", async () => {
        ownerDetail({ rigor: "equilibrado" })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const dialog = await openEdit()
        const slider = within(dialog).getByRole("slider", { name: "Grau de rigor da campanha" })
        fireEvent.keyDown(slider, { key: "End" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Fiel ao D&D"))
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { rigor: "fiel-dnd" }))
    })

    it("editar fora do lobby: slider desabilitado e o PATCH não leva o rigor", async () => {
        ownerDetail({ rigor: "equilibrado", status: "active", rigorLocked: true })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const dialog = await openEdit()
        expect(within(dialog).getByText(/o grau de rigor não pode mais mudar/)).toBeInTheDocument()
        const slider = within(dialog).getByRole("slider", { name: "Grau de rigor da campanha" })
        expect(slider).toHaveAttribute("data-disabled")
        fireEvent.keyDown(slider, { key: "End" })
        expect(slider).toHaveAttribute("aria-valuetext", "Equilibrado")
        fireEvent.change(within(dialog).getByLabelText("Nome da campanha"), { target: { value: "Em andamento" } })
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
        expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { name: "Em andamento" })
    })

    it("editar a CD dos testes (mesmo em andamento) envia só showCheckDc; voltar ao valor original não chama a API", async () => {
        // Servidor com estado: o PATCH grava e a recarga da campanha devolve o valor novo.
        let current = detail({ rigor: "fiel-dnd", status: "active", rigorLocked: true, showCheckDc: false })
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(current)))
        patch.mockImplementation(async (_url: string, body: Record<string, unknown>) => {
            current = { ...current, ...body }
            return ok(current)
        })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        let dialog = await openEdit()
        const field = within(dialog).getByTestId("check-dc-field")
        expect(field).toHaveTextContent("o Maddox define a CD em segredo")
        fireEvent.click(within(field).getByRole("button", { name: "Visível" }))
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { showCheckDc: true }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

        patch.mockClear()
        dialog = await openEdit()
        await waitFor(() => expect(within(dialog).getByTestId("check-dc-field")).toHaveTextContent("Os jogadores veem a classe de dificuldade"))
        const again = within(dialog).getByTestId("check-dc-field")
        fireEvent.click(within(again).getByRole("button", { name: "Secreta" }))
        fireEvent.click(within(again).getByRole("button", { name: "Visível" }))
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(patch).not.toHaveBeenCalled()
    })

    it("editar as imagens nas cenas (mesmo em andamento) envia só sceneImages", async () => {
        let current = detail({ status: "active", rigorLocked: true, sceneImages: true })
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(current)))
        patch.mockImplementation(async (_url: string, body: Record<string, unknown>) => {
            current = { ...current, ...body }
            return ok(current)
        })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const dialog = await openEdit()
        fireEvent.click(within(within(dialog).getByTestId("scene-images-field")).getByRole("button", { name: "Desligadas" }))
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { sceneImages: false }))
    })

    it("editar as ações dos outros jogadores (DND-36, mesmo em andamento) envia só hidePlayerActions; sem mudança não envia nada", async () => {
        let current = detail({ status: "active", rigorLocked: true, hidePlayerActions: false })
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(current)))
        patch.mockImplementation(async (_url: string, body: Record<string, unknown>) => {
            current = { ...current, ...body }
            return ok(current)
        })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        let dialog = await openEdit()
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(patch).not.toHaveBeenCalled()
        dialog = await openEdit()
        fireEvent.click(within(within(dialog).getByTestId("player-actions-field")).getByRole("button", { name: "Ocultas" }))
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { hidePlayerActions: true }))
    })

    it("editar a densidade (DND-22) com a campanha em andamento e o rigor travado envia só density; o chip mostra o nível", async () => {
        let current = detail({ status: "active", rigorLocked: true, density: "equilibrada" })
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(current)))
        patch.mockImplementation(async (_url: string, body: Record<string, unknown>) => {
            current = { ...current, ...body }
            return ok(current)
        })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("maddox-density-chip")).toHaveTextContent("Narração equilibrada")
        const dialog = await openEdit()
        expect(within(dialog).getByRole("slider", { name: "Grau de rigor da campanha" })).toHaveAttribute("data-disabled")
        const slider = within(dialog).getByRole("slider", { name: "Densidade das narrações da campanha" })
        expect(slider).not.toHaveAttribute("data-disabled")
        fireEvent.keyDown(slider, { key: "ArrowRight" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Detalhada"))
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { density: "detalhada" }))
        await waitFor(() => expect(screen.getByTestId("maddox-density-chip")).toHaveTextContent("Narração detalhada"))
    })

    it("editar a dificuldade dos combates (DND-42) com a campanha em andamento envia só combatDifficulty; o chip mostra o passo", async () => {
        let current = detail({ status: "active", rigor: "rigoroso", rigorLocked: true, combatDifficulty: "equilibrado" })
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(current)))
        patch.mockImplementation(async (_url: string, body: Record<string, unknown>) => {
            current = { ...current, ...body }
            return ok(current)
        })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("maddox-combat-difficulty-chip")).toHaveTextContent("Combate equilibrado")
        const dialog = await openEdit()
        const slider = within(dialog).getByRole("slider", { name: "Dificuldade dos combates da campanha" })
        expect(slider).not.toHaveAttribute("data-disabled")
        fireEvent.keyDown(slider, { key: "End" })
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuetext", "Mortal"))
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { combatDifficulty: "mortal" }))
        await waitFor(() => expect(screen.getByTestId("maddox-combat-difficulty-chip")).toHaveTextContent("Combate mortal"))
    })

    it("dificuldade dos combates (DND-42): grau sem combate tático não mostra o chip nem o card na edição", async () => {
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(detail({ rigor: "narrativo", combatDifficulty: "facil" }))))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("maddox-density-chip")).toBeInTheDocument()
        expect(screen.queryByTestId("maddox-combat-difficulty-chip")).not.toBeInTheDocument()
        const dialog = await openEdit()
        expect(within(dialog).queryByRole("slider", { name: "Dificuldade dos combates da campanha" })).not.toBeInTheDocument()
    })

    it("nível inicial: chip no lobby; o dono muda pelo Select glass antes de começar (PATCH só com startingLevel)", async () => {
        ownerDetail({ rigor: "fiel-dnd", status: "interview", rigorLocked: true, startingLevel: 3 })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("starting-level-chip")).toHaveTextContent("Nível inicial 3")
        const dialog = await openEdit()
        const field = within(dialog).getByTestId("starting-level-field")
        expect(field).toHaveTextContent("Fichas já criadas mantêm o nível delas.")
        const trigger = within(field).getByRole("combobox", { name: "Nível inicial" })
        expect(trigger).toHaveTextContent("Nível 3")
        fireEvent.keyDown(trigger, { key: "Enter" })
        const options = await screen.findAllByRole("option")
        expect(options).toHaveLength(20)
        fireEvent.click(screen.getByRole("option", { name: "Nível 5" }))
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(patch).toHaveBeenCalledWith("/maddox/campaigns/c1", { startingLevel: 5 }))
    })

    it("nível inicial: some com a campanha em andamento e nos graus narrativos; o estágio narrativo vira o chip", async () => {
        ownerDetail({ rigor: "fiel-dnd", status: "active", rigorLocked: true, startingLevel: 3 })
        const view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const dialog = await openEdit()
        expect(within(dialog).queryByTestId("starting-level-field")).not.toBeInTheDocument()
        view.unmount()
        ownerDetail({ rigor: "narrativo", status: "lobby", startingLevel: null, startingStage: "caçadores recém-iniciados" })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        // Estágio narrativo (texto do modelo): linha própria, inteira e com quebra de linha — sem chip nem reticências.
        const stage = await screen.findByTestId("starting-stage")
        expect(stage).toHaveTextContent("Estágio inicial: caçadores recém-iniciados")
        expect(stage.className).toContain("whitespace-normal")
        expect(stage.className).not.toContain("truncate")
        expect(screen.queryByTestId("starting-level-chip")).not.toBeInTheDocument()
        const narrative = await openEdit()
        expect(within(narrative).queryByTestId("starting-level-field")).not.toBeInTheDocument()
    })

    it("povos e classes do mundo (Maddox 8): aparecem no lobby só quando o cenário gravou alguma lista", async () => {
        ownerDetail({ rigor: "fiel-dnd", worldCatalog: { races: [{ id: "r1", name: "Humano" }, { id: "r2", name: "Anão" }], classes: [] } })
        const view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("world-catalog-races")).toHaveTextContent("Povos deste mundo: Humano, Anão")
        expect(screen.queryByTestId("world-catalog-classes")).not.toBeInTheDocument()
        view.unmount()
        ownerDetail({ rigor: "fiel-dnd", worldCatalog: { races: [], classes: [] } })
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByRole("heading", { name: "Brumas de Valdrenn" })).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByTestId("world-catalog")).not.toBeInTheDocument())
    })

    it("editar sem alterações fecha sem chamar a API", async () => {
        ownerDetail()
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const dialog = await openEdit()
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(patch).not.toHaveBeenCalled()
    })

    it("não há edição de nome e retrato; personagem sem nome aparece como 'Personagem em criação'", async () => {
        const draft = { id: "ch1", name: "", portraitUrl: null, portraitStatus: null, interviewStatus: "in-progress" as const, profile: {}, sheetSlug: null }
        const players = detail().members.map((item) => (item.id === "m2" ? { ...item, userId: "u-owner", character: draft } : { ...item, userId: "u-dono" }))
        get.mockResolvedValue(ok(detail({ myRole: "player", myMemberId: "m2", myCharacter: draft, members: players, scenarioStatus: "done" })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const row = (await screen.findByText("Personagem em criação")).closest("li")!
        expect(within(row).getByRole("link", { name: /Entrevista do personagem/ })).toHaveAttribute("href", "/campanhas/c1/entrevista/personagem")
        expect(screen.queryByRole("button", { name: /Editar personagem/ })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Criar personagem/ })).not.toBeInTheDocument()
    })

    it("retrato: gerando mostra o aviso; pronto vira o avatar (sem iniciais); falhou oferece 'Gerar retrato de novo'", async () => {
        const base = { id: "ch1", name: "Lyra Ventobravo", portraitUrl: null as string | null, portraitStatus: "generating" as "generating" | "failed" | "done", interviewStatus: "done" as const, profile: {}, sheetSlug: null }
        const withCharacter = (character: typeof base) => {
            const members = detail().members.map((item) => (item.id === "m2" ? { ...item, userId: "u-owner", character, ready: true } : { ...item, userId: "u-dono" }))
            return detail({ myRole: "player", myMemberId: "m2", myCharacter: character, members, scenarioStatus: "done" })
        }
        get.mockResolvedValue(ok(withCharacter(base)))
        let view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("portrait-generating")).toHaveTextContent("Gerando retrato…")
        expect(screen.queryByRole("button", { name: /Gerar retrato/ })).not.toBeInTheDocument()
        view.unmount()

        get.mockResolvedValue(ok(withCharacter({ ...base, portraitStatus: "done", portraitUrl: "/api/upload?key=lyra.png" })))
        view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const row = (await screen.findByText("Lyra Ventobravo")).closest("li")!
        expect(row).toBeTruthy()
        expect(screen.queryByTestId("portrait-generating")).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Gerar retrato/ })).not.toBeInTheDocument()
        view.unmount()

        get.mockResolvedValue(ok(withCharacter({ ...base, portraitStatus: "failed" })))
        post.mockResolvedValue(ok(withCharacter({ ...base, portraitStatus: "generating" })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: /Gerar retrato de novo/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/character/portrait", {}))
    })

    it("campanha que não é minha: 404 vira 'Campanha não encontrada'", async () => {
        get.mockRejectedValue(Object.assign(new Error("404"), { isAxiosError: true, response: { status: 404, data: { success: false, error: "Campanha não encontrada" } } }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByText("Campanha não encontrada")).toBeInTheDocument()
    })
})

describe("convite", () => {
    const preview = { campaignId: "c1", name: "Brumas de Valdrenn", rigor: "equilibrado" as const, status: "lobby" as const, coverUrl: null, ownerName: "Marina Dona", memberCount: 2, alreadyMember: false, inviteOpen: true }

    it("mostra a campanha e entra", async () => {
        get.mockResolvedValue(ok(preview))
        post.mockResolvedValue(ok({ campaignId: "c1" }))
        renderWithQueryClient(<InviteAcceptPage token={TOKEN} />)
        expect(await screen.findByText("Marina Dona convidou você para a campanha")).toBeInTheDocument()
        expect(screen.getByText("2 participante(s)", { exact: false })).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: /Entrar na campanha/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith(`/maddox/campaigns/invites/${TOKEN}`))
        await waitFor(() => expect(push).toHaveBeenCalledWith("/campanhas/c1"))
    })

    it("quem já participa vê 'abrir campanha' em vez de entrar", async () => {
        get.mockResolvedValue(ok({ ...preview, alreadyMember: true }))
        renderWithQueryClient(<InviteAcceptPage token={TOKEN} />)
        fireEvent.click(await screen.findByRole("button", { name: "Você já participa: abrir campanha" }))
        expect(screen.queryByRole("button", { name: /Entrar na campanha/ })).not.toBeInTheDocument()
        expect(push).toHaveBeenCalledWith("/campanhas/c1")
        expect(post).not.toHaveBeenCalled()
    })

    it("campanha encerrada não oferece a entrada", async () => {
        get.mockResolvedValue(ok({ ...preview, status: "ended", inviteOpen: false }))
        renderWithQueryClient(<InviteAcceptPage token={TOKEN} />)
        expect(await screen.findByText("Esta campanha não aceita novos jogadores.")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Entrar na campanha/ })).not.toBeInTheDocument()
    })

    it("link inválido explica o motivo", async () => {
        get.mockRejectedValue(Object.assign(new Error("404"), { isAxiosError: true, response: { status: 404, data: { success: false, error: "Convite inválido ou expirado. Peça um link novo ao dono da campanha." } } }))
        renderWithQueryClient(<InviteAcceptPage token={TOKEN} />)
        expect(await screen.findByText("Convite indisponível")).toBeInTheDocument()
        expect(screen.getByText(/Convite inválido ou expirado/)).toBeInTheDocument()
    })
})

describe("lobby com as entrevistas (Maddox 2)", () => {
    const invite = (url: string, body: unknown) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : url.endsWith("/journal") ? ok(emptyJournal()) : ok(body))
    const lyra = (over: Partial<NonNullable<MaddoxCampaignMemberDto["character"]>> = {}) => ({ id: "ch1", name: "Lyra", portraitUrl: null, portraitStatus: null, interviewStatus: "pending" as const, profile: {}, sheetSlug: null, ...over })

    it("dono com o cenário pendente vê a chamada para a entrevista de cenário", async () => {
        get.mockImplementation(async (url: string) => invite(url, detail()))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const link = await screen.findByRole("link", { name: /Começar entrevista de cenário/ })
        expect(link).toHaveAttribute("href", "/campanhas/c1/entrevista/cenario")
    })

    it("dono com a entrevista começada vê 'Continuar'", async () => {
        get.mockImplementation(async (url: string) => invite(url, detail({ status: "interview", scenarioStatus: "in-progress", rigorLocked: true })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByRole("link", { name: /Continuar entrevista de cenário/ })).toBeInTheDocument()
    })

    it("jogador aguarda o cenário: a entrevista do personagem fica desabilitada", async () => {
        const members = detail().members.map((item) => (item.id === "m2" ? { ...item, character: lyra() } : item))
        get.mockResolvedValue(ok(detail({ myRole: "player", myMemberId: "m2", myCharacter: lyra(), members })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByText(/Aguardando Marina Dona definir o cenário com o Maddox/)).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /Entrevista do personagem/ })).toBeDisabled()
        expect(screen.queryByRole("link", { name: /entrevista de cenário/ })).not.toBeInTheDocument()
    })

    it("cenário pronto: o card mostra o tutorial da mesa (sem o texto do cenário, que fica no Diário) e libera a entrevista do personagem", async () => {
        const members = detail().members.map((item) => (item.id === "m2" ? { ...item, character: lyra() } : item))
        get.mockImplementation(async (url: string) => invite(url, detail({ myRole: "player", myMemberId: "m2", myCharacter: lyra(), members, scenarioStatus: "done", setting: "## Universo e referências\nAethra", openingSituation: "Numa taverna." })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("table-tutorial")).toBeInTheDocument()
        expect(screen.queryByText("Aethra")).not.toBeInTheDocument()
        expect(screen.queryByText("Numa taverna.")).not.toBeInTheDocument()
        expect(screen.getByTestId("campaign-scenario-link")).toHaveAttribute("href", "/campanhas/c1/diario")
        expect(screen.getByRole("link", { name: /Entrevista do personagem/ })).toHaveAttribute("href", "/campanhas/c1/entrevista/personagem")
        const row = within(screen.getByRole("list", { name: "Participantes" })).getByText("Lyra").closest("li")!
        expect(within(row).getByText("Entrevista pendente")).toBeInTheDocument()
        expect(screen.getByText(/0 de 2 participante\(s\) prontos para jogar/)).toBeInTheDocument()
    })

    it("entrevista concluída: selo de pronto, 'Ver perfil' com as seções e o link da ficha (só para o dono do personagem)", async () => {
        const done = lyra({ interviewStatus: "done", profile: { identidade: "Elfa de olhos cinzentos", origem: "Órfã do porto" }, sheetSlug: "ana/lyra" })
        const members = detail().members.map((item) => (item.id === "m2" ? { ...item, character: done, ready: true } : item))
        get.mockImplementation(async (url: string) => invite(url, detail({ myRole: "player", myMemberId: "m2", myCharacter: done, members, scenarioStatus: "done", setting: "Aethra" })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const list = await screen.findByRole("list", { name: "Participantes" })
        const row = within(list).getByText("Lyra").closest("li")!
        const chip = within(row).getByText("Entrevista concluída")
        expect(sameColor(chip.style.color, rarityColors.legendary)).toBe(true)
        expect(within(row).getByLabelText("Pronto para jogar")).toBeInTheDocument()
        expect(within(row).queryByRole("link", { name: /Entrevista do personagem/ })).not.toBeInTheDocument()
        expect(screen.getByText(/1 de 2 participante\(s\) prontos para jogar/)).toBeInTheDocument()

        fireEvent.click(within(row).getByRole("button", { name: /Ver perfil/ }))
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).getByText("Identidade e aparência")).toBeInTheDocument()
        expect(within(dialog).getByText("Elfa de olhos cinzentos")).toBeInTheDocument()
        expect(within(dialog).getByRole("link", { name: /Abrir ficha do D&D/ })).toHaveAttribute("href", "/sheets/ana/lyra")
    })

    it("o perfil de outro jogador não mostra o link da ficha", async () => {
        const done = lyra({ interviewStatus: "done", profile: { identidade: "Elfa" }, sheetSlug: "ana/lyra" })
        const members = detail().members.map((item) => (item.id === "m2" ? { ...item, character: done, ready: true } : item))
        get.mockImplementation(async (url: string) => invite(url, detail({ members, scenarioStatus: "done", setting: "Aethra" })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: /Ver perfil/ }))
        const dialog = await screen.findByRole("dialog")
        expect(within(dialog).getByText("Elfa")).toBeInTheDocument()
        expect(within(dialog).queryByRole("link", { name: /Abrir ficha/ })).not.toBeInTheDocument()
    })

    it("as telas das campanhas não usam abas do core, select nem checkbox nativos", async () => {
        const { readdirSync, readFileSync } = await import("node:fs")
        const { join } = await import("node:path")
        const dir = join(process.cwd(), "src/features/maddox/components/campaigns")
        for (const file of readdirSync(dir)) {
            const source = readFileSync(join(dir, file), "utf8")
            expect(source, file).not.toMatch(/@\/core\/ui\/tabs/)
            expect(source, file).not.toMatch(/<select[\s>]/)
            expect(source, file).not.toMatch(/type=["']checkbox["']/)
        }
    })
})

describe("lobby com a mesa (Maddox 3)", () => {
    const invite = (url: string, body: unknown) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : url.endsWith("/journal") ? ok(emptyJournal()) : ok(body))
    const ready = (name: string) => ({ id: `ch-${name}`, name, portraitUrl: null, portraitStatus: "done" as const, interviewStatus: "done" as const, profile: {}, sheetSlug: null })
    const readyMembers = () => detail().members.map((item) => ({ ...item, character: ready(item.id === "m1" ? "Kael" : "Lyra"), ready: true }))

    it("dono com o cenário e a própria entrevista prontos inicia a campanha com confirmação e vai para a mesa", async () => {
        get.mockImplementation(async (url: string) => invite(url, detail({ scenarioStatus: "done", members: readyMembers() })))
        post.mockResolvedValue(ok({ campaignId: "c1", status: "active" }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: /Iniciar campanha/ }))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText(/Jogam 2 participante\(s\) pronto\(s\)/)).toBeInTheDocument()
        fireEvent.click(within(dialog).getByRole("button", { name: "Iniciar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/start"))
        await waitFor(() => expect(push).toHaveBeenCalledWith("/campanhas/c1/mesa"))
    })

    it("sem o cenário ou sem a entrevista do dono, o botão fica desabilitado com o motivo", async () => {
        get.mockImplementation(async (url: string) => invite(url, detail()))
        const view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const button = await screen.findByRole("button", { name: /Iniciar campanha/ })
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute("title", "Conclua a entrevista de cenário com o Maddox")
        view.unmount()

        get.mockImplementation(async (url: string) => invite(url, detail({ scenarioStatus: "done" })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const again = await screen.findByRole("button", { name: /Iniciar campanha/ })
        expect(again).toBeDisabled()
        expect(again).toHaveAttribute("title", "Conclua a sua entrevista de personagem")
    })

    it("jogador não vê 'Iniciar campanha'; em andamento, todos veem 'Entrar na mesa' e o turno", async () => {
        get.mockImplementation(async (url: string) => invite(url, detail({ myRole: "player", myMemberId: "m2", scenarioStatus: "done", members: readyMembers() })))
        const view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        await screen.findByRole("list", { name: "Participantes" })
        expect(screen.queryByRole("button", { name: /Iniciar campanha/ })).not.toBeInTheDocument()
        // Diário da campanha (Maddox 9): só depois que a campanha começa.
        expect(screen.queryByRole("link", { name: /Diário/ })).not.toBeInTheDocument()
        view.unmount()

        get.mockImplementation(async (url: string) => invite(url, detail({ status: "active", turnNumber: 3, turnPhase: "players", scenarioStatus: "done", rigorLocked: true, members: readyMembers() })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByRole("link", { name: /Entrar na mesa/ })).toHaveAttribute("href", "/campanhas/c1/mesa")
        expect(screen.getByRole("link", { name: /Diário/ })).toHaveAttribute("href", "/campanhas/c1/diario")
        expect(screen.getByTestId("campaign-active-banner")).toHaveTextContent("Em andamento · Turno 3 · Turno dos jogadores")
        expect(screen.queryByRole("button", { name: /Iniciar campanha/ })).not.toBeInTheDocument()
    })
})
