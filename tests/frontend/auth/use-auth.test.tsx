import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
const mocks = vi.hoisted(() => ({ get: vi.fn(), router: { refresh: vi.fn() } }))
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }))
vi.mock("@/core/utils/api", () => ({ default: { get: mocks.get, post: vi.fn().mockResolvedValue({}) } }))
vi.mock("@/features/perfix/transport", () => ({ installViewAsTransport: () => () => {} }))
vi.mock("@/features/perfix/components/view-as/ViewAsSelector", () => ({ ViewAsSelector: () => null }))
vi.mock("@/features/perfix/components/view-as/ViewAsBanner", () => ({ ViewAsBanner: () => null }))
vi.mock("@/lib/pusher/client", () => ({ resetPusherClient: vi.fn() }))
import { useAuth } from "@/core/hooks/useAuth"
import { PerfixProvider } from "@/features/perfix/components/PerfixProvider"
import { notifyAuthSessionChanged } from "@/features/auth/auth-session-events"
const session = { user: { id: "user-1", name: "Admin", username: "admin", email: "admin@example.com" }, access: { permissions: ["*"], roles: [], realIsAdministrator: true, simulation: null } }
function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={client}><PerfixProvider>{children}</PerfixProvider></QueryClientProvider>
}
beforeEach(() => { mocks.get.mockReset() })
describe("useAuth com sessão de acesso", () => {
    it("recarrega o acesso depois de login", async () => {
        mocks.get.mockResolvedValueOnce({ data: { data: null } }).mockResolvedValueOnce({ data: { data: session } })
        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isLoaded).toBe(true))
        expect(result.current.isSignedIn).toBe(false)
        act(() => notifyAuthSessionChanged("signed-in"))
        await waitFor(() => expect(result.current.isSignedIn).toBe(true))
        expect(result.current.can("users.edit")).toBe(true)
        expect(result.current.isAdmin).toBe(true)
        expect(mocks.get).toHaveBeenCalledTimes(2)
    })
    it("limpa a identidade no logout sem consultar o cookie antigo", async () => {
        mocks.get.mockResolvedValueOnce({ data: { data: session } })
        const { result } = renderHook(() => useAuth(), { wrapper })
        await waitFor(() => expect(result.current.isSignedIn).toBe(true))
        act(() => notifyAuthSessionChanged("signed-out"))
        await waitFor(() => expect(result.current.user).toBeNull())
        expect(result.current.isLoaded).toBe(true)
        expect(mocks.get).toHaveBeenCalledTimes(1)
    })
})
