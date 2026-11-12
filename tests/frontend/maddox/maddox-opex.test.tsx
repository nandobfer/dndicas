/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxCampaignDetailDto, MaddoxCampaignMemberDto } from "@/features/maddox/campaign-types"
import type { MaddoxGameParticipantDto, MaddoxGameStateDto } from "@/features/maddox/game-types"
import type { MaddoxOpexDraftDto, MaddoxOpexInterviewStateDto } from "@/features/maddox/interview-types"

/** Telas dos Personagens Opex (DND-26): lobby, painel de aprovação (modo ao vivo) e as regras da faixa e da mesa. */

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/campanhas/c1" }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-owner", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post, put: vi.fn(), patch: vi.fn(), delete: del } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })

const owner: MaddoxCampaignMemberDto = { id: "m1", userId: "u-owner", kind: "human", opex: null, name: "Marina Dona", username: "marina", avatarUrl: null, role: "owner", joinedAt: "2026-10-30T10:00:00.000Z", character: { id: "ch1", name: "Kael", portraitUrl: null, portraitStatus: null, interviewStatus: "done", profile: {}, sheetSlug: null }, ready: true }
const opexMember = (over: Partial<MaddoxCampaignMemberDto> = {}): MaddoxCampaignMemberDto => ({
    id: "m9",
    userId: "opex:m9",
    kind: "opex",
    opex: { interviewMode: "autonomous", status: "interviewing", error: null, prompt: "" },
    name: "Personagem Opex",
    username: null,
    avatarUrl: null,
    role: "player",
    joinedAt: "2026-10-30T10:00:00.000Z",
    character: { id: "ch9", name: "", portraitUrl: null, portraitStatus: null, interviewStatus: "in-progress", profile: {}, sheetSlug: null },
    ready: false,
    ...over,
})

const detail = (over: Partial<MaddoxCampaignDetailDto> = {}): MaddoxCampaignDetailDto => ({
    id: "c1",
    name: "Brumas",
    rigor: "fiel-dnd",
    status: "lobby",
    coverUrl: null,
    ownerId: "u-owner",
    ownerName: "Marina Dona",
    myRole: "owner",
    myCharacter: owner.character,
    members: [owner],
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
    updatedAt: new Date().toISOString(),
    myMemberId: "m1",
    inviteOpen: true,
    setting: "",
    openingSituation: "",
    rigorLocked: true,
    canAddOpex: true,
    ...over,
})

const { CampaignPage } = await import("@/features/maddox/components/campaigns/CampaignPage")
const { OpexInterviewPage } = await import("@/features/maddox/components/interviews/OpexInterviewPage")
const { OpexDraftPanel } = await import("@/features/maddox/components/interviews/OpexDraftPanel")
const { opexActingView, opexBannerText, seatStatus, turnProgress, composerBlockReason } = await import("@/features/maddox/game-view")
const { GameMessageList } = await import("@/features/maddox/components/game/GameMessageList")
const { TurnPanel } = await import("@/features/maddox/components/game/TurnPanel")

function serve(campaign: MaddoxCampaignDetailDto) {
    get.mockImplementation(async (url: string) => {
        if (url.endsWith("/invite")) return ok({ token: "a".repeat(43), rotatedAt: null })
        if (url.includes("/journal")) return { data: { success: false, error: "sem diário" } }
        return ok(campaign)
    })
}

beforeEach(() => {
    for (const fn of [get, post, del]) fn.mockReset()
})

