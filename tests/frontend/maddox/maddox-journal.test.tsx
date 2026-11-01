/** @vitest-environment happy-dom */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxGameMessageDto } from "@/features/maddox/game-types"
import type { MaddoxJournalMemoryDto, MaddoxJournalSearchDto, MaddoxJournalSummaryDto } from "@/features/maddox/journal-types"

const get = vi.fn()
const replace = vi.fn()
let search = new URLSearchParams()

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
    usePathname: () => "/campanhas/c1/diario",
    useSearchParams: () => search,
}))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-ana", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })

const summary = (over: Partial<MaddoxJournalSummaryDto> = {}): MaddoxJournalSummaryDto => ({
    campaignId: "c1",
    name: "Brumas",
    rigor: "narrativo",
    status: "active",
    turnNumber: 3,
    myMemberId: "m2",
    maddoxAvatarUrl: null,
    setting: "Um reino coberto de brumas.",
    openingSituation: "Uma taverna em chamas.",
    state: { scene: "O porão da taverna.", location: "Porão", situation: "", pendingDecision: "Descer ao túnel?", updatedTurn: 3 },
    activeQuests: [memory("q1", "missao", "Resgatar a filha do moleiro", { status: "ativa" })],
    counts: { npcs: 2, party: 2, memories: { local: 1, missao: 2, evento: 1, relacao: 0, fato: 0, outro: 0 } },
    ...over,
})

function memory(id: string, kind: MaddoxJournalMemoryDto["kind"], title: string, over: Partial<MaddoxJournalMemoryDto> = {}): MaddoxJournalMemoryDto {
    return { id, kind, title, text: `Texto de ${title}.`, tags: [], status: null, turnNumber: 2, updatedAt: "2026-10-31T10:00:00.000Z", ...over }
}

const message = (id: string, over: Partial<MaddoxGameMessageDto>): MaddoxGameMessageDto => ({
    id,
    turnNumber: 1,
    phase: "players",
    kind: "declaration",
    memberId: null,
    characterName: null,
    portraitUrl: null,
    content: "",
    replyToId: null,
    skippedByName: null,
    error: null,
    check: null,
    combat: null,
    createdAt: "2026-10-31T10:00:00.000Z",
    ...over,
})

const emptySearch = (query: string): MaddoxJournalSearchDto => ({ query, npcs: { items: [], hasMore: false }, memories: { items: [], hasMore: false }, messages: { items: [], hasMore: false }, party: { items: [], hasMore: false }, state: null })

const pendingCheck = message("k1", {
    kind: "check",
    phase: "master",
    memberId: "m2",
    characterName: "Lyra",
    check: { round: 0, status: "pending", kind: "skill", ability: "dexterity", skill: "stealth", dc: null, mode: "normal", reason: "Esgueirar-se", roll: null, modifier: 3, modifierParts: [], rolledByName: null, rolledAt: null, cancelReason: null } as unknown as MaddoxGameMessageDto["check"],
})

type Routes = Record<string, (params: Record<string, string>) => unknown>
let routes: Routes

