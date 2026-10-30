/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

type Handler = () => void
const handlers = new Map<string, Set<Handler>>()
const channel = {
    bind: vi.fn((event: string, handler: Handler) => {
        if (!handlers.has(event)) handlers.set(event, new Set())
        handlers.get(event)!.add(handler)
    }),
    unbind: vi.fn((event: string, handler: Handler) => handlers.get(event)?.delete(handler)),
}
let available = true
const acquireChannel = vi.fn(() => channel)
const releaseChannel = vi.fn()

vi.mock("@/lib/pusher/client", () => ({ isPusherClientAvailable: () => available, acquireChannel, releaseChannel }))

const { useMaddoxCampaignsRealtime, MADDOX_CAMPAIGNS_KEY } = await import("@/features/maddox/hooks/useMaddoxCampaigns")

const emit = (event: string) => handlers.get(event)?.forEach((handler) => handler())

function setup(userId: string | null) {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, "invalidateQueries")
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const hook = renderHook(({ id }) => useMaddoxCampaignsRealtime(id), { wrapper, initialProps: { id: userId } })
    return { hook, invalidate }
}

describe("useMaddoxCampaignsRealtime", () => {
    beforeEach(() => {
        handlers.clear()
        available = true
        for (const fn of [acquireChannel, releaseChannel, channel.bind, channel.unbind]) fn.mockClear()
    })

    it("assina o canal do usuário e recarrega as campanhas a cada mudança e reconexão", () => {
        const { invalidate } = setup("u-1")
        expect(acquireChannel).toHaveBeenCalledWith("private-maddox-u-u-1")
        expect(invalidate).not.toHaveBeenCalled()

        emit("maddox.campaign.changed")
        expect(invalidate).toHaveBeenCalledWith({ queryKey: MADDOX_CAMPAIGNS_KEY })
        emit("pusher:subscription_succeeded")
        expect(invalidate).toHaveBeenCalledTimes(2)
    })

    it("na desmontagem desfaz os binds e libera o canal", () => {
        const { hook, invalidate } = setup("u-1")
        hook.unmount()
        expect(channel.unbind).toHaveBeenCalledWith("maddox.campaign.changed", expect.any(Function))
        expect(channel.unbind).toHaveBeenCalledWith("pusher:subscription_succeeded", expect.any(Function))
        expect(releaseChannel).toHaveBeenCalledWith("private-maddox-u-u-1")
        emit("maddox.campaign.changed")
        expect(invalidate).not.toHaveBeenCalled()
    })

    it("trocar de usuário libera o canal antigo e assina o novo", () => {
        const { hook } = setup("u-1")
        hook.rerender({ id: "u-2" })
        expect(releaseChannel).toHaveBeenCalledWith("private-maddox-u-u-1")
        expect(acquireChannel).toHaveBeenLastCalledWith("private-maddox-u-u-2")
    })

    it("sem usuário ou sem Pusher não assina nada", () => {
        setup(null)
        available = false
        setup("u-1")
        expect(acquireChannel).not.toHaveBeenCalled()
    })
})