describe("lobby com Personagens Opex", () => {
    it("o dono com a permissão adiciona um Personagem Opex com prompt base e modo", async () => {
        serve(detail())
        post.mockResolvedValue(ok(detail()))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: /Adicionar Personagem Opex/ }))
        const dialog = await screen.findByRole("dialog")
        fireEvent.change(within(dialog).getByLabelText("Prompt base (opcional)"), { target: { value: "Uma clériga anã." } })
        fireEvent.click(within(dialog).getByRole("button", { name: "Ao vivo" }))
        expect(within(dialog).getByTestId("opex-mode-hint")).toHaveTextContent(/só segue ao Maddox depois que você aprova/)
        fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/opex", { prompt: "Uma clériga anã.", interviewMode: "live" }))
    })

    it("sem a permissão (ou para o jogador), o botão não aparece; antes do cenário fica desabilitado", async () => {
        serve(detail({ canAddOpex: false }))
        const view = renderWithQueryClient(<CampaignPage campaignId="c1" />)
        await screen.findByRole("list", { name: "Participantes" })
        expect(screen.queryByRole("button", { name: /Adicionar Personagem Opex/ })).toBeNull()
        view.unmount()
        serve(detail({ scenarioStatus: "in-progress" }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        expect(await screen.findByRole("button", { name: /Adicionar Personagem Opex/ })).toBeDisabled()
    })

    it("mostra o chip Opex e a situação: entrevistando, aguardando aprovação (com link) e falha com \"Tentar de novo\"", async () => {
        serve(
            detail({
                members: [
                    owner,
                    opexMember(),
                    opexMember({ id: "m10", opex: { interviewMode: "live", status: "awaiting-approval", error: null, prompt: "" } }),
                    opexMember({ id: "m11", opex: { interviewMode: "autonomous", status: "failed", error: "O provedor não respondeu.", prompt: "" } }),
                ],
            }),
        )
        post.mockResolvedValue(ok(detail()))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        const list = await screen.findByRole("list", { name: "Participantes" })
        expect(within(list).getAllByTestId("opex-chip")).toHaveLength(3)
        const statuses = within(list).getAllByTestId("opex-status")
        expect(statuses.map((item) => item.getAttribute("data-status"))).toEqual(["interviewing", "awaiting-approval", "failed"])
        expect(within(statuses[1]!).getByText("Aguardando sua aprovação")).toBeInTheDocument()
        expect(within(statuses[1]!).getByRole("link", { name: "Continuar" })).toHaveAttribute("href", "/campanhas/c1/entrevista/opex/m10")
        expect(within(statuses[2]!).getByText("O provedor não respondeu.")).toBeInTheDocument()
        fireEvent.click(within(statuses[2]!).getByRole("button", { name: /Tentar de novo/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/opex/m11/interview/retry", {}))
    })

    it("o dono remove o Personagem Opex com confirmação", async () => {
        serve(detail({ members: [owner, opexMember({ character: { ...opexMember().character!, name: "Brunna" } })] }))
        del.mockResolvedValue(ok({ left: false }))
        renderWithQueryClient(<CampaignPage campaignId="c1" />)
        fireEvent.click(await screen.findByRole("button", { name: "Remover Personagem Opex" }))
        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText(/Remover Brunna\?/)).toBeInTheDocument()
        expect(within(dialog).getByText(/memórias individuais dele são arquivadas/)).toBeInTheDocument()
        fireEvent.click(within(dialog).getByRole("button", { name: /Remover/ }))
        await waitFor(() => expect(del).toHaveBeenCalledWith("/maddox/campaigns/c1/members/m9"))
    })
})

describe("painel de aprovação (modo ao vivo)", () => {
    const draft = (over: Partial<MaddoxOpexDraftDto> = {}): MaddoxOpexDraftDto => ({ id: "d1", status: "ready", kind: "message", content: "Sou Brunna.", payload: null, guidance: null, error: null, createdAt: "2026-11-01T00:00:00.000Z", ...over })

    it("aprovar, editar e aprovar, e gerar outra com orientação", () => {
        const onApprove = vi.fn()
        const onRegenerate = vi.fn()
        render(<OpexDraftPanel draft={draft()} abilityCard={null} rolls={null} color="#3b82f6" busy={false} regenerating={false} onApprove={onApprove} onRegenerate={onRegenerate} />)
        expect(screen.getByText("Sou Brunna.")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: /^Aprovar$/ }))
        expect(onApprove).toHaveBeenLastCalledWith({})
        fireEvent.click(screen.getByRole("button", { name: /Editar e aprovar/ }))
        fireEvent.change(screen.getByLabelText("Editar a resposta"), { target: { value: "Sou Brunna, de Karak." } })
        fireEvent.click(screen.getByRole("button", { name: /Aprovar editada/ }))
        expect(onApprove).toHaveBeenLastCalledWith({ content: "Sou Brunna, de Karak." })
        fireEvent.change(screen.getByLabelText("Orientação ao Personagem Opex"), { target: { value: "seja mais desconfiada" } })
        fireEvent.click(screen.getByRole("button", { name: /Gerar outra resposta/ }))
        expect(onRegenerate).toHaveBeenCalledWith("seja mais desconfiada")
    })

    it("card de PV proposto: mostra as escolhas e permite editar antes de aprovar", () => {
        const onApprove = vi.fn()
        render(<OpexDraftPanel draft={draft({ kind: "hit-points", content: "", payload: { escolhas: { "2": "media", "3": "rolagem" } } })} abilityCard={null} rolls={null} color="#3b82f6" busy={false} regenerating={false} onApprove={onApprove} onRegenerate={vi.fn()} />)
        expect(screen.getByTestId("opex-draft-hit-points")).toHaveTextContent("Nível 3Rolar vida")
        fireEvent.click(screen.getByRole("button", { name: /Editar e aprovar/ }))
        fireEvent.click(screen.getAllByRole("button", { name: "Média" })[1]!)
        fireEvent.click(screen.getByRole("button", { name: /Aprovar editada/ }))
        expect(onApprove).toHaveBeenCalledWith({ escolhas: { "2": "media", "3": "media" } })
    })

    it("gerando e falha", () => {
        const view = render(<OpexDraftPanel draft={draft({ status: "generating" })} abilityCard={null} rolls={null} color="#3b82f6" busy={false} regenerating={false} onApprove={vi.fn()} onRegenerate={vi.fn()} />)
        expect(screen.getByTestId("opex-draft-generating")).toHaveTextContent("pensando")
        view.unmount()
        render(<OpexDraftPanel draft={draft({ status: "failed", error: "Sem resposta." })} abilityCard={null} rolls={null} color="#3b82f6" busy={false} regenerating={false} onApprove={vi.fn()} onRegenerate={vi.fn()} />)
        expect(screen.getByRole("alert")).toHaveTextContent("Sem resposta.")
    })
})

