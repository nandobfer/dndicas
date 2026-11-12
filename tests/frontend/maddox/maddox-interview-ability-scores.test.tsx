/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxCampaignDetailDto, MaddoxCampaignMemberDto } from "@/features/maddox/campaign-types"
import type { MaddoxInterviewDto, MaddoxInterviewMessageDto, MaddoxInterviewStreamLine } from "@/features/maddox/interview-types"

const push = vi.fn()
const get = vi.fn()
const post = vi.fn()

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/campanhas/c1/entrevista/cenario" }))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-owner", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: (props: {
        preset?: { terms?: { dice: string; quantity: number }[] } | null
        disableRolling?: boolean
        disabledRollingMessage?: string | null
        rollButtonLabel?: string
        rollRequest?: (input: unknown) => Promise<unknown>
        onRollResolved?: (result: unknown) => void
    }) => (
        <div data-testid="fake-dice-panel" data-dice={props.preset?.terms?.map((term) => `${term.quantity}${term.dice}`).join("+")}>
            <button
                type="button"
                disabled={props.disableRolling}
                onClick={async () => {
                    const result = await props.rollRequest?.({ terms: props.preset?.terms })
                    props.onRollResolved?.(result)
                }}
            >
                {props.rollButtonLabel ?? "JOGAR"}
            </button>
            {props.disabledRollingMessage}
        </div>
    ),
}))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })

const member = (id: string, userId: string, name: string, role: "owner" | "player", character: MaddoxCampaignMemberDto["character"] = null): MaddoxCampaignMemberDto => ({
    id,
    userId,
    name,
    username: name.toLowerCase(),
    avatarUrl: null,
    role,
    joinedAt: "2026-10-30T10:00:00.000Z",
    character,
    ready: false,
})

const campaign = (over: Partial<MaddoxCampaignDetailDto> = {}): MaddoxCampaignDetailDto => ({
    id: "c1",
    name: "Brumas de Valdrenn",
    rigor: "equilibrado",
    status: "interview",
    coverUrl: null,
    ownerId: "u-owner",
    ownerName: "Marina Dona",
    myRole: "owner",
    myCharacter: null,
    members: [member("m1", "u-owner", "Marina", "owner")],
    turnNumber: 0,
    turnPhase: "master",
    startedAt: null,
    scenarioStatus: "in-progress",
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
    setting: "",
    openingSituation: "",
    rigorLocked: true,
    ...over,
})

const msg = (id: string, role: "maddox" | "user", content: string, over: Partial<MaddoxInterviewMessageDto> = {}): MaddoxInterviewMessageDto => ({ id, role, content, proposal: false, error: null, createdAt: "2026-10-30T10:00:00.000Z", ...over })

const interview = (over: Partial<MaddoxInterviewDto> = {}): MaddoxInterviewDto => ({
    id: "i1",
    campaignId: "c1",
    kind: "scenario",
    status: "in-progress",
    scriptVersion: 1,
    messages: [msg("a1", "maddox", "Que **universo** você imagina?")],
    generating: false,
    completedAt: null,
    ...over,
})

function mockGets(detail: MaddoxCampaignDetailDto, state: MaddoxInterviewDto | null) {
    get.mockImplementation(async (url: string) => (url.includes("/interviews/") ? ok({ interview: state, maddoxAvatarUrl: null }) : ok(detail)))
}

/** `fetch` com corpo NDJSON controlado pelo teste (linha a linha). */
function streamFetch() {
    const encoder = new TextEncoder()
    type Chunk = { value?: Uint8Array; done: boolean } | { error: Error }
    type Waiter = { resolve: (value: { value?: Uint8Array; done: boolean }) => void; reject: (error: Error) => void }
    const queue: Waiter[] = []
    const pending: Chunk[] = []
    const settle = (waiter: Waiter, chunk: Chunk) => ("error" in chunk ? waiter.reject(chunk.error) : waiter.resolve(chunk))
    const push = (chunk: Chunk) => {
        const waiter = queue.shift()
        if (waiter) settle(waiter, chunk)
        else pending.push(chunk)
    }
    const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/x-ndjson; charset=utf-8" }),
        body: {
            getReader: () => ({
                read: () =>
                    new Promise<{ value?: Uint8Array; done: boolean }>((resolve, reject) => {
                        if (pending.length) settle({ resolve, reject }, pending.shift()!)
                        else queue.push({ resolve, reject })
                    }),
            }),
        },
        json: async () => null,
    }))
    vi.stubGlobal("fetch", fetchMock)
    return {
        fetchMock,
        send: (line: MaddoxInterviewStreamLine) => push({ value: encoder.encode(`${JSON.stringify(line)}\n`), done: false }),
        end: () => push({ done: true }),
        /** A conexão cai no meio do stream (o servidor já gravou a resposta). */
        drop: () => push({ error: new TypeError("network error") }),
    }
}

