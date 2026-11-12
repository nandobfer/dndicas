/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxCampaignDetailDto, MaddoxCampaignMemberDto } from "@/features/maddox/campaign-types"
import type { MaddoxCampaignStatus } from "@/features/maddox/constants"

/**
 * Reiniciar a campanha na tela da campanha (DND-50): o botão só para o dono e só nas fases aceitas, o diálogo com os textos
 * exatos, "Iniciar campanha" bloqueado durante o ajuste das fichas, o aviso de falha com "Tentar de novo" e o aviso vindo
 * da mesa (`?aviso=reiniciada`).
 */

const get = vi.fn()
const post = vi.fn()

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/campanhas/c1" }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-owner", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })

const member = (id: string, userId: string, name: string, role: "owner" | "player", characterName: string): MaddoxCampaignMemberDto => ({
    id,
    userId,
    name,
    username: null,
    avatarUrl: null,
    role,
    joinedAt: "2026-10-30T10:00:00.000Z",
    character: { id: `ch-${id}`, name: characterName, portraitUrl: null, portraitStatus: "done", interviewStatus: "done", profile: {}, sheetSlug: null },
    ready: true,
})

const detail = (over: Partial<MaddoxCampaignDetailDto> = {}): MaddoxCampaignDetailDto => ({
    id: "c1",
    name: "Brumas de Valdrenn",
    rigor: "equilibrado",
    status: "active",
    coverUrl: null,
    ownerId: "u-owner",
    ownerName: "Marina Dona",
    myRole: "owner",
    myCharacter: null,
    members: [member("m1", "u-owner", "Marina Dona", "owner", "Thalia"), member("m2", "u-ana", "Ana Jogadora", "player", "Lyra")],
    turnNumber: 4,
    turnPhase: "players",
    startedAt: "2026-11-01T10:00:00.000Z",
    scenarioStatus: "done",
    showCheckDc: false,
    sceneImages: true,
    hidePlayerActions: false,
    showEnemyHp: false,
    showAllyHp: false,
    density: "equilibrada",
    combatDifficulty: "equilibrado",
    startingLevel: 1,
    startingStage: "",
    worldCatalog: { races: [], classes: [] },
    createdAt: "2026-10-30T10:00:00.000Z",
    updatedAt: "2026-11-11T10:00:00.000Z",
    myMemberId: "m1",
    inviteOpen: true,
    setting: "",
    openingSituation: "",
    rigorLocked: true,
    canReset: true,
    resetting: false,
    sheetRestores: [],
    ...over,
})

const { CampaignPage } = await import("@/features/maddox/components/campaigns/CampaignPage")

const serve = (campaign: MaddoxCampaignDetailDto) =>
    get.mockImplementation(async (url: string) => {
        if (url.endsWith("/invite")) return ok({ token: "a".repeat(43), rotatedAt: null })
        if (url.includes("/journal")) return Promise.reject({ response: { status: 404 } })
        return ok(campaign)
    })

beforeEach(() => {
    get.mockReset()
    post.mockReset()
})

afterEach(() => {
    window.history.replaceState(null, "", "/")
})

describe("botão Reiniciar campanha", () => {
    it.each(["active", "paused", "ended", "archived"] as MaddoxCampaignStatus[])("aparece para o dono com a campanha %s", async (status) => {
        serve(detail({ status }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByRole("button", { name: "Reiniciar campanha" })).toBeInTheDocument()
    })

    it("não aparece para o jogador nem quando o servidor não libera (lobby/entrevista)", async () => {
        serve(detail({ myRole: "player", myMemberId: "m2", canReset: false }))
        const view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        await screen.findByRole("list", { name: "Participantes" })
        expect(screen.queryByRole("button", { name: "Reiniciar campanha" })).not.toBeInTheDocument()
        view.unmount()

        serve(detail({ status: "lobby", canReset: false }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        await screen.findByRole("button", { name: /Iniciar campanha/ })
        expect(screen.queryByRole("button", { name: "Reiniciar campanha" })).not.toBeInTheDocument()
    })

    it("pede confirmação com os textos exatos; Cancelar não chama nada e confirmar reinicia", async () => {
        serve(detail())
        post.mockResolvedValue(ok(detail({ status: "lobby", canReset: false, turnNumber: 0 })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: "Reiniciar campanha" }))

        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText("Reiniciar campanha?")).toBeInTheDocument()
        expect(
            within(dialog).getByText(
                "A história jogada, o diário, os NPCs, os combates, as imagens de cena e as memórias da campanha serão apagados. Os personagens voltam à ficha do fim da entrevista. Membros, cenário e configurações são mantidos. Essa ação não pode ser desfeita.",
            ),
        ).toBeInTheDocument()
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }))
        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
        expect(post).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole("button", { name: "Reiniciar campanha" }))
        serve(detail({ status: "lobby", canReset: false, turnNumber: 0 }))
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reiniciar campanha" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/reset", {}))
        await waitFor(() => expect(screen.queryByRole("button", { name: "Reiniciar campanha" })).not.toBeInTheDocument())
    })
})

describe("depois do reinício", () => {
    it("Iniciar campanha fica desabilitado com a dica enquanto o Maddox ajusta as fichas", async () => {
        serve(detail({ status: "lobby", canReset: false, sheetRestores: [{ characterId: "ch-m2", characterName: "Lyra", status: "pending" }] }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const start = await screen.findByRole("button", { name: /Iniciar campanha/ })
        expect(start).toBeDisabled()
        expect(start).toHaveAttribute("title", "O Maddox está ajustando as fichas.")
        expect(screen.getByTestId("sheet-restore-pending")).toHaveTextContent("O Maddox está ajustando as fichas.")
    })

    it("com a limpeza em andamento, o início também fica bloqueado", async () => {
        serve(detail({ status: "lobby", canReset: false, resetting: true }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByRole("button", { name: /Iniciar campanha/ })).toHaveAttribute("title", "O reinício da campanha ainda está em andamento.")
    })

    it("falha do ajuste: o dono vê o aviso com Tentar de novo, que refaz só aquele personagem; o início fica liberado", async () => {
        serve(detail({ status: "lobby", canReset: false, sheetRestores: [{ characterId: "ch-m2", characterName: "Lyra", status: "failed" }] }))
        post.mockResolvedValue(ok(detail({ status: "lobby", canReset: false, sheetRestores: [{ characterId: "ch-m2", characterName: "Lyra", status: "pending" }] })))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const alert = await screen.findByTestId("sheet-restore-failed")
        expect(alert).toHaveTextContent("O Maddox não conseguiu ajustar a ficha de Lyra. A ficha ficou como estava.")
        expect(screen.getByRole("button", { name: /Iniciar campanha/ })).not.toBeDisabled()
        fireEvent.click(within(alert).getByRole("button", { name: /Tentar de novo/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/reset/sheets/ch-m2", {}))
    })

    it("o aviso vindo da mesa aparece uma vez e sai da URL", async () => {
        window.history.replaceState(null, "", "/campanhas/c1?aviso=reiniciada")
        serve(detail({ status: "lobby", canReset: false, myRole: "player", myMemberId: "m2" }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByTestId("campaign-reset-notice")).toHaveTextContent("O dono reiniciou a campanha.")
        await waitFor(() => expect(window.location.search).toBe(""))
        expect(window.location.pathname).toBe("/campanhas/c1")
    })

    it("sem o parâmetro, não há aviso", async () => {
        serve(detail({ status: "lobby", canReset: false }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        await screen.findByRole("list", { name: "Participantes" })
        expect(screen.queryByTestId("campaign-reset-notice")).not.toBeInTheDocument()
    })
})