describe("regras da mesa com Personagens Opex", () => {
    const participant = (over: Partial<MaddoxGameParticipantDto>): MaddoxGameParticipantDto => ({ memberId: "m1", userId: "u1", name: "Ana", characterName: "Lyra", portraitUrl: null, role: "player", ready: true, eligible: true, declared: false, ...over })
    const state = (opexActor: MaddoxGameStateDto["turn"]["opexActor"]) => ({ status: "active" as const, turn: { number: 2, phase: "players" as const, startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [], opexActor }, me: { memberId: "m1", isOwner: true, ready: true, eligible: true, declared: false, sheet: null } })
    const presence = { available: true, online: new Set(["u1"]) }

    it("o Opex nunca aparece offline, não conta na faixa dos humanos e a vez dele não vira situação de assento (DND-45)", () => {
        const opex = participant({ memberId: "m9", userId: "opex:m9", opex: true })
        expect(seatStatus(opex, state(null), presence)).toBe("waiting")
        expect(seatStatus(opex, state({ memberId: "m9", characterName: "Tork", failed: false, error: null, combat: false }), presence)).toBe("waiting")
        expect(seatStatus({ ...opex, declared: true }, state({ memberId: "m9", characterName: "Tork", failed: true, error: "x", combat: false }), presence)).toBe("declared")
        expect(turnProgress({ participants: [participant({}), opex] }, presence)).toEqual({ declared: 0, total: 1 })
    })

    it("faixa: quem está agindo; com falha, o dono escolhe e os outros aguardam", () => {
        expect(opexBannerText(state({ memberId: "m9", characterName: "Tork", failed: false, error: null, combat: false }))).toBe("Personagens Opex agindo — vez de Tork")
        expect(opexBannerText(state({ memberId: "m9", characterName: "Tork", failed: true, error: "provedor fora", combat: false }))).toContain("escolha Tentar de novo ou Pular")
        expect(opexBannerText({ ...state({ memberId: "m9", characterName: "Tork", failed: true, error: null, combat: false }), me: { isOwner: false } })).toContain("aguardando o dono da campanha")
        expect(composerBlockReason({ ...state({ memberId: "m9", characterName: "Tork", failed: false, error: null, combat: false }), me: { ...state(null).me, declared: false } } as never)).toBe("Os Personagens Opex estão agindo. Aguarde a narração do Maddox.")
        expect(opexBannerText(state(null))).toBeNull()
    })
})

