/** @vitest-environment happy-dom */
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

type Handler = (payload: { type?: string }) => void
const handlers = vi.hoisted(() => new Map<string, Handler>())
vi.mock("@/lib/pusher/client", () => ({
    isPusherClientAvailable: () => true,
    acquireChannel: () => ({ bind: (event: string, handler: Handler) => handlers.set(event, handler), unbind: () => undefined }),
    releaseChannel: () => undefined,
}))

const { useEngramindRealtime } = await import("@/features/engramind/hooks/useEngramind")
const { UNIVERSE_LAYOUT_QUERY_KEY } = await import("@/features/engramind/hooks/useUniverseLayout")

function Probe() {
    useEngramindRealtime()
    return null
}

describe("tempo real da integração Engramind (aba Visualização, DND-34)", () => {
    it("`universe-layout` relê só o layout; os outros tipos não o tocam", () => {
        const client = new QueryClient()
        const keys = ["universe-layout", "sync", "migration", "connection"]
        for (const key of keys) client.setQueryData(["engramind-integration", key], { key })
        render(
            <QueryClientProvider client={client}>
                <Probe />
            </QueryClientProvider>,
        )
        const invalid = () => keys.filter((key) => client.getQueryState(["engramind-integration", key])?.isInvalidated)
        handlers.get("engramind-updated")!({ type: "sync.updated" })
        expect(invalid()).toEqual(["sync"])
        handlers.get("engramind-updated")!({ type: "universe-layout" })
        expect(invalid()).toEqual(["universe-layout", "sync"])
        expect(UNIVERSE_LAYOUT_QUERY_KEY).toEqual(["engramind-integration", "universe-layout"])
    })
})
