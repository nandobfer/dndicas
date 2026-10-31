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
const { toast } = await import("sonner")
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
        const conversation = await screen.findByRole("log", { name: "Conversa com o Maddox" })
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

    it("conexão que cai DEPOIS de o stream abrir não devolve o texto ao campo (a resposta já foi gravada)", async () => {
        mockGets(campaign(), interview())
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const box = await screen.findByRole("textbox", { name: "Sua resposta" })
        fireEvent.change(box, { target: { value: "Minha resposta" } })
        fireEvent.keyDown(box, { key: "Enter" })
        await act(async () => stream.send({ type: "user", message: msg("u1", "user", "Minha resposta") }))
        await act(async () => stream.send({ type: "delta", text: "Ótimo" }))
        // A conversa gravada (já com a resposta) vem do refetch depois da queda.
        mockGets(campaign(), interview({ messages: [msg("a1", "maddox", "Que **universo** você imagina?"), msg("u1", "user", "Minha resposta")], generating: true }))
        await act(async () => stream.drop())
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Sua resposta foi enviada")))
        expect((screen.getByRole("textbox", { name: "Sua resposta" }) as HTMLTextAreaElement).value).toBe("")
        expect(await screen.findByText("Minha resposta")).toBeInTheDocument()
    })

    it("recarregada no meio da geração e sem realtime, a tela destrava sozinha quando o servidor termina", async () => {
        let generating = true
        get.mockImplementation(async (url: string) =>
            url.includes("/interviews/")
                ? ok({ interview: generating ? interview({ generating: true }) : interview({ generating: false, messages: [msg("a1", "maddox", "Que **universo** você imagina?"), msg("a2", "maddox", "Resposta gravada no servidor.")] }), maddoxAvatarUrl: null })
                : ok(campaign()),
        )
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const box = await screen.findByRole("textbox", { name: "Sua resposta" })
        expect(box).toBeDisabled()
        generating = false
        await waitFor(() => expect(screen.getByRole("textbox", { name: "Sua resposta" })).not.toBeDisabled(), { timeout: 6000 })
        expect(screen.getByText("Resposta gravada no servidor.")).toBeInTheDocument()
    }, 10_000)

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

/** O happy-dom devolve a cor como foi escrita (hex); um navegador devolveria `rgb(...)`. */
const sameColor = (actual: string, hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16)
    return [hex.toLowerCase(), `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`].includes(actual.toLowerCase().replace(/\s+/g, " "))
}