describe("vez do Personagem Opex no chat (DND-45)", () => {
    const opex: MaddoxGameParticipantDto = { memberId: "m9", userId: "opex:m9", name: "Personagem Opex", characterName: "Tork", portraitUrl: "https://img/tork.png", role: "player", ready: true, eligible: true, declared: false, opex: true }
    const human: MaddoxGameParticipantDto = { memberId: "m1", userId: "u-owner", name: "Marina Dona", characterName: "Kael", portraitUrl: null, role: "owner", ready: true, eligible: true, declared: false }
    const actor = (over: Partial<NonNullable<MaddoxGameStateDto["turn"]["opexActor"]>> = {}) => ({ memberId: "m9", characterName: "Tork", failed: false, error: null, combat: false, ...over })
    const gameState = (opexActor: MaddoxGameStateDto["turn"]["opexActor"], over: Partial<MaddoxGameStateDto> = {}) =>
        ({
            campaignId: "c1",
            status: "active",
            turn: { number: 2, phase: "players", startedAt: null, generating: false, failed: false, awaitingChecks: false, pendingChecks: [], opexActor },
            participants: [human, opex],
            me: { memberId: "m1", isOwner: true, ready: true, eligible: true, declared: true, sheet: null },
            ...over,
        }) as MaddoxGameStateDto
    const list = (props: Partial<Parameters<typeof GameMessageList>[0]> = {}) => <GameMessageList messages={[]} myMemberId="m1" maddoxAvatarUrl={null} color="#3b82f6" narrating={false} hasMore={false} loadingMore={false} onLoadMore={vi.fn()} {...props} />

    it("opexActingView: o Opex da vez (inclusive no combate tático), com o retrato; nada em falha, no turno do mestre ou fora do jogo", () => {
        expect(opexActingView(gameState(actor()))).toEqual({ memberId: "m9", characterName: "Tork", portraitUrl: "https://img/tork.png" })
        expect(opexActingView(gameState(actor({ combat: true })))).toEqual({ memberId: "m9", characterName: "Tork", portraitUrl: "https://img/tork.png" })
        expect(opexActingView(gameState(actor({ failed: true, error: "x" })))).toBeNull()
        expect(opexActingView(gameState(actor(), { turn: { ...gameState(null).turn, phase: "master", opexActor: actor() } }))).toBeNull()
        expect(opexActingView(gameState(actor(), { status: "paused" as MaddoxGameStateDto["status"] }))).toBeNull()
        expect(opexActingView(gameState(null))).toBeNull()
    })

    it("o chat mostra um único balão \"agindo…\", que troca de personagem e some quando a vez passa", () => {
        const view = render(list({ opexActing: { memberId: "m9", characterName: "Tork", portraitUrl: null } }))
        const bubble = screen.getByTestId("opex-acting")
        expect(bubble).toHaveTextContent("Tork está agindo…")
        expect(within(bubble).getByTestId("opex-chip")).toBeInTheDocument()
        expect(within(bubble).getByRole("status")).toBeInTheDocument()
        view.rerender(list({ opexActing: { memberId: "m9", characterName: "Tork", portraitUrl: null } }))
        expect(screen.getAllByTestId("opex-acting")).toHaveLength(1)
        view.rerender(list({ opexActing: { memberId: "m8", characterName: "Brunna", portraitUrl: null } }))
        expect(screen.getAllByTestId("opex-acting")).toHaveLength(1)
        expect(screen.getByTestId("opex-acting")).toHaveTextContent("Brunna está agindo…")
        view.rerender(list({ opexActing: null, narrating: true }))
        expect(screen.queryByTestId("opex-acting")).not.toBeInTheDocument()
        expect(screen.getByTestId("maddox-writing")).toHaveTextContent("O Maddox está narrando…")
    })

    it("o diário (só leitura) nunca mostra o balão", () => {
        render(list({ readOnly: true, opexActing: { memberId: "m9", characterName: "Tork", portraitUrl: null } }))
        expect(screen.queryByTestId("opex-acting")).not.toBeInTheDocument()
    })

    it("a lateral não mostra chip de situação para o Personagem Opex; o humano mantém o dele e o dono segue podendo pular o Opex", () => {
        const presence = { available: true, online: new Set(["u-owner"]) }
        const view = render(<TurnPanel state={gameState(actor())} presence={presence} color="#3b82f6" skipping={false} onSkip={vi.fn()} />)
        const opexSeat = screen.getByTestId("seat-m9")
        for (const label of ["Agindo…", "Aguardando", "Parado: aguardando o dono", "Declarou"]) expect(opexSeat).not.toHaveTextContent(label)
        expect(within(opexSeat).getByRole("button", { name: "Pular Tork" })).toBeInTheDocument()
        expect(screen.getByTestId("seat-m1")).toHaveTextContent("Aguardando")
        view.rerender(<TurnPanel state={gameState(actor({ failed: true, error: "x" }))} presence={presence} color="#3b82f6" skipping={false} onSkip={vi.fn()} />)
        expect(screen.getByTestId("seat-m9")).not.toHaveTextContent("Parado")
    })
})

