/** @vitest-environment happy-dom */
import * as React from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: mocks.get }, unwrapApi: (body: { data: unknown }) => body.data }))
vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => false, acquireChannel: vi.fn(), releaseChannel: vi.fn() }))

import { useOpencodeUsage } from "@/features/ai/hooks/useOpencodeUsage"

const summary = { origins: [], total: { requests: 0, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, coverageFrom: null }

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe("useOpencodeUsage — rota por provedor", () => {
    beforeEach(() => {
        mocks.get.mockReset().mockResolvedValue({ data: { success: true, data: summary } })
    })

    it.each([
        ["opencode-go", "/ai/providers/opencode-go/usage"],
        ["opencode", "/ai/providers/opencode/usage"],
    ] as const)("%s consulta %s com o período", async (provider, url) => {
        const query = { from: "2026-11-01T00:00:00.000Z" }
        const { result } = renderHook(() => useOpencodeUsage(query, provider), { wrapper })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(mocks.get).toHaveBeenCalledWith(url, { params: query })
    })

    it("sem provedor, continua no OpenCode de sessão", async () => {
        const { result } = renderHook(() => useOpencodeUsage({}), { wrapper })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(mocks.get).toHaveBeenCalledWith("/ai/providers/opencode/usage", { params: {} })
    })
})