const { InterviewPage } = await import("@/features/maddox/components/interviews/InterviewPage")

const lyra = { id: "ch1", name: "Lyra", portraitUrl: null, portraitStatus: null, interviewStatus: "in-progress" as const, profile: {}, sheetSlug: null }
const characterCampaign = (over: Partial<MaddoxCampaignDetailDto> = {}) => campaign({ rigor: "fiel-dnd", myRole: "player", status: "lobby", scenarioStatus: "done", myCharacter: lyra, ...over })
const SCORES = { strength: 8, dexterity: 17, constitution: 12, intelligence: 14, wisdom: 9, charisma: 12 }
const pendingCard = (over: Partial<NonNullable<MaddoxInterviewMessageDto["abilityScores"]>> = {}) => ({ status: "pending" as const, method: null, base: null, prefill: null, bonus: null, final: null, reason: "Hora dos atributos", submittedAt: null, ...over })
const withCard = (card: MaddoxInterviewMessageDto["abilityScores"], over: Partial<MaddoxInterviewDto> = {}) =>
    interview({ kind: "character", messages: [msg("a1", "maddox", "Vamos aos **atributos**."), msg("a2", "maddox", "Escolha no card abaixo.", { abilityScores: card })], ...over })
const rolls = (scores: number[], sixth: number | null = null, invalid = false) => ({ rolls: scores.map((score) => ({ dice: [6, 6, 6, 1], score })), sixth, invalid })

const card = () => screen.findByTestId("ability-scores-card")
const pick = (container: HTMLElement, label: string) => fireEvent.click(within(container).getByRole("button", { name: label }))

