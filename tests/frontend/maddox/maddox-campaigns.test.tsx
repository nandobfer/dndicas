/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxCampaignDetailDto, MaddoxCampaignListItemDto, MaddoxCampaignMemberDto } from "@/features/maddox/campaign-types"
import { rarityColors } from "@/lib/config/colors"

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
    ownerId: "u-owner",
    ownerName: "Marina Dona",
    myRole: "owner",
    myCharacter: null,
    members: [member("m1", "u-owner", "Marina Dona", "owner"), member("m2", "u-ana", "Ana Jogadora", "player", { id: "ch1", name: "Lyra", portraitUrl: null, interviewStatus: "pending", profile: {}, sheetSlug: null })],
    turnNumber: 0,
    scenarioStatus: "pending",
    createdAt: "2026-10-30T10:00:00.000Z",
    updatedAt: new Date().toISOString(),
    ...over,
})

const detail = (over: Partial<MaddoxCampaignDetailDto> = {}): MaddoxCampaignDetailDto => ({ ...listItem(), myMemberId: "m1", inviteOpen: true, setting: "", openingSituation: "", rigorLocked: false, ...over })

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

describe("lista de campanhas", () => {
    it("um card por campanha, com cores de raridade e link para a página da campanha", async () => {
        get.mockResolvedValue(ok([listItem(), listItem({ id: "c2", name: "Mar de Cinzas", rigor: "narrativo", status: "active", myRole: "player", ownerName: "Ana" })]))
        renderWithQueryClient(<CampaignsPage />)

        const first = await screen.findByRole("link", { name: "Abrir a campanha Brumas de Valdrenn" })
        expect(first).toHaveAttribute("href", "/campanhas/c1")
        expect(screen.getByRole("link", { name: "Abrir a campanha Mar de Cinzas" })).toHaveAttribute("href", "/campanhas/c2")
        expect(sameColor(within(first).getByText("Fiel ao D&D").style.color, rarityColors.legendary)).toBe(true)
        expect(within(first).getByText("Dono")).toBeInTheDocument()
        expect(within(first).getByText("Você ainda não criou seu personagem")).toBeInTheDocument()
        const second = screen.getByRole("link", { name: "Abrir a campanha Mar de Cinzas" })
        expect(sameColor(within(second).getByText("Narrativo").style.color, rarityColors.common)).toBe(true)
        expect(within(second).getByText("Jogador")).toBeInTheDocument()
        expect(get).toHaveBeenCalledWith("/maddox/campaigns")
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

        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        expect(await screen.findByText(/ao menos 3 caracteres/)).toBeInTheDocument()
        expect(post).not.toHaveBeenCalled()

        fireEvent.change(screen.getByLabelText("Nome da campanha"), { target: { value: "Nova Mesa" } })
        fireEvent.click(screen.getByRole("button", { name: "Criar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns", { name: "Nova Mesa", rigor: "fiel-dnd" }))
        await waitFor(() => expect(push).toHaveBeenCalledWith("/campanhas/c9/entrevista/cenario"))
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

    it("cria o esboço do próprio personagem", async () => {
        get.mockImplementation(async (url: string) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(detail())))
        put.mockResolvedValue(ok(detail({ myCharacter: { id: "ch2", name: "Thorin", portraitUrl: null, interviewStatus: "pending", profile: {}, sheetSlug: null } })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: /Criar personagem/ }))
        fireEvent.change(await screen.findByLabelText("Nome do personagem"), { target: { value: "Thorin" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar personagem" }))
        await waitFor(() => expect(put).toHaveBeenCalledWith("/maddox/campaigns/c1/character", { name: "Thorin", portraitUrl: null }))
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

    it("editar sem alterações fecha sem chamar a API", async () => {
        ownerDetail()
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const dialog = await openEdit()
        fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
        expect(patch).not.toHaveBeenCalled()
    })

    it("editar o personagem existente vem pré-preenchido e salva o mesmo personagem", async () => {
        const lyra = { id: "ch1", name: "Lyra", portraitUrl: null, interviewStatus: "pending" as const, profile: {}, sheetSlug: null }
        put.mockResolvedValue(ok(detail({ myRole: "player", myMemberId: "m2", myCharacter: { ...lyra, name: "Lyra Ventobravo" } })))
        // A tela identifica o "você" pelo userId do useAuth (u-owner): o membro com personagem passa a ser o usuário logado.
        const players = detail().members.map((item) => (item.id === "m2" ? { ...item, userId: "u-owner" } : { ...item, userId: "u-dono" }))
        get.mockResolvedValue(ok(detail({ myRole: "player", myMemberId: "m2", myCharacter: lyra, members: players })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: /Editar personagem/ }))
        const name = (await screen.findByLabelText("Nome do personagem")) as HTMLInputElement
        expect(name.value).toBe("Lyra")
        expect(screen.getByText("Editar personagem", { selector: "h2" })).toBeInTheDocument()
        fireEvent.change(name, { target: { value: "Lyra Ventobravo" } })
        fireEvent.click(screen.getByRole("button", { name: "Salvar personagem" }))
        await waitFor(() => expect(put).toHaveBeenCalledWith("/maddox/campaigns/c1/character", { name: "Lyra Ventobravo", portraitUrl: null }))
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
    const invite = (url: string, body: unknown) => (url.endsWith("/invite") ? ok({ token: TOKEN, rotatedAt: null }) : ok(body))
    const lyra = (over: Partial<NonNullable<MaddoxCampaignMemberDto["character"]>> = {}) => ({ id: "ch1", name: "Lyra", portraitUrl: null, interviewStatus: "pending" as const, profile: {}, sheetSlug: null, ...over })

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

    it("cenário pronto: mostra o cenário salvo e libera a entrevista do personagem", async () => {
        const members = detail().members.map((item) => (item.id === "m2" ? { ...item, character: lyra() } : item))
        get.mockResolvedValue(ok(detail({ myRole: "player", myMemberId: "m2", myCharacter: lyra(), members, scenarioStatus: "done", setting: "## Universo e referências\nAethra", openingSituation: "Numa taverna." })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByText("Aethra")).toBeInTheDocument()
        expect(screen.getByText("Numa taverna.")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /Entrevista do personagem/ })).toHaveAttribute("href", "/campanhas/c1/entrevista/personagem")
        const row = within(screen.getByRole("list", { name: "Participantes" })).getByText("Lyra").closest("li")!
        expect(within(row).getByText("Entrevista pendente")).toBeInTheDocument()
        expect(screen.getByText(/0 de 2 participante\(s\) prontos para jogar/)).toBeInTheDocument()
    })

    it("entrevista concluída: selo de pronto, 'Ver perfil' com as seções e o link da ficha (só para o dono do personagem)", async () => {
        const done = lyra({ interviewStatus: "done", profile: { identidade: "Elfa de olhos cinzentos", origem: "Órfã do porto" }, sheetSlug: "ana/lyra" })
        const members = detail().members.map((item) => (item.id === "m2" ? { ...item, character: done, ready: true } : item))
        get.mockResolvedValue(ok(detail({ myRole: "player", myMemberId: "m2", myCharacter: done, members, scenarioStatus: "done", setting: "Aethra" })))
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