describe("página da entrevista do Personagem Opex", () => {
    const msg = (id: string, role: "maddox" | "user", content: string, proposal = false) => ({ id, role, content, proposal, error: null, createdAt: "2026-11-01T00:00:00.000Z" })
    const view = (over: Partial<MaddoxOpexInterviewStateDto> & { messages?: ReturnType<typeof msg>[]; interviewStatus?: "in-progress" | "proposed" | "done"; draft?: MaddoxOpexDraftDto | null } = {}): MaddoxOpexInterviewStateDto => ({
        interview: { id: "i1", campaignId: "c1", kind: "character", status: over.interviewStatus ?? "in-progress", scriptVersion: 0, messages: over.messages ?? [msg("a", "maddox", "Quem é você?")], generating: false, abilityRolls: null, opexDraft: over.draft ?? null, completedAt: null },
        maddoxAvatarUrl: null,
        memberId: "m9",
        characterName: "Brunna",
        interviewMode: over.interviewMode ?? "live",
        status: over.status ?? "awaiting-approval",
        error: over.error ?? null,
        prompt: "",
    })
    const ready: MaddoxOpexDraftDto = { id: "d1", status: "ready", kind: "message", content: "Sou Brunna.", payload: null, guidance: null, error: null, createdAt: "2026-11-01T00:00:00.000Z" }
    const serveInterview = (data: MaddoxOpexInterviewStateDto) => get.mockImplementation(async (url: string) => (url.endsWith("/interview") ? ok(data) : ok(detail())))

    it("autônoma: só leitura, sem painel de aprovação", async () => {
        serveInterview(view({ interviewMode: "autonomous", status: "interviewing", messages: [msg("a", "maddox", "Quem é você?"), msg("b", "user", "Sou Brunna.")] }))
        renderWithQueryClient(<OpexInterviewPage campaignId="c1" memberId="m9" />)
        expect(await screen.findByText(/Entrevista autônoma em andamento/)).toBeInTheDocument()
        expect(screen.getByText("Sou Brunna.")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /^Aprovar$/ })).toBeNull()
    })

    it("ao vivo com rascunho: o painel de aprovação aparece e aprova pela rota", async () => {
        serveInterview(view({ draft: ready }))
        renderWithQueryClient(<OpexInterviewPage campaignId="c1" memberId="m9" />)
        expect(await screen.findByRole("button", { name: /^Aprovar$/ })).toBeInTheDocument()
        expect(screen.getByText("Sou Brunna.")).toBeInTheDocument()
    })

    it("ao vivo na síntese: confirma ou pede ajuste; com o ajuste gerado, o painel de aprovação substitui o card", async () => {
        const messages = [msg("a", "maddox", "Quem é você?"), msg("b", "user", "Sou Brunna."), msg("c", "maddox", "Síntese: Brunna. Confirma?", true)]
        let data = view({ interviewStatus: "proposed", messages })
        get.mockImplementation(async (url: string) => (url.endsWith("/interview") ? ok(data) : ok(detail())))
        post.mockImplementation(async (url: string) => {
            if (url.endsWith("/draft/regenerate")) {
                data = view({ interviewStatus: "proposed", messages, draft: { ...ready, content: "Quero que ela seja de Karak.", guidance: "cidade natal" } })
                return ok(data)
            }
            return ok(detail())
        })
        renderWithQueryClient(<OpexInterviewPage campaignId="c1" memberId="m9" />)
        expect(await screen.findByRole("button", { name: /Confirmar e concluir/ })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /^Aprovar$/ })).toBeNull()
        fireEvent.change(screen.getByLabelText("Pedir um ajuste"), { target: { value: "cidade natal" } })
        fireEvent.click(screen.getByRole("button", { name: "Pedir ajuste" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/opex/m9/interview/draft/regenerate", { orientacao: "cidade natal" }))
        expect(await screen.findByRole("button", { name: /^Aprovar$/ })).toBeInTheDocument()
        expect(screen.getByText("Quero que ela seja de Karak.")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /Confirmar e concluir/ })).toBeNull()
    })

    it("falha: mostra o motivo e \"Tentar de novo\" chama a rota", async () => {
        serveInterview(view({ status: "failed", error: "O provedor não respondeu." }))
        post.mockResolvedValue(ok(detail()))
        renderWithQueryClient(<OpexInterviewPage campaignId="c1" memberId="m9" />)
        const alert = await screen.findByText("O provedor não respondeu.")
        fireEvent.click(within(alert.closest("[role=alert]") as HTMLElement).getByRole("button", { name: /Tentar de novo/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/opex/m9/interview/retry", {}))
    })
})
