/** @vitest-environment happy-dom */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
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
    scenarioStatus: "in-progress",
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
    const queue: Array<(value: { value?: Uint8Array; done: boolean }) => void> = []
    const pending: Array<{ value?: Uint8Array; done: boolean }> = []
    const push = (chunk: { value?: Uint8Array; done: boolean }) => {
        const waiter = queue.shift()
        if (waiter) waiter(chunk)
        else pending.push(chunk)
    }
    const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/x-ndjson; charset=utf-8" }),
        body: { getReader: () => ({ read: () => new Promise<{ value?: Uint8Array; done: boolean }>((resolve) => (pending.length ? resolve(pending.shift()!) : queue.push(resolve))) }) },
        json: async () => null,
    }))
    vi.stubGlobal("fetch", fetchMock)
    return {
        fetchMock,
        send: (line: MaddoxInterviewStreamLine) => push({ value: encoder.encode(`${JSON.stringify(line)}\n`), done: false }),
        end: () => push({ done: true }),
    }
}

const { InterviewPage } = await import("@/features/maddox/components/interviews/InterviewPage")

beforeEach(() => {
    for (const fn of [push, get, post]) fn.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("entrevista de cenário", () => {
    it("antes de começar mostra a chamada; começar transmite a abertura do Maddox aos poucos", async () => {
        mockGets(campaign({ status: "lobby", scenarioStatus: "pending", rigorLocked: false }), null)
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        expect(await screen.findByText("Vamos criar o mundo da campanha")).toBeInTheDocument()
        expect(screen.getByText(/o grau de rigor fica travado/)).toBeInTheDocument()

        // Depois da abertura, a entrevista gravada passa a existir no servidor.
        mockGets(campaign(), interview({ messages: [msg("a1", "maddox", "Saudações, viajante. Que universo?")] }))
        fireEvent.click(screen.getByRole("button", { name: /Começar entrevista/ }))
        await waitFor(() => expect(stream.fetchMock).toHaveBeenCalledWith("/api/maddox/campaigns/c1/interviews/scenario", expect.objectContaining({ method: "POST" })))
        expect(await screen.findByText("Maddox está escrevendo…")).toBeInTheDocument()
        await act(async () => stream.send({ type: "delta", text: "Saudações, viajante. " }))
        expect(await screen.findByText(/Saudações, viajante\./)).toBeInTheDocument()
        await act(async () => stream.send({ type: "delta", text: "Que universo?" }))
        expect(await screen.findByText(/Saudações, viajante\. Que universo\?/)).toBeInTheDocument()

        await act(async () => {
            stream.send({ type: "done", message: msg("a1", "maddox", "Saudações, viajante. Que universo?"), interview: interview({ messages: [msg("a1", "maddox", "Saudações, viajante. Que universo?")] }) })
            stream.end()
        })
        await waitFor(() => expect(screen.queryByText("Maddox está escrevendo…")).not.toBeInTheDocument())
        expect(screen.getByRole("textbox", { name: "Sua resposta" })).not.toBeDisabled()
    })

    it("mostra a conversa (Markdown) e Enter envia a resposta; enquanto o Maddox responde o campo fica desabilitado", async () => {
        mockGets(campaign(), interview())
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const conversation = await screen.findByRole("list", { name: "Conversa com o Maddox" })
        expect(within(conversation).getByText("universo").tagName).toBe("STRONG")

        const box = screen.getByRole("textbox", { name: "Sua resposta" })
        fireEvent.change(box, { target: { value: "Fantasia sombria" } })
        fireEvent.keyDown(box, { key: "Enter" })
        await waitFor(() => expect(stream.fetchMock).toHaveBeenCalledWith("/api/maddox/campaigns/c1/interviews/scenario/messages", expect.objectContaining({ method: "POST", body: JSON.stringify({ content: "Fantasia sombria" }) })))
        expect(await within(conversation).findByText("Fantasia sombria")).toBeInTheDocument()
        expect(screen.getByRole("textbox", { name: "Sua resposta" })).toBeDisabled()
        await act(async () => stream.end())
    })

    it("Shift+Enter não envia", async () => {
        mockGets(campaign(), interview())
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const box = await screen.findByRole("textbox", { name: "Sua resposta" })
        fireEvent.change(box, { target: { value: "linha" } })
        fireEvent.keyDown(box, { key: "Enter", shiftKey: true })
        expect(stream.fetchMock).not.toHaveBeenCalled()
    })

    it("geração em andamento em outra aba desabilita o campo e mostra o indicador", async () => {
        mockGets(campaign(), interview({ generating: true }))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        expect(await screen.findByText("Maddox está escrevendo…")).toBeInTheDocument()
        expect(screen.getByRole("textbox", { name: "Sua resposta" })).toBeDisabled()
    })

    it("proposta: 'Confirmar e concluir' consolida (Consolidando…) e volta à campanha", async () => {
        mockGets(campaign({ scenarioStatus: "proposed" }), interview({ status: "proposed", messages: [msg("a1", "maddox", "Síntese do cenário. Confirma?", { proposal: true })] }))
        let resolve: (value: unknown) => void = () => undefined
        post.mockImplementation(() => new Promise((done) => (resolve = done)))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const card = await screen.findByRole("region", { name: "Proposta de conclusão" })
        expect(within(card).getByText("O cenário está pronto para ser salvo")).toBeInTheDocument()
        fireEvent.click(within(card).getByRole("button", { name: /Confirmar e concluir/ }))
        await waitFor(() => expect(post).toHaveBeenCalledWith("/maddox/campaigns/c1/interviews/scenario/complete"))
        expect(await within(card).findByRole("button", { name: /Consolidando…/ })).toBeDisabled()
        expect(screen.getByRole("textbox", { name: "Sua resposta" })).toBeDisabled()
        await act(async () => resolve(ok(campaign({ status: "lobby", scenarioStatus: "done" }))))
        await waitFor(() => expect(push).toHaveBeenCalledWith("/campanhas/c1"))
    })

    it("resposta com falha mostra o erro e 'Tentar de novo'", async () => {
        mockGets(campaign(), interview({ messages: [msg("a1", "maddox", "Olá"), msg("u1", "user", "Oi"), msg("a2", "maddox", "", { error: "Provedor inacessível" })] }))
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        expect(await screen.findByText(/O Maddox não conseguiu responder: Provedor inacessível/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }))
        await waitFor(() => expect(stream.fetchMock).toHaveBeenCalledWith("/api/maddox/campaigns/c1/interviews/scenario/retry", expect.objectContaining({ method: "POST" })))
        await act(async () => stream.end())
    })

    it("erro HTTP ao enviar devolve o texto ao campo", async () => {
        mockGets(campaign(), interview())
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ success: false, error: "O Maddox ainda está respondendo." }) })))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const box = await screen.findByRole("textbox", { name: "Sua resposta" })
        fireEvent.change(box, { target: { value: "Minha resposta" } })
        fireEvent.keyDown(box, { key: "Enter" })
        await waitFor(() => expect((screen.getByRole("textbox", { name: "Sua resposta" }) as HTMLTextAreaElement).value).toBe("Minha resposta"))
    })

    it("jogador não faz a entrevista de cenário", async () => {
        mockGets(campaign({ myRole: "player" }), null)
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        expect(await screen.findByText("Só o dono define o cenário")).toBeInTheDocument()
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    })

    it("concluída: mostra o cenário salvo", async () => {
        mockGets(campaign({ status: "lobby", scenarioStatus: "done", setting: "## Universo e referências\nAethra", openingSituation: "Numa taverna." }), interview({ status: "done" }))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        expect(await screen.findByText(/O cenário está salvo na campanha/)).toBeInTheDocument()
        expect(screen.getByText("Aethra")).toBeInTheDocument()
        expect(screen.getByText("Numa taverna.")).toBeInTheDocument()
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    })
})

