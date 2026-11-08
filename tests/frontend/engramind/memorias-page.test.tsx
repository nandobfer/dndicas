/** @vitest-environment happy-dom */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { xyflowMock } from "../../helpers/xyflow"

vi.mock("@xyflow/react", () => xyflowMock())
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: new URLSearchParams() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: nav.replace }), usePathname: () => "/memorias", useSearchParams: () => nav.params }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

const { MemoriasPage } = await import("@/features/engramind/components/page/MemoriasPage")

const now = new Date().toISOString()
const CAMPAIGN_ID = "6650f1a2b3c4d5e6f7a8b9c0"
const CAMPAIGN_CHANNEL = `dndicas/maddox/campanhas/${CAMPAIGN_ID}/jogadores`
const app = { id: "app_dndicas", slug: "dndicas" }
const channel = (slug: string) => ({ id: `ch_${slug}`, slug, name: slug, description: null, priority: 0, version: 1, created_at: now, archived_at: null, created_by: "dndicas" })
const agent = (slug: string, name: string) => ({ id: `ag_${slug}`, slug, qualified_slug: `dndicas/${slug}`, name, description: null, app, created_at: now, disabled_at: null })
const responses: Record<string, unknown> = {
    whoami: { token_id: "tk_a", kind: "app", scopes: ["read", "write", "delete"], app, agent: null, operations: [] },
    "consumer-settings": { memory: { text_min: 3, text_max: 4000 }, limits: { max_batch: 100 }, context: { budget_tokens: 4000, titles_budget_tokens: 800, default_format: "markdown", text_max_chars: 0 }, channels: [] },
    categories: { categories: [{ key: "PROJECT_RULES", label: "Regras", priority: 1 }] },
    channels: { channels: [channel("dndicas/opex/global"), channel("dndicas/maddox"), channel(CAMPAIGN_CHANNEL)], next_cursor: null },
    agents: { agents: [agent("opex", "Agente Opex"), agent("maddox", "Agente Maddox")], next_cursor: null },
    subscriptions: {
        subscriptions: [
            { id: "s1", agent: { id: "ag_opex", slug: "opex", qualified_slug: "dndicas/opex" }, target: "dndicas/opex/*", is_prefix: true, mode: "inject", access: null, priority: null, reaches: ["dndicas/opex/global"], created_at: now },
            { id: "s2", agent: { id: "ag_maddox", slug: "maddox", qualified_slug: "dndicas/maddox" }, target: "dndicas/maddox", is_prefix: false, mode: "inject", access: null, priority: null, reaches: ["dndicas/maddox"], created_at: now },
            { id: "s3", agent: { id: "ag_maddox", slug: "maddox", qualified_slug: "dndicas/maddox" }, target: "dndicas/maddox/campanhas/*", is_prefix: true, mode: "search", access: null, priority: null, reaches: [CAMPAIGN_CHANNEL], created_at: now },
        ],
        next_cursor: null,
    },
    memories: {
        memories: ["dndicas/opex/global", "dndicas/maddox", CAMPAIGN_CHANNEL].map((slug, index) => ({
            id: `m_${index}`, channel: slug, channel_id: `ch_${slug}`, title: `Memória ${index}`, title_state: "ready", text: "Texto", category: "PROJECT_RULES", status: "active", version: 1,
            author: { app: "dndicas", app_id: "app_dndicas", agent: null, agent_id: null }, embedding_state: "ready", retrieval_count: 0, created_at: now, updated_at: now, archived_at: null,
        })),
        next_cursor: null,
    },
}
const requested: string[] = []

class FakeEventSource {
    onmessage = null
    onerror = null
    readyState = 1
    constructor(readonly url: string) {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
}

beforeEach(() => {
    requested.length = 0
    vi.stubGlobal("EventSource", FakeEventSource)
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
        const url = new URL(String(input instanceof Request ? input.url : input), "http://localhost")
        requested.push(url.pathname)
        const route = url.pathname.replace(/^\/api\/engramind\//, "")
        return new Response(JSON.stringify({ success: true, data: responses[route] ?? {} }), { status: 200, headers: { "Content-Type": "application/json" } })
    })
})
afterEach(() => {
    vi.unstubAllGlobals()
    nav.params = new URLSearchParams()
})