function defaultRoutes(): Routes {
    return {
        "/maddox/campaigns/c1/journal": () => summary(),
        "/maddox/campaigns/c1/game/messages": (params) =>
            params.before
                ? { messages: [message("old1", { kind: "narration", phase: "master", content: "Muito tempo atrás." })], hasMore: false }
                : { messages: [message("n1", { kind: "narration", phase: "master", content: "Uma taverna em **chamas**." }), message("d1", { memberId: "m2", characterName: "Lyra", content: "Corro." }), pendingCheck], hasMore: true },
        "/maddox/campaigns/c1/journal/npcs": () => ({
            items: [
                { id: "n1", name: "Bartolomeu", portraitUrl: null, status: "active", publicDescription: "Taverneiro gordo.", updatedAt: "2026-10-31T10:00:00.000Z" },
                { id: "n2", name: "Guarda Tomé", portraitUrl: null, status: "dead", publicDescription: "Caiu na ponte.", updatedAt: "2026-10-31T10:00:00.000Z" },
            ],
            nextCursor: null,
        }),
        "/maddox/campaigns/c1/journal/memories": (params) => {
            if (params.kind === "missao") {
                const all = [memory("q1", "missao", "Resgatar a filha do moleiro", { status: "ativa" }), memory("q2", "missao", "Apagar o incêndio", { status: "concluida" })]
                return { items: params.status ? all.filter((item) => item.status === params.status) : all, nextCursor: null }
            }
            if (params.kind === "local") return { items: [memory("l1", "local", "Taverna do Javali", { tags: ["vila"] })], nextCursor: null }
            if (params.kind === "evento") return { items: [memory("e1", "evento", "O incêndio")], nextCursor: null }
            return { items: [], nextCursor: null }
        },
        "/maddox/campaigns/c1/journal/party": () => [
            { memberId: "m1", playerName: "Marina", characterId: "ch1", characterName: "Aldric", portraitUrl: null, profile: { identidade: "Cavaleiro grisalho." }, currentState: "Ferido no ombro." },
            { memberId: "m2", playerName: "Ana", characterId: "ch2", characterName: "Lyra", portraitUrl: null, profile: {}, currentState: "" },
        ],
        "/maddox/campaigns/c1/journal/search": (params) =>
            params.q === "javali"
                ? {
                      ...emptySearch("javali"),
                      memories: { items: [{ id: "l1", kind: "local", title: "Taverna do Javali", status: null, excerpt: "Uma taverna do javali na estrada." }], hasMore: false },
                      messages: { items: [{ id: "n1", kind: "narration", turnNumber: 1, characterName: null, excerpt: "O javali assado.", createdAt: "2026-10-31T10:00:00.000Z" }], hasMore: true },
                      state: { excerpt: "Porão da Taverna do Javali." },
                  }
                : emptySearch(params.q ?? ""),
    }
}

beforeEach(() => {
    search = new URLSearchParams()
    replace.mockReset()
    routes = defaultRoutes()
    get.mockReset()
    get.mockImplementation(async (url: string, config?: { params?: Record<string, string> }) => {
        const route = routes[url]
        if (!route) throw Object.assign(new Error(`rota inesperada ${url}`), { response: { status: 500 } })
        return ok(await route(config?.params ?? {}))
    })
})

const { JournalPage } = await import("@/features/maddox/components/journal/JournalPage")
const { journalHref, parseJournalTab } = await import("@/features/maddox/components/journal/journal-links")
const { MADDOX_JOURNAL_SEEK_PAGES } = await import("@/features/maddox/components/journal/use-journal-hash-target")

async function renderJournal(params = "") {
    search = new URLSearchParams(params)
    const view = renderWithQueryClient(<JournalPage campaignId="c1" />)
    await screen.findByTestId("journal-page")
    return view
}