describe("entrevista de personagem", () => {
    it("antes do cenário: aguardando", async () => {
        mockGets(campaign({ myRole: "player", scenarioStatus: "in-progress" }), null)
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        expect(await screen.findByText("Aguardando o cenário")).toBeInTheDocument()
    })

    it("sem personagem: pede para criar o esboço primeiro", async () => {
        mockGets(campaign({ myRole: "player", status: "lobby", scenarioStatus: "done" }), null)
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        expect(await screen.findByText("Crie o seu personagem primeiro")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Criar personagem" }))
        expect(await screen.findByLabelText("Nome do personagem")).toBeInTheDocument()
    })

    it("com personagem e rigor Equilibrado avisa que a ficha do D&D será preparada", async () => {
        const lyra = { id: "ch1", name: "Lyra", portraitUrl: null, interviewStatus: "pending" as const, profile: {}, sheetSlug: null }
        mockGets(campaign({ myRole: "player", status: "lobby", scenarioStatus: "done", myCharacter: lyra }), null)
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="character" />)
        expect(await screen.findByText("Vamos dar vida ao seu personagem")).toBeInTheDocument()
        expect(screen.getByText(/preparar a ficha do D&D/)).toBeInTheDocument()
    })
})

describe("controles do design system", () => {
    it("as telas da entrevista não usam abas do core, select nem checkbox nativos", () => {
        const dir = join(process.cwd(), "src/features/maddox/components/interviews")
        for (const file of readdirSync(dir)) {
            const source = readFileSync(join(dir, file), "utf8")
            expect(source, file).not.toMatch(/@\/core\/ui\/tabs/)
            expect(source, file).not.toMatch(/<select[\s>]/)
            expect(source, file).not.toMatch(/type=["']checkbox["']/)
        }
    })
})
