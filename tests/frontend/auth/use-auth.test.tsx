import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useAuth } from "@/core/hooks/useAuth"
import { notifyAuthSessionChanged } from "@/features/auth/auth-session-events"

vi.mock("next-auth/react", () => ({
    signOut: vi.fn(),
}))

describe("useAuth", () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it("recarrega a sessão quando o login notifica mudança de autenticação", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ user: null }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ user: { id: "user-1", role: "admin", email: "admin@example.com" } }),
            })

        vi.stubGlobal("fetch", fetchMock)

        const { result } = renderHook(() => useAuth())

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(result.current.isLoaded).toBe(true))
        expect(result.current.isSignedIn).toBe(false)

        act(() => notifyAuthSessionChanged("signed-in"))

        await waitFor(() => expect(result.current.isSignedIn).toBe(true))
        expect(result.current.isAdmin).toBe(true)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("limpa a sessão local no logout sem recarregar cookie antigo", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user: { id: "user-1", role: "admin", email: "admin@example.com" } }),
        })

        vi.stubGlobal("fetch", fetchMock)

        const { result } = renderHook(() => useAuth())

        await waitFor(() => expect(result.current.isSignedIn).toBe(true))
        expect(fetchMock).toHaveBeenCalledTimes(1)

        act(() => notifyAuthSessionChanged("signed-out"))

        await waitFor(() => expect(result.current.isSignedIn).toBe(false))
        expect(result.current.user).toBeNull()
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