describe("Diário da campanha (Maddox 9) — tela", () => {
    it("cabeçalho, situação atual, missões ativas, cenário e abas com a aba ativa na cor primária", async () => {
        await renderJournal()
        expect(screen.getByRole("heading", { name: "Brumas" })).toBeInTheDocument()
        expect(screen.getByText("· Diário da campanha")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: /Voltar à mesa/ })).toHaveAttribute("href", "/campanhas/c1/mesa")
        expect(screen.getByTestId("journal-state-location")).toHaveTextContent("Porão")
        expect(screen.getByTestId("journal-state-pendingDecision")).toHaveTextContent("Descer ao túnel?")
        expect(screen.queryByTestId("journal-state-situation")).not.toBeInTheDocument()
        expect(screen.getByText("atualizada no turno 3")).toBeInTheDocument()
        expect(within(screen.getByRole("list", { name: "Missões ativas" })).getByText("Resgatar a filha do moleiro")).toBeInTheDocument()
        expect(screen.getByTestId("journal-setting")).toHaveTextContent("Um reino coberto de brumas.")

        const tabs = screen.getAllByRole("tab")
        expect(tabs.map((tab) => tab.textContent)).toEqual(["Histórico", "NPCs2", "Locais1", "Missões2", "Anotações1", "Grupo2"])
        const active = screen.getByRole("tab", { selected: true })
        expect(active).toHaveTextContent("Histórico")
        expect(active.className).toContain("aria-selected:bg-primary")
    })

    it("situação atual vazia mostra o aviso", async () => {
        routes["/maddox/campaigns/c1/journal"] = () => summary({ state: { scene: "", location: "", situation: "", pendingDecision: "", updatedTurn: null }, activeQuests: [] })
        await renderJournal()
        expect(screen.getByTestId("journal-state")).toHaveTextContent("O Maddox ainda não registrou a situação atual.")
    })

    it("histórico em modo leitura: mensagens com divisor, minha fala à direita, sem botão de rolar e com 'Carregar anteriores'", async () => {
        await renderJournal()
        const history = await screen.findByTestId("journal-history")
        expect(within(history).getByRole("log", { name: "Histórico da campanha" })).toBeInTheDocument()
        expect(within(history).getByTestId("maddox-narration")).toHaveTextContent("Uma taverna em chamas.")
        expect(within(history).getByTestId("game-declaration").className).toContain("flex-row-reverse")
        expect(within(history).queryAllByRole("button", { name: /Rolar|JOGAR/i })).toEqual([])
        fireEvent.click(within(history).getByRole("button", { name: "Carregar anteriores" }))
        expect(await within(history).findByText("Muito tempo atrás.")).toBeInTheDocument()
        expect(get).toHaveBeenCalledWith("/maddox/campaigns/c1/game/messages", { params: { before: "n1" } })
    })

    it("mensagem aberta pela busca (?msg=) carrega as páginas até ela e fica em destaque", async () => {
        await renderJournal("msg=old1")
        const history = await screen.findByTestId("journal-history")
        await waitFor(() => expect(history.querySelector('[data-message-id="old1"]')).toHaveAttribute("data-highlighted", "true"))
    })

    it("NPCs: descrição pública e morto esmaecido com a situação", async () => {
        await renderJournal("aba=npcs")
        const dead = await screen.findByTestId("journal-npc-n2")
        expect(dead.className).toContain("opacity-60")
        expect(within(dead).getByTestId("journal-npc-status")).toHaveTextContent("Morto")
        expect(screen.getByTestId("journal-npc-n1")).toHaveTextContent("Taverneiro gordo.")
        expect(screen.getByTestId("journal-npc-n1")).toHaveAttribute("id", "npc-n1")
    })

    it("missões: chips de situação e filtro pela situação na URL (?situacao=)", async () => {
        const view = await renderJournal("aba=missoes")
        const quest = await screen.findByTestId("journal-memory-q2")
        expect(within(quest).getByTestId("journal-quest-status")).toHaveAttribute("data-status", "concluida")
        expect(within(quest).getByTestId("journal-quest-status")).toHaveTextContent("Concluída")
        fireEvent.click(screen.getByRole("button", { name: "Concluída" }))
        expect(replace).toHaveBeenCalledWith("/campanhas/c1/diario?aba=missoes&situacao=concluida", { scroll: false })
        view.unmount()

        const filtered = await renderJournal("aba=missoes&situacao=concluida")
        expect(await screen.findByTestId("journal-memory-q2")).toBeInTheDocument()
        expect(screen.queryByTestId("journal-memory-q1")).not.toBeInTheDocument()
        expect(get).toHaveBeenCalledWith("/maddox/campaigns/c1/journal/memories", { params: { kind: "missao", status: "concluida" } })
        filtered.unmount()

        await renderJournal("aba=missoes&situacao=falhou")
        expect(await screen.findByTestId("journal-empty")).toHaveTextContent("Nenhuma missão falhou.")
    })

    it("o link de uma missão vindo da busca zera o filtro de situação", () => {
        const href = journalHref("c1", { memoryId: "q2", kind: "missao" })
        expect(href).toBe("/campanhas/c1/diario?aba=missoes#anotacao-q2")
        expect(new URL(href, "http://x").searchParams.get("situacao")).toBeNull()
    })

    it("NPC aberto por link além da primeira página: a lista carrega as páginas seguintes até ele e o destaca", async () => {
        const npc = (index: number) => ({ id: `n${index}`, name: `NPC ${index}`, portraitUrl: null, status: "active", publicDescription: "", updatedAt: "2026-10-31T10:00:00.000Z" })
        routes["/maddox/campaigns/c1/journal/npcs"] = (params) =>
            params.cursor ? { items: Array.from({ length: 5 }, (_, index) => npc(30 + index)), nextCursor: null } : { items: Array.from({ length: 30 }, (_, index) => npc(index)), nextCursor: "n29" }
        window.location.hash = "#npc-n33"
        try {
            await renderJournal("aba=npcs")
            const card = await screen.findByTestId("journal-npc-n33")
            expect(card).toHaveAttribute("data-highlighted", "true")
            expect(get).toHaveBeenCalledWith("/maddox/campaigns/c1/journal/npcs", { params: { cursor: "n29" } })
            expect(screen.queryByTestId("journal-too-far")).not.toBeInTheDocument()
        } finally {
            window.location.hash = ""
        }
    })

    it("falha ao carregar a página seguinte para a procura do item (sem refazer a requisição em laço)", async () => {
        // Falha com atraso, como a rede: a tela passa por "carregando a próxima página" antes do erro.
        const failLater = () => new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error("falha"), { response: { status: 500 } })), 30))
        let npcCalls = 0
        routes["/maddox/campaigns/c1/journal/npcs"] = (params) => {
            npcCalls++
            if (params.cursor) return failLater()
            return { items: [{ id: "n1", name: "NPC 1", portraitUrl: null, status: "active", publicDescription: "", updatedAt: "2026-10-31T10:00:00.000Z" }], nextCursor: "n1" }
        }
        let historyCalls = 0
        routes["/maddox/campaigns/c1/game/messages"] = (params) => {
            historyCalls++
            if (params.before) return failLater()
            return { messages: [message("m1", { kind: "narration", phase: "master", content: "Agora." })], hasMore: true }
        }
        window.location.hash = "#npc-n99"
        try {
            const view = await renderJournal("aba=npcs")
            expect(await screen.findByText("Não foi possível carregar esta parte do diário.")).toBeInTheDocument()
            await new Promise((resolve) => setTimeout(resolve, 500))
            expect(npcCalls).toBe(2)
            view.unmount()
        } finally {
            window.location.hash = ""
        }

        await renderJournal("msg=antiga")
        expect(await screen.findByText("Não foi possível carregar esta parte do diário.")).toBeInTheDocument()
        await new Promise((resolve) => setTimeout(resolve, 500))
        expect(historyCalls).toBe(2)
    })

    it("anotação aberta por link além do limite de páginas: avisa para usar 'Carregar mais'", async () => {
        let calls = 0
        routes["/maddox/campaigns/c1/journal/memories"] = (params) => {
            calls++
            const page = Number(params.cursor ?? 0)
            return { items: [memory(`e${page}`, "evento", `Marco ${page}`)], nextCursor: String(page + 1) }
        }
        window.location.hash = "#anotacao-inexistente"
        try {
            await renderJournal("aba=anotacoes&tipo=evento")
            expect(await screen.findByTestId("journal-too-far", {}, { timeout: 3000 })).toHaveTextContent("Item muito antigo: use “Carregar mais” para chegar até ele.")
            expect(calls).toBe(MADDOX_JOURNAL_SEEK_PAGES)
            expect(screen.getByRole("button", { name: "Carregar mais" })).toBeInTheDocument()
        } finally {
            window.location.hash = ""
        }
    })

    it("locais e anotações: estados vazios em pt-BR e filtro por tipo pela URL", async () => {
        routes["/maddox/campaigns/c1/journal/memories"] = () => ({ items: [], nextCursor: null })
        const view = await renderJournal("aba=locais")
        expect(await screen.findByTestId("journal-empty")).toHaveTextContent("Nenhum local anotado ainda: o Maddox registra os lugares conforme o grupo os descobre.")
        view.unmount()
        await renderJournal("aba=anotacoes&tipo=relacao")
        expect(await screen.findByTestId("journal-empty")).toHaveTextContent("Nenhuma relação anotada ainda.")
        fireEvent.click(screen.getByRole("button", { name: "Fato (0)" }))
        expect(replace).toHaveBeenCalledWith("/campanhas/c1/diario?aba=anotacoes&tipo=fato", { scroll: false })
    })

    it("grupo: perfil e condição na história de cada personagem", async () => {
        await renderJournal("aba=grupo")
        const aldric = await screen.findByTestId("journal-member-m1")
        expect(aldric).toHaveTextContent("Personagem de Marina")
        expect(within(aldric).getByTestId("journal-member-state")).toHaveTextContent("Ferido no ombro.")
        expect(aldric).toHaveTextContent("Cavaleiro grisalho.")
        const lyra = screen.getByTestId("journal-member-m2")
        expect(lyra).toHaveTextContent("Seu personagem")
        expect(within(lyra).getByTestId("journal-member-state")).toHaveTextContent("Sem registro do Maddox ainda.")
    })

    it("trocar de aba atualiza a URL", async () => {
        await renderJournal()
        fireEvent.click(screen.getByRole("tab", { name: /Grupo/ }))
        expect(replace).toHaveBeenCalledWith("/campanhas/c1/diario?aba=grupo", { scroll: false })
    })

    it("busca: espera, grupos com o termo destacado, aviso de termo curto e de nada encontrado", async () => {
        await renderJournal()
        const box = screen.getByRole("searchbox", { name: "Buscar no diário" })
        fireEvent.change(box, { target: { value: "j" } })
        expect(screen.getByText("Digite ao menos 2 caracteres.")).toBeInTheDocument()
        fireEvent.change(box, { target: { value: "javali" } })
        const results = await screen.findByTestId("journal-search-results", {}, { timeout: 2000 })
        expect(within(results).getByTestId("search-group-state")).toHaveTextContent("Porão da Taverna do Javali.")
        expect(within(results).getByTestId("search-group-places")).toHaveTextContent("Locais (1)")
        expect(within(results).getByTestId("search-group-messages")).toHaveTextContent("Histórico da mesa (1+)")
        expect(within(results).getAllByText("Javali", { selector: "mark" }).length).toBeGreaterThan(0)
        const hrefs = within(results).getAllByTestId("journal-search-hit").map((hit) => hit.getAttribute("href"))
        expect(hrefs).toEqual(["/campanhas/c1/diario", "/campanhas/c1/diario?aba=locais#anotacao-l1", "/campanhas/c1/diario?aba=historico&msg=n1"])

        fireEvent.change(box, { target: { value: "dragão" } })
        expect(await screen.findByTestId("journal-search-empty", {}, { timeout: 2000 })).toHaveTextContent("Nada encontrado para “dragão”.")
    })

    it("campanha que não existe ou de que não participo", async () => {
        routes["/maddox/campaigns/c1/journal"] = () => {
            throw Object.assign(new Error("404"), { response: { status: 404 } })
        }
        renderWithQueryClient(<JournalPage campaignId="c1" />)
        expect(await screen.findByText("Campanha não encontrada")).toBeInTheDocument()
    })
})

