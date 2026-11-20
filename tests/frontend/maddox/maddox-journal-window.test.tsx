/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { renderWithQueryClient } from "../test-utils"
import type { MaddoxJournalSearchDto, MaddoxJournalSummaryDto } from "@/features/maddox/journal-types"

const get = vi.fn()
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
    usePathname: () => "/campanhas/c1/mesa",
    useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ userId: "u-ana", isSignedIn: true, isLoaded: true, can: () => true }) }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    return { ...actual, api: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const ok = <T,>(data: T) => ({ data: { success: true, data } })

const summary: MaddoxJournalSummaryDto = {
    campaignId: "c1",
    name: "Brumas",
    rigor: "narrativo",
    status: "active",
    turnNumber: 3,
    myMemberId: "m2",
    maddoxAvatarUrl: null,
    setting: "Um reino coberto de brumas.",
    openingSituation: "",
    state: { scene: "O porão da taverna.", location: "Porão", situation: "", pendingDecision: "", updatedTurn: 3 },
    activeQuests: [],
    counts: { npcs: 2, party: 0, images: 1, chapters: 1, memories: { local: 0, missao: 0, evento: 0, relacao: 0, fato: 0, outro: 0 } },
    memoriesUnavailable: false,
}

const emptySearch = (query: string): MaddoxJournalSearchDto => ({ query, npcs: { items: [], hasMore: false }, memories: { items: [], hasMore: false }, party: { items: [], hasMore: false }, images: { items: [], hasMore: false }, state: null })

type Routes = Record<string, (params: Record<string, string>) => unknown>
let routes: Routes

beforeEach(() => {
    nav.push.mockReset()
    nav.replace.mockReset()
    window.location.hash = ""
    routes = {
        "/maddox/campaigns/c1/journal": () => summary,
        "/maddox/campaigns/c1/journal/chapters": () => ({ items: [{ id: "ch1", title: "A taverna em chamas", summary: "O grupo fugiu do incêndio.", turnNumber: 2, createdAt: "2026-10-31T10:00:00.000Z" }] }),
        "/maddox/campaigns/c1/journal/npcs": () => ({
            items: [
                { id: "n1", name: "Bartolomeu", portraitUrl: null, status: "active", publicDescription: "Taverneiro gordo.", updatedAt: "2026-10-31T10:00:00.000Z" },
                { id: "n2", name: "Guarda Tomé", portraitUrl: null, status: "active", publicDescription: "Vigia a ponte.", updatedAt: "2026-10-31T10:00:00.000Z" },
            ],
            nextCursor: null,
        }),
        "/maddox/campaigns/c1/journal/images": () => ({
            items: [{ id: "i1", url: "https://cdn/i1.png", caption: "Guarda Tomé", situationLabel: null, source: "npc-portrait", turnNumber: 2, messageId: null, npc: { id: "n2", name: "Guarda Tomé" }, createdAt: "2026-10-31T10:00:00.000Z" }],
            nextCursor: null,
        }),
        "/maddox/campaigns/c1/journal/search": (params) => ({
            ...emptySearch(params.q ?? ""),
            npcs: { items: [{ id: "n2", name: "Guarda Tomé", portraitUrl: null, status: "active", excerpt: "Vigia a ponte." }], hasMore: false },
        }),
    }
    get.mockReset()
    get.mockImplementation(async (url: string, config?: { params?: Record<string, string> }) => {
        const route = routes[url]
        if (!route) throw Object.assign(new Error(`rota inesperada ${url}`), { response: { status: 500 } })
        return ok(await route(config?.params ?? {}))
    })
})

const { JournalWindowButton } = await import("@/features/maddox/components/journal/JournalWindow")

function Table() {
    return (
        <div data-testid="mesa">
            <p>Mesa da campanha</p>
            <JournalWindowButton campaignId="c1" />
        </div>
    )
}

async function openWindow() {
    fireEvent.click(screen.getByTestId("journal-link"))
    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByText("Diário — Brumas")
    return dialog
}

const noNavigation = () => {
    expect(nav.push).not.toHaveBeenCalled()
    expect(nav.replace).not.toHaveBeenCalled()
}

describe("Janela do diário na mesa (DND-77)", () => {
    it("o botão Diário abre a janela de vidro sobre a mesa, em Capítulos, sem navegar e sem buscar antes de abrir", async () => {
        renderWithQueryClient(<Table />)
        expect(get).not.toHaveBeenCalled()
        const dialog = await openWindow()
        expect(within(dialog).getByTestId("journal-window-scroll").className).toContain("overflow-y-auto")
        expect(within(dialog).getByRole("tab", { selected: true })).toHaveTextContent("Capítulos")
        expect(within(dialog).queryByRole("tab", { name: /Histórico/ })).toBeNull()
        expect(await within(dialog).findByText("A taverna em chamas")).toBeInTheDocument()
        expect(within(dialog).queryByRole("link", { name: /Voltar à mesa/ })).toBeNull()
        expect(screen.getByTestId("mesa")).toBeInTheDocument()
        noNavigation()
    })

    it("leiaute: as classes da janela prevalecem sobre as do modal base (tela cheia no celular, centralizada e limitada no desktop)", async () => {
        renderWithQueryClient(<Table />)
        const dialog = await openWindow()
        const classes = dialog.className.split(/\s+/)
        expect(classes).toEqual(expect.arrayContaining(["h-[100dvh]", "max-h-[100dvh]", "max-w-none", "rounded-none", "overflow-hidden", "sm:h-[85vh]", "sm:max-h-[85vh]", "sm:max-w-6xl", "sm:rounded-xl"]))
        // O merge de classes tira as do modal base que brigariam com as da janela.
        expect(classes).not.toContain("max-w-4xl")
        expect(classes).not.toContain("max-h-[90vh]")
        expect(classes).not.toContain("overflow-y-auto")
        expect(classes).not.toContain("rounded-xl")
        // O corpo do modal fica sem o padding base; a rolagem é só a da área interna.
        const scroll = within(dialog).getByTestId("journal-window-scroll")
        const body = scroll.parentElement!
        expect(body.className.split(/\s+/)).toEqual(expect.arrayContaining(["p-0", "flex", "min-h-0", "flex-1", "flex-col"]))
        expect(body.className.split(/\s+/)).not.toContain("p-6")
        expect(scroll.className.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-0", "flex-1", "overflow-y-auto", "overscroll-contain"]))
        // O cabeçalho reserva espaço à direita para o X do modal (absolute right-4 top-4).
        const title = within(dialog).getByText("Diário — Brumas")
        expect(title.closest("div")!.className.split(/\s+/)).toContain("pr-12")
        expect(within(dialog).getByRole("button", { name: "Fechar" })).toBeInTheDocument()
    })

    it("as abas trocam dentro da janela, sem mexer na URL da mesa", async () => {
        renderWithQueryClient(<Table />)
        const dialog = await openWindow()
        fireEvent.click(within(dialog).getByRole("tab", { name: /NPCs/ }))
        expect(await within(dialog).findByTestId("journal-npc-n1")).toHaveTextContent("Taverneiro gordo.")
        expect(within(dialog).getByRole("tab", { selected: true })).toHaveTextContent("NPCs")
        noNavigation()
    })

    it("resultado da busca abre o item na própria janela, em destaque, e limpa o termo", async () => {
        renderWithQueryClient(<Table />)
        const dialog = await openWindow()
        const box = within(dialog).getByRole("searchbox", { name: "Buscar no diário" })
        fireEvent.change(box, { target: { value: "tomé" } })
        const hits = await within(dialog).findAllByTestId("journal-search-hit", {}, { timeout: 2000 })
        expect(hits[0]).toHaveAttribute("href", "/campanhas/c1/diario?aba=npcs#npc-n2")
        fireEvent.click(hits[0]!)
        await waitFor(() => expect(within(screen.getByRole("dialog")).getByTestId("journal-npc-n2")).toHaveAttribute("data-highlighted", "true"))
        const open = screen.getByRole("dialog")
        expect(within(open).getByRole("tab", { selected: true })).toHaveTextContent("NPCs")
        expect(within(open).getByTestId("journal-npc-n1")).not.toHaveAttribute("data-highlighted")
        expect(within(open).getByRole("searchbox", { name: "Buscar no diário" })).toHaveValue("")
        expect(window.location.hash).toBe("")
        noNavigation()
    })

    it("\"Ver NPC\" de um retrato leva ao NPC dentro da janela", async () => {
        renderWithQueryClient(<Table />)
        const dialog = await openWindow()
        fireEvent.click(within(dialog).getByRole("tab", { name: /Imagens/ }))
        const link = await within(dialog).findByTestId("journal-image-npc-link")
        fireEvent.click(link)
        await waitFor(() => expect(within(screen.getByRole("dialog")).getByTestId("journal-npc-n2")).toHaveAttribute("data-highlighted", "true"))
        noNavigation()
    })

    it("fecha com Esc e com o X; ao reabrir volta para Capítulos", async () => {
        renderWithQueryClient(<Table />)
        let dialog = await openWindow()
        fireEvent.click(within(dialog).getByRole("tab", { name: /NPCs/ }))
        await within(dialog).findByTestId("journal-npc-n1")
        fireEvent.keyDown(dialog, { key: "Escape" })
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        expect(screen.getByTestId("mesa")).toBeInTheDocument()

        dialog = await openWindow()
        expect(within(dialog).getByRole("tab", { selected: true })).toHaveTextContent("Capítulos")
        fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }))
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
        noNavigation()
    })

    it("campanha inexistente e falha de carga mostram os estados em pt-BR", async () => {
        routes["/maddox/campaigns/c1/journal"] = () => {
            throw Object.assign(new Error("404"), { response: { status: 404 } })
        }
        const view = renderWithQueryClient(<Table />)
        fireEvent.click(screen.getByTestId("journal-link"))
        expect(await within(await screen.findByRole("dialog")).findByText("Campanha não encontrada")).toBeInTheDocument()
        view.unmount()

        routes["/maddox/campaigns/c1/journal"] = () => {
            throw Object.assign(new Error("500"), { response: { status: 500 } })
        }
        renderWithQueryClient(<Table />)
        fireEvent.click(screen.getByTestId("journal-link"))
        expect(await within(await screen.findByRole("dialog")).findByText("Não foi possível carregar o diário")).toBeInTheDocument()
    })
})