beforeEach(() => {
    for (const fn of [push, get, post]) fn.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("card de atributos da entrevista (Maddox 5)", () => {
    it("aparece abaixo da fala que o abriu, com os três métodos; conjunto padrão não repete valores e envia com confirmação", async () => {
        mockGets(characterCampaign(), withCard(pendingCard()))
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        const section = await card()
        expect(section).toHaveAttribute("data-status", "pending")
        expect(within(section).getByText("Hora dos atributos")).toBeInTheDocument()
        for (const label of ["Conjunto padrão", "Compra de pontos", "Rolagem"]) expect(within(section).getByRole("button", { name: label })).toBeInTheDocument()
        const send = within(section).getByRole("button", { name: /Enviar atributos/ })
        expect(send).toBeDisabled()

        const order: [keyof typeof SCORES, string][] = [["strength", "15"], ["dexterity", "14"], ["constitution", "13"], ["intelligence", "12"], ["wisdom", "10"], ["charisma", "8"]]
        pick(screen.getByTestId("ability-standard-strength"), "15")
        // O 15 já usado some das outras linhas.
        expect(within(screen.getByTestId("ability-standard-dexterity")).queryByRole("button", { name: "15" })).toBeNull()
        for (const [attr, value] of order.slice(1)) pick(screen.getByTestId(`ability-standard-${attr}`), value)
        expect(screen.getByTestId("ability-preview-strength")).toHaveTextContent("15")
        expect(send).toBeEnabled()
        fireEvent.click(send)
        fireEvent.click(await screen.findByRole("button", { name: "Enviar" }))
        await waitFor(() => expect(stream.fetchMock).toHaveBeenCalled())
        const [url, init] = stream.fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toContain("/api/maddox/campaigns/c1/interviews/character/ability-scores")
        expect(JSON.parse(String(init.body))).toEqual({ method: "standard", scores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 } })
        act(() => stream.send({ type: "delta", text: "Belos números!" }))
        expect(await screen.findByText("Belos números!")).toBeInTheDocument()
        act(() => stream.end())
    })

    it("compra de pontos mostra o saldo N/27 e trava os botões nos limites", async () => {
        mockGets(characterCampaign(), withCard(pendingCard()))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        const section = await card()
        pick(section, "Compra de pontos")
        expect(screen.getByTestId("point-buy-remaining")).toHaveTextContent("Pontos disponíveis: 27/27")
        expect(screen.getByRole("button", { name: "Diminuir Força" })).toBeDisabled()
        for (let index = 0; index < 7; index++) fireEvent.click(screen.getByRole("button", { name: "Aumentar Força" }))
        expect(screen.getByTestId("point-buy-strength")).toHaveTextContent("15")
        expect(screen.getByRole("button", { name: "Aumentar Força" })).toBeDisabled()
        expect(screen.getByTestId("point-buy-remaining")).toHaveTextContent("Pontos disponíveis: 18/27")
        // Todos em 8 já é um envio válido (custo 0).
        expect(within(section).getByRole("button", { name: /Enviar atributos/ })).toBeEnabled()
    })

    it("rolagem: o painel rola 4d6 pela rota da entrevista, as pontuações aparecem e a sexta é calculada; depois distribui", async () => {
        let state = withCard(pendingCard(), { abilityRolls: rolls([17, 14, 12, 9]) })
        mockGets(characterCampaign(), state)
        post.mockImplementation(async (url: string) => {
            expect(url).toBe("/maddox/campaigns/c1/interviews/character/ability-scores/roll")
            state = { ...state, abilityRolls: rolls([17, 14, 12, 9, 12], 8) }
            return ok({ roll: { rollId: "r5", terms: [{ dice: "d6", quantity: 4, results: [6, 5, 1, 1] }] }, interview: state })
        })
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        const section = await card()
        pick(section, "Rolagem")
        expect(screen.getByTestId("fake-dice-panel")).toHaveAttribute("data-dice", "4d6")
        expect(screen.getByTestId("ability-roll-scores")).toHaveTextContent("1714129")
        expect(screen.getByText(/Faça 1 rolagem\(ns\) de 4d6/)).toBeInTheDocument()
        expect(screen.queryByTestId("ability-roll-assign")).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Rolar 4d6" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/interviews/character/ability-scores/roll", {}))
        await waitFor(() => expect(screen.getByTestId("ability-roll-scores")).toHaveTextContent("1714129128"))
        expect(screen.getByRole("button", { name: "Rolar 4d6" })).toBeDisabled()
        expect(screen.queryByRole("button", { name: /Reiniciar/ })).toBeNull()
        const assign = await screen.findByTestId("ability-roll-assign")
        expect(within(assign).getByTestId("ability-roll-strength")).toBeInTheDocument()
    })

    it("sexta pontuação inválida: aviso e 'Reiniciar' (só nesse caso)", async () => {
        mockGets(characterCampaign(), withCard(pendingCard(), { abilityRolls: rolls([18, 18, 18, 18, 18], null, true) }))
        post.mockResolvedValue(ok({ interview: withCard(pendingCard(), { abilityRolls: null }) }))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        pick(await card(), "Rolagem")
        expect(screen.getByRole("alert")).toHaveTextContent("A sexta pontuação ficou fora do intervalo 3-18")
        fireEvent.click(screen.getByRole("button", { name: /Reiniciar/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/interviews/character/ability-scores/reset", {}))
    })

    it("reaberto pelo Maddox: vem preenchido com o método e os valores atuais", async () => {
        mockGets(characterCampaign(), withCard(pendingCard({ prefill: { method: "point-buy", base: { strength: 15, dexterity: 15, constitution: 15, intelligence: 8, wisdom: 8, charisma: 8 } } })))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        await card()
        expect(screen.getByText("O Maddox reabriu o card com os valores atuais.")).toBeInTheDocument()
        expect(screen.getByTestId("point-buy-strength")).toHaveTextContent("15")
        expect(screen.getByTestId("point-buy-remaining")).toHaveTextContent("0/27")
    })

    it("enviado fica travado com base, bônus e final; o substituído mostra 'Reaberto abaixo'", async () => {
        const bonus = { background: "Criminoso", parts: { dexterity: 2, intelligence: 1 } }
        const submitted = { status: "submitted" as const, method: "roll" as const, base: SCORES, prefill: null, bonus, final: { ...SCORES, dexterity: 19, intelligence: 15 }, reason: null, submittedAt: "2026-10-30T10:05:00.000Z" }
        mockGets(characterCampaign(), withCard(submitted))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        const section = await card()
        expect(section).toHaveAttribute("data-status", "submitted")
        expect(within(section).getByText("Rolagem")).toBeInTheDocument()
        expect(within(section).queryByRole("button", { name: /Enviar atributos/ })).toBeNull()
        expect(screen.getByTestId("ability-final-dexterity")).toHaveTextContent("19")
        expect(screen.getByTestId("ability-final-dexterity")).toHaveTextContent("17 +2")
        expect(screen.getByTestId("ability-bonus-note")).toHaveTextContent("Bônus do antecedente (Criminoso): Destreza +2, Inteligência +1")
        expect(within(section).queryByText("Reaberto abaixo")).toBeNull()
    })

    it("o card substituído mostra 'Reaberto abaixo' e o novo fica pendente", async () => {
        const superseded = { status: "superseded" as const, method: "standard" as const, base: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }, prefill: null, bonus: null, final: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }, reason: null, submittedAt: null }
        mockGets(
            characterCampaign(),
            interview({ kind: "character", messages: [msg("a1", "maddox", "Card.", { abilityScores: superseded }), msg("a2", "maddox", "Reabri.", { abilityScores: pendingCard() })] }),
        )
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        await waitFor(() => expect(screen.getAllByTestId("ability-scores-card")).toHaveLength(2))
        const [old, current] = screen.getAllByTestId("ability-scores-card")
        expect(old).toHaveAttribute("data-status", "superseded")
        expect(within(old!).getByText("Reaberto abaixo")).toBeInTheDocument()
        expect(current).toHaveAttribute("data-status", "pending")
    })

    it("enquanto o Maddox responde, o card fica desabilitado", async () => {
        mockGets(characterCampaign(), withCard(pendingCard(), { generating: true }))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        const section = await card()
        expect(within(section).getByRole("button", { name: /Enviar atributos/ })).toBeDisabled()
        expect(within(screen.getByTestId("ability-standard-strength")).getByRole("button", { name: "15" })).toBeDisabled()
    })

    it("card de PV na conversa: rola o nível pela rota da entrevista e envia as escolhas pelo stream", async () => {
        const hitPoints = { status: "pending" as const, level: 2, hitDie: "d10", constitutionModifier: 1, levelOne: 11, rows: [{ level: 2, average: 6, die: null, rolled: null }], choices: null, total: null, reason: null, submittedAt: null }
        const state = interview({ kind: "character", messages: [msg("a1", "maddox", "Seus PV:", { hitPoints })] })
        mockGets(characterCampaign(), state)
        post.mockImplementation(async () => ok({ roll: { rollId: "r1" }, interview: interview({ kind: "character", messages: [msg("a1", "maddox", "Seus PV:", { hitPoints: { ...hitPoints, rows: [{ level: 2, average: 6, die: 8, rolled: 9 }] } })] }) }))
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        const section = await screen.findByTestId("hit-points-card")
        fireEvent.click(within(screen.getByTestId("hit-points-row-2")).getByRole("button", { name: "Rolar vida" }))
        fireEvent.click(within(section).getByRole("button", { name: "Rolar vida do nível 2" }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/interviews/character/hit-points/roll", { nivel: 2 }))
        await waitFor(() => expect(screen.getByTestId("hit-points-total")).toHaveTextContent("PV máximo: 20"))
        fireEvent.click(screen.getByRole("button", { name: /Enviar pontos de vida/ }))
        fireEvent.click(await screen.findByRole("button", { name: "Enviar" }))
        await waitFor(() => expect(stream.fetchMock).toHaveBeenCalled())
        const [url, init] = stream.fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toContain("/api/maddox/campaigns/c1/interviews/character/hit-points")
        expect(JSON.parse(String(init.body))).toEqual({ escolhas: { "2": "rolagem" } })
        act(() => stream.end())
    })
})