const mount = (props: { configured: boolean; canConfigure: boolean; campaigns?: { id: string; name: string }[] }) =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoriasPage {...props} />
        </QueryClientProvider>,
    )

describe("/memorias", () => {
    it("integração não configurada: estado vazio pt-BR com link para a integração", () => {
        mount({ configured: false, canConfigure: true })
        expect(screen.getByText("Rede de memórias não configurada")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Configurar a integração Engramind" })).toHaveAttribute("href", "/integracoes/engramind")
        expect(requested).toHaveLength(0)
    })

    it("sem permissão de configurar: orienta a procurar um administrador", () => {
        mount({ configured: false, canConfigure: false })
        expect(screen.getByText(/Peça a um administrador/)).toBeInTheDocument()
        expect(screen.queryByRole("link")).toBeNull()
    })

    it("configurada: mostra a rede do app dndicas pelo proxy /api/engramind (modo app)", async () => {
        mount({ configured: true, canConfigure: true })
        await waitFor(() => expect(requested).toEqual(expect.arrayContaining(["/api/engramind/agents", "/api/engramind/channels", "/api/engramind/subscriptions"])))
        expect(await screen.findByTestId("agent-node-dndicas/opex")).toBeInTheDocument()
        expect(requested.every((path) => path.startsWith("/api/engramind/"))).toBe(true)
        expect(requested).not.toContain("/api/engramind/apps")
    })
})

describe("/memorias: nome da campanha no lugar do id nos canais das campanhas (DND-29)", () => {
    const campaigns = [{ id: CAMPAIGN_ID, name: "Águas de Prata" }]

    it("node do canal: prefixo da campanha e o nome com a visibilidade, sem o id; os outros canais como estão", async () => {
        mount({ configured: true, canConfigure: true, campaigns })
        const node = await screen.findByTestId(`channel-node-${CAMPAIGN_CHANNEL}`)
        expect(within(node).getByTestId("channel-name-prefix")).toHaveTextContent("dndicas/maddox/campanhas/")
        expect(within(node).getByTestId("channel-name-title")).toHaveTextContent("Águas de Prata · Jogadores")
        expect(within(node).getByTestId("channel-name-title")).toHaveAttribute("data-hint", 'Memórias da campanha "Águas de Prata" (jogadores)')
        expect(node.textContent).not.toContain(CAMPAIGN_ID)
        const opex = await screen.findByTestId("channel-node-dndicas/opex/global")
        expect(within(opex).getByTestId("channel-name-prefix")).toHaveTextContent("dndicas/opex/")
        expect(within(opex).getByTestId("channel-name-title")).toHaveTextContent("global")
    })

    it("universo do agente Maddox: a legenda \"Por canal\" mostra o nome da campanha", async () => {
        nav.params = new URLSearchParams({ universo: "agente:dndicas/maddox" })
        mount({ configured: true, canConfigure: true, campaigns })
        fireEvent.click(await screen.findByRole("button", { name: /Abrir estatísticas/ }))
        const stats = await screen.findByTestId("network-stats")
        expect(stats).toHaveTextContent("Por canal")
        expect(screen.queryByTestId(`channel-node-${CAMPAIGN_CHANNEL}`)).toBeNull()
        const legend = within(stats).getByTestId(`channel-name-${CAMPAIGN_CHANNEL}`)
        expect(within(legend).getByTestId("channel-name-title")).toHaveTextContent("Águas de Prata · Jogadores")
        expect(legend.textContent).not.toContain(CAMPAIGN_ID)
    })

    it("campanha fora da lista: o canal mostra o slug como hoje", async () => {
        mount({ configured: true, canConfigure: true, campaigns: [] })
        const node = await screen.findByTestId(`channel-node-${CAMPAIGN_CHANNEL}`)
        expect(within(node).getByTestId("channel-name-prefix")).toHaveTextContent(`dndicas/maddox/campanhas/${CAMPAIGN_ID}/`)
        expect(within(node).getByTestId("channel-name-title")).toHaveTextContent("jogadores")
    })
})
