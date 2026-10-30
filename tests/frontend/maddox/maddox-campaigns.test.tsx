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
    members: [member("m1", "u-owner", "Marina Dona", "owner"), member("m2", "u-ana", "Ana Jogadora", "player", { id: "ch1", name: "Lyra", portraitUrl: null, interviewStatus: "pending" })],
    turnNumber: 0,
    createdAt: "2026-10-30T10:00:00.000Z",
    updatedAt: new Date().toISOString(),
    ...over,
})

const detail = (over: Partial<MaddoxCampaignDetailDto> = {}): MaddoxCampaignDetailDto => ({ ...listItem(), myMemberId: "m1", inviteOpen: true, ...over })

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
        await waitFor(() => expect(push).toHaveBeenCalledWith("/campanhas/c9"))
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
        expect(screen.getByText(/1 de 2 participante\(s\) já criaram o personagem/)).toBeInTheDocument()

        const link = await screen.findByLabelText("Link de convite")
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
        put.mockResolvedValue(ok(detail({ myCharacter: { id: "ch2", name: "Thorin", portraitUrl: null, interviewStatus: "pending" } })))
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
