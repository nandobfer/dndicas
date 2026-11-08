/** @vitest-environment happy-dom */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { xyflowMock } from "../../helpers/xyflow"

vi.mock("@xyflow/react", () => xyflowMock())
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: new URLSearchParams() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: nav.replace }), usePathname: () => "/memorias", useSearchParams: () => nav.params }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

/** O `universeLayout` que cada render do provider da lib recebeu (DND-34). */
const providerLayouts = vi.hoisted(() => [] as unknown[])
vi.mock("@engramind/client/react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@engramind/client/react")>()
    const Provider = (props: React.ComponentProps<typeof actual.EngramindProvider>) => {
        providerLayouts.push(props.universeLayout ?? null)
        return <actual.EngramindProvider {...props} />
    }
    return { ...actual, EngramindProvider: Provider }
})
/** `GET /engramind/universe-layout` pelo axios do app (o resto da rede vai pelo `fetch` da lib). */
const layoutApi = vi.hoisted(() => ({ data: null as unknown, calls: 0 }))
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>()
    const get = async (path: string) => {
        if (path !== "/engramind/universe-layout") throw new Error(`rota inesperada: ${path}`)
        layoutApi.calls += 1
        return { data: { success: true, data: layoutApi.data } }
    }
    return { ...actual, api: { ...actual.api, get } }
})

import { DEFAULT_UNIVERSE_LAYOUT, type UniverseLayoutConfig } from "@engramind/client"

const { MemoriasPage } = await import("@/features/engramind/components/page/MemoriasPage")

const now = new Date().toISOString()
const app = { id: "app_dndicas", slug: "dndicas" }
const channel = (slug: string) => ({ id: `ch_${slug}`, slug, name: slug, description: null, priority: 0, version: 1, created_at: now, archived_at: null, created_by: "dndicas" })
const agent = (slug: string, name: string) => ({ id: `ag_${slug}`, slug, qualified_slug: `dndicas/${slug}`, name, description: null, app, created_at: now, disabled_at: null })
const responses: Record<string, unknown> = {
    whoami: { token_id: "tk_a", kind: "app", scopes: ["read", "write", "delete"], app, agent: null, operations: [] },
    "consumer-settings": { memory: { text_min: 3, text_max: 4000 }, limits: { max_batch: 100 }, context: { budget_tokens: 4000, titles_budget_tokens: 800, default_format: "markdown", text_max_chars: 0 }, channels: [] },
    categories: { categories: [{ key: "PROJECT_RULES", label: "Regras", priority: 1 }] },
    channels: { channels: [channel("dndicas/opex/global"), channel("dndicas/maddox")], next_cursor: null },
    agents: { agents: [agent("opex", "Agente Opex"), agent("maddox", "Agente Maddox")], next_cursor: null },
    subscriptions: {
        subscriptions: [
            { id: "s1", agent: { id: "ag_opex", slug: "opex", qualified_slug: "dndicas/opex" }, target: "dndicas/opex/*", is_prefix: true, mode: "inject", access: null, priority: null, reaches: ["dndicas/opex/global"], created_at: now },
            { id: "s2", agent: { id: "ag_maddox", slug: "maddox", qualified_slug: "dndicas/maddox" }, target: "dndicas/maddox", is_prefix: false, mode: "inject", access: null, priority: null, reaches: ["dndicas/maddox"], created_at: now },
        ],
        next_cursor: null,
    },
    memories: {
        memories: ["dndicas/opex/global", "dndicas/maddox"].map((slug, index) => ({
            id: `m_${index}`, channel: slug, channel_id: `ch_${slug}`, title: `Memória ${index}`, title_state: "ready", text: "Texto", category: "PROJECT_RULES", status: "active", version: 1,
            author: { app: "dndicas", app_id: "app_dndicas", agent: null, agent_id: null }, embedding_state: "ready", retrieval_count: 0, created_at: now, updated_at: now, archived_at: null,
        })),
        next_cursor: null,
    },
}
const requested: string[] = []

class FakeEventSource {
    static instances: FakeEventSource[] = []
    onmessage = null
    onerror = null
    readyState = 1
    listeners = new Map<string, ((message: { data: string }) => void)[]>()
    constructor(readonly url: string) {
        FakeEventSource.instances.push(this)
    }
    addEventListener(type: string, listener: (message: { data: string }) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }
    removeEventListener() {}
    close() {}
    emit(event: unknown) {
        for (const listener of this.listeners.get("engramind") ?? []) listener({ data: JSON.stringify(event) })
    }
}

beforeEach(() => {
    requested.length = 0
    providerLayouts.length = 0
    layoutApi.calls = 0
    layoutApi.data = null
    FakeEventSource.instances = []
    vi.stubGlobal("EventSource", FakeEventSource)
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
        const url = new URL(String(input instanceof Request ? input.url : input), "http://localhost")
        requested.push(url.pathname)
        const route = url.pathname.replace(/^\/api\/engramind\//, "")
        return new Response(JSON.stringify({ success: true, data: responses[route] ?? {} }), { status: 200, headers: { "Content-Type": "application/json" } })
    })
})
afterEach(() => vi.unstubAllGlobals())

const mount = (props: { configured: boolean; canConfigure: boolean; universeLayout?: UniverseLayoutConfig | null }) =>
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

    it("sem layout gravado: a rede recebe null e fica com o desenho padrão da lib", async () => {
        mount({ configured: true, canConfigure: true, universeLayout: null })
        expect(await screen.findByTestId("agent-node-dndicas/opex")).toBeInTheDocument()
        expect(providerLayouts.length).toBeGreaterThan(0)
        expect(providerLayouts.every((layout) => layout === null)).toBe(true)
        expect(layoutApi.calls).toBe(0)
    })

    it("com layout gravado: a rede recebe a configuração lida no servidor, sem nova consulta", async () => {
        const spiral: UniverseLayoutConfig = { ...DEFAULT_UNIVERSE_LAYOUT, layout: "spiral", particleMaxPx: 40 }
        mount({ configured: true, canConfigure: true, universeLayout: spiral })
        expect(await screen.findByTestId("agent-node-dndicas/opex")).toBeInTheDocument()
        expect(providerLayouts.at(-1)).toEqual(spiral)
        expect(layoutApi.calls).toBe(0)
    })

    it("tempo real: universe-layout.updated no SSE relê o layout e a rede passa a usá-lo sem recarregar", async () => {
        mount({ configured: true, canConfigure: true, universeLayout: null })
        expect(await screen.findByTestId("agent-node-dndicas/opex")).toBeInTheDocument()
        const imported: UniverseLayoutConfig = { ...DEFAULT_UNIVERSE_LAYOUT, layout: "spiral", ringGap: 84 }
        layoutApi.data = { config: imported, isDefault: false, updatedAt: "2026-11-08T03:00:00.000Z" }
        const source = FakeEventSource.instances.find((instance) => instance.url.endsWith("/api/engramind/events"))
        expect(source).toBeDefined()
        // Evento de memória não relê o layout; só o do layout.
        await act(async () => source!.emit({ type: "memory.created", channel: "dndicas/opex/global" }))
        expect(layoutApi.calls).toBe(0)
        await act(async () => source!.emit({ type: "universe-layout.updated" }))
        await waitFor(() => expect(providerLayouts.at(-1)).toEqual(imported))
        expect(layoutApi.calls).toBe(1)
        expect(FakeEventSource.instances.filter((instance) => instance.url.endsWith("/api/engramind/events"))).toHaveLength(1)
    })
})
