/** @vitest-environment happy-dom */
import { act, render, screen, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, type ReactNode } from "react"
const mocks = vi.hoisted(() => ({ get: vi.fn(), router: { refresh: vi.fn() }, header: "none", mounts: 0 }))
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }))
vi.mock("@/core/utils/api", () => ({ default: { get: mocks.get, post: vi.fn().mockResolvedValue({}) } }))
vi.mock("@/features/perfix/transport", () => ({ installViewAsTransport: () => () => {} }))
vi.mock("@/features/perfix/components/view-as/ViewAsSelector", () => ({ ViewAsSelector: () => null }))
vi.mock("@/features/perfix/components/view-as/ViewAsBanner", () => ({ ViewAsBanner: () => null }))
vi.mock("@/features/perfix/components/AccessLoadingScreen", () => ({ AccessLoadingScreen: () => <div role="status" aria-label="Carregando acesso" /> }))
vi.mock("@/lib/pusher/client", () => ({ resetPusherClient: vi.fn() }))
vi.mock("@nandobfer/perfix/react", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@nandobfer/perfix/react")>()
    return { ...actual, getViewAsHeaderValue: () => mocks.header }
})
import { PerfixProvider, ACCESS_LOADING_DELAY_MS } from "@/features/perfix/components/PerfixProvider"
import { notifyAuthSessionChanged } from "@/features/auth/auth-session-events"

const session = { user: { id: "user-1", name: "Ana", username: "ana", email: "ana@example.com" }, access: { permissions: [], roles: [], realIsAdministrator: false, simulation: null } }
function Page() {
    useEffect(() => { mocks.mounts += 1 }, [])
    return <p>Conteúdo do catálogo</p>
}
function tree(children: ReactNode = <Page />) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={client}><PerfixProvider>{children}</PerfixProvider></QueryClientProvider>
}
const deferred = () => {
    let resolve!: (value: unknown) => void
    const promise = new Promise((r) => { resolve = r })
    return { promise, resolve }
}

beforeEach(() => {
    mocks.get.mockReset()
    mocks.router.refresh.mockReset()
    mocks.header = "none"
    mocks.mounts = 0
})

describe("PerfixProvider", () => {
    it("o HTML do servidor traz o conteúdo da página, sem a tela de carregamento", () => {
        const html = renderToString(tree())
        expect(html).toContain("Conteúdo do catálogo")
        expect(html).not.toContain("Carregando acesso")
    })

    it("mostra a página enquanto valida e só cobre com o loading se a validação demorar", async () => {
        const pending = deferred()
        mocks.get.mockReturnValue(pending.promise)
        render(tree())
        expect(screen.getByText("Conteúdo do catálogo")).toBeTruthy()
        expect(screen.queryByRole("status", { name: "Carregando acesso" })).toBeNull()
        await waitFor(() => expect(screen.getByRole("status", { name: "Carregando acesso" })).toBeTruthy(), { timeout: ACCESS_LOADING_DELAY_MS * 5 })
        expect(screen.getByText("Conteúdo do catálogo")).toBeTruthy()
        await act(async () => { pending.resolve({ data: { data: session } }) })
        await waitFor(() => expect(screen.queryByRole("status", { name: "Carregando acesso" })).toBeNull())
    })

    it("não remonta a página na primeira carga e não recarrega o RSC sem simulação", async () => {
        mocks.get.mockResolvedValue({ data: { data: null } })
        render(tree())
        await waitFor(() => expect(mocks.get).toHaveBeenCalled())
        await act(async () => {})
        expect(mocks.mounts).toBe(1)
        expect(mocks.router.refresh).not.toHaveBeenCalled()
    })

    it("remonta a página quando a identidade muda depois de carregada", async () => {
        mocks.get.mockResolvedValueOnce({ data: { data: null } }).mockResolvedValueOnce({ data: { data: session } })
        render(tree())
        await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
        // Garante que a primeira identidade (visitante) já foi carregada antes do login.
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
        expect(mocks.mounts).toBe(1)
        act(() => notifyAuthSessionChanged("signed-in"))
        await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(mocks.mounts).toBe(2))
    })

    it("recarrega o RSC na montagem quando a aba está simulando", () => {
        mocks.header = "usuario:abc"
        mocks.get.mockReturnValue(new Promise(() => {}))
        render(tree())
        expect(mocks.router.refresh).toHaveBeenCalledTimes(1)
    })
})