describe("layout e estilo da conversa", () => {
    it("página em largura total (sem mx-auto/max-w) e painel com altura própria e rolagem interna", async () => {
        mockGets(campaign(), interview())
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const panel = await screen.findByTestId("interview-panel")
        const page = screen.getByTestId("interview-page")
        expect(page.className).not.toMatch(/mx-auto|max-w-/)
        expect(page.className).toContain("space-y-6")
        expect(panel.className).toMatch(/h-\[calc\(100dvh-18rem\)\]/)
        expect(panel.className).toContain("min-h-[420px]")
        const log = within(panel).getByRole("log", { name: "Conversa com o Maddox" })
        expect(log.className).toContain("overflow-y-auto")
        // O campo de resposta fica no rodapé do painel, depois da conversa.
        const composer = within(panel).getByRole("form", { name: "Responder ao Maddox" })
        expect(log.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("o texto que chega rola a conversa (não a janela); subir mostra 'Ir para o fim'", async () => {
        mockGets(campaign(), interview())
        const stream = streamFetch()
        const scrollTo = vi.fn()
        const original = HTMLElement.prototype.scrollTo
        HTMLElement.prototype.scrollTo = scrollTo as never
        const windowScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
        try {
            renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
            const log = await screen.findByRole("log", { name: "Conversa com o Maddox" })
            const box = screen.getByRole("textbox", { name: "Sua resposta" })
            fireEvent.change(box, { target: { value: "Oi" } })
            fireEvent.keyDown(box, { key: "Enter" })
            scrollTo.mockClear()
            await act(async () => stream.send({ type: "delta", text: "Um mundo" }))
            await waitFor(() => expect(scrollTo).toHaveBeenCalled())
            expect(scrollTo.mock.contexts.every((context) => context === log)).toBe(true)
            expect(windowScroll).not.toHaveBeenCalled()

            Object.defineProperty(log, "scrollHeight", { value: 2000, configurable: true })
            Object.defineProperty(log, "clientHeight", { value: 400, configurable: true })
            log.scrollTop = 100
            fireEvent.scroll(log)
            fireEvent.click(await screen.findByRole("button", { name: /Ir para o fim/ }))
            expect(scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: "smooth" })
            await act(async () => stream.end())
        } finally {
            HTMLElement.prototype.scrollTo = original
            windowScroll.mockRestore()
        }
    })

    it("campo de resposta no padrão do Opex: uma linha, botão redondo alinhado e a dica do teclado", async () => {
        mockGets(campaign(), interview())
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const box = await screen.findByTestId("interview-composer-box")
        expect(box.className).toContain("items-end")
        const textarea = within(box).getByRole("textbox", { name: "Sua resposta" })
        expect(textarea).toHaveAttribute("rows", "1")
        expect(textarea.className).toContain("p-0")
        const send = within(box).getByRole("button", { name: "Enviar resposta" })
        expect(send.className).toMatch(/h-8/)
        expect(send.className).toContain("rounded-full")
        expect(screen.getByText("Enter envia · Shift+Enter quebra linha")).toBeInTheDocument()
    })

    it("Markdown colorido como o Opex: negrito âmbar, citação, nome do Maddox na cor do rigor e balão sem fundo colorido", async () => {
        mockGets(campaign({ rigor: "equilibrado" }), interview({ messages: [msg("a1", "maddox", "### Universo\nO reino de **Aethra**.\n\n> Uma névoa cobre o porto.")] }))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const strong = await screen.findByText("Aethra")
        expect(strong.tagName).toBe("STRONG")
        expect(strong.className).toContain("text-md-strong")
        expect(screen.getByText("Uma névoa cobre o porto.").closest("blockquote")).not.toBeNull()
        expect(screen.getByText("Universo").className).toContain("text-md-heading")
        const message = screen.getByTestId("maddox-message")
        expect(message.querySelector("[style*='background-color']")).toBeNull()
        const { rigorColor } = await import("@/features/maddox/components/campaigns/campaign-visuals")
        expect(sameColor(within(message).getByTestId("maddox-name").style.color, rigorColor("equilibrado"))).toBe(true)
    })

    it("o texto do Maddox fica DENTRO da bolha e o avatar tem tamanho fixo (não estica com a fala)", async () => {
        mockGets(campaign({ rigor: "equilibrado" }), interview({ messages: [msg("a1", "maddox", "Primeiro parágrafo.\n\nSegundo parágrafo bem longo.")] }))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const message = await screen.findByTestId("maddox-message")
        expect(message.className).toContain("items-start")
        const bubble = within(message).getByTestId("maddox-bubble")
        expect(bubble).toContainElement(screen.getByText("Primeiro parágrafo."))
        expect(bubble).toContainElement(screen.getByText("Segundo parágrafo bem longo."))
        expect(bubble).toContainElement(within(message).getByTestId("maddox-name"))
        expect(bubble.className).toMatch(/\bborder\b/)
        expect(bubble.className).toContain("rounded-2xl")
        expect(bubble.className).toContain("bg-white/[0.03]")
        // O avatar é o único filho fora da bolha: tamanho fixo, alinhado ao topo; nenhum anel envolve o texto.
        const outside = [...message.children].filter((child) => child !== bubble)
        expect(outside).toHaveLength(1)
        expect(outside[0]!.className).toMatch(/\bh-7\b/)
        expect(outside[0]!.className).toMatch(/\bw-7\b/)
        expect(outside[0]!.className).toContain("self-start")
        expect(outside[0]!.className).toContain("shrink-0")
        expect(message.querySelector("[class*='ring-']")).toBeNull()
    })

    it("pontinhos e cursor ficam dentro da bolha; a citação do catálogo ao vivo aparece em negrito, nunca como {{", async () => {
        mockGets(campaign(), interview())
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const box = await screen.findByRole("textbox", { name: "Sua resposta" })
        fireEvent.change(box, { target: { value: "Oi" } })
        fireEvent.keyDown(box, { key: "Enter" })
        const dots = await screen.findByTestId("maddox-writing-dots")
        expect(dots.closest("[data-testid='maddox-bubble']")).not.toBeNull()
        await act(async () => stream.send({ type: "delta", text: "Um {{Raça:Elfo}} e um {{Classe:Ma" }))
        const live = (await screen.findByTestId("maddox-cursor")).closest("[data-testid='maddox-bubble']")!
        expect(live).not.toBeNull()
        const strong = within(live as HTMLElement).getByText("Elfo")
        expect(strong.tagName).toBe("STRONG")
        expect(live.textContent).not.toContain("{{")
        expect(live.textContent).not.toMatch(/e um Ma/)
        await act(async () => stream.end())
    })

    it("menção do catálogo vira o badge clicável do DnDicas", async () => {
        mockGets(campaign(), interview({ messages: [msg("a1", "maddox", "Que tal um [Elfo](#mention:Ra%C3%A7a:r1)?")] }))
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const label = await screen.findByText("Elfo")
        const badge = label.closest(".mention")
        expect(badge).not.toBeNull()
        expect(badge).toHaveTextContent("Raça")
        expect(label.closest("a[href^='#mention']")).toBeNull()
    })

    it("enquanto escreve mostra os pontinhos e, com texto, o cursor", async () => {
        mockGets(campaign(), interview())
        const stream = streamFetch()
        renderWithQueryClient(<InterviewPage campaignId="c1" kind="scenario" />)
        const box = await screen.findByRole("textbox", { name: "Sua resposta" })
        fireEvent.change(box, { target: { value: "Oi" } })
        fireEvent.keyDown(box, { key: "Enter" })
        expect(await screen.findByTestId("maddox-writing-dots")).toBeInTheDocument()
        expect(screen.getByRole("status")).toHaveTextContent("Maddox está escrevendo…")
        await act(async () => stream.send({ type: "delta", text: "Certo" }))
        expect(await screen.findByTestId("maddox-cursor")).toBeInTheDocument()
        expect(screen.queryByTestId("maddox-writing-dots")).not.toBeInTheDocument()
        await act(async () => stream.end())
    })
})

describe("controles do design system", () => {
    it("as páginas do Maddox não limitam nem centralizam a largura (padrão do dashboard)", () => {
        // O layout do dashboard já aplica o padding; a página usa a largura toda (DND-6). Cards centrados de
        // propósito (ex.: o convite) e elementos internos não entram aqui.
        for (const file of ["interviews/InterviewPage.tsx", "campaigns/CampaignPage.tsx", "campaigns/CampaignsPage.tsx"]) {
            const source = readFileSync(join(process.cwd(), "src/features/maddox/components", file), "utf8")
            for (const className of source.matchAll(/className="([^"]*)"/g)) {
                const value = className[1]!
                expect(/\bmx-auto\b/.test(value) && /\bmax-w-(?:\d?xl|screen|prose|[2-9]xl)\b/.test(value), `${file}: ${value}`).toBe(false)
            }
        }
    })

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