describe("Diário da campanha — links e controles", () => {
    it("links da busca e do painel levam à aba e ao item", () => {
        expect(journalHref("c1")).toBe("/campanhas/c1/diario")
        expect(journalHref("c1", { tab: "grupo" })).toBe("/campanhas/c1/diario?aba=grupo")
        expect(journalHref("c1", { npcId: "n1" })).toBe("/campanhas/c1/diario?aba=npcs#npc-n1")
        expect(journalHref("c1", { memoryId: "m1", kind: "missao" })).toBe("/campanhas/c1/diario?aba=missoes#anotacao-m1")
        expect(journalHref("c1", { memoryId: "m1", kind: "fato" })).toBe("/campanhas/c1/diario?aba=anotacoes&tipo=fato#anotacao-m1")
        expect(journalHref("c1", { messageId: "x" })).toBe("/campanhas/c1/diario?aba=historico&msg=x")
        expect(journalHref("c1", { memberId: "m2" })).toBe("/campanhas/c1/diario?aba=grupo#personagem-m2")
        expect(parseJournalTab("qualquer")).toBe("historico")
        expect(parseJournalTab("missoes")).toBe("missoes")
    })

    it("componentes do diário não usam abas do core nem select/checkbox nativos", () => {
        const dir = join(process.cwd(), "src/features/maddox/components/journal")
        for (const file of readdirSync(dir)) {
            const source = readFileSync(join(dir, file), "utf8")
            expect(source, file).not.toContain("@/core/ui/tabs")
            expect(source, file).not.toMatch(/<select[\s>]/)
            expect(source, file).not.toMatch(/type=["']checkbox["']/)
        }
    })
})
