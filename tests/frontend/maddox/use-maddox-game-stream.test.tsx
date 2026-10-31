/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MADDOX_GAME_STREAM_RETRY_MS, MADDOX_GAME_STREAM_STALE_MS, useMaddoxGameStream } from "@/features/maddox/hooks/useMaddoxGameStream"
import type { MaddoxGameStreamLine, MaddoxLiveGenerationDto } from "@/features/maddox/game-types"

/** Um corpo NDJSON controlado pelo teste: `send` empurra linhas, `close` encerra, `fail` derruba a conexão. */
function controlledBody() {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
    const encoder = new TextEncoder()
    return {
        body,
        send: (...lines: MaddoxGameStreamLine[]) => controller.enqueue(encoder.encode(lines.map((line) => JSON.stringify(line)).join("\n") + "\n")),
        close: () => controller.close(),
        fail: () => controller.error(new Error("queda")),
    }
}

type Conn = ReturnType<typeof controlledBody> & { url: string; signal: AbortSignal }
const conns: Conn[] = []
let nextStatus: number[] = []

const fetchMock = vi.fn(async (url: string, init: { signal: AbortSignal }) => {
    const status = nextStatus.shift() ?? 200
    if (status !== 200) return new Response(JSON.stringify({ success: false }), { status })
    const conn = { ...controlledBody(), url, signal: init.signal }
    init.signal.addEventListener("abort", () => {
        try {
            conn.fail()
        } catch {
            // já encerrado
        }
    })
    conns.push(conn)
    return new Response(conn.body, { status: 200, headers: { "content-type": "application/x-ndjson" } })
})

const live = (over: Partial<MaddoxLiveGenerationDto> = {}): MaddoxLiveGenerationDto => ({ liveId: "l1", kind: "narration", turnNumber: 2, replyToId: null, text: "", tool: false, startedAt: "2026-10-31T10:00:00.000Z", ...over })

function setup(campaignId = "c1") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(client, "invalidateQueries")
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const view = renderHook(({ id, enabled }: { id: string; enabled: boolean }) => useMaddoxGameStream(id, enabled), { wrapper, initialProps: { id: campaignId, enabled: true } })
    return { ...view, invalidate }
}

beforeEach(() => {
    conns.length = 0
    nextStatus = []
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("useMaddoxGameStream", () => {
    it("conecta no stream da campanha e acompanha a geração; recarrega a mesa no snapshot inicial e no live-end", async () => {
        const { result, invalidate } = setup()
        await waitFor(() => expect(conns).toHaveLength(1))
        expect(conns[0]!.url).toBe("/api/maddox/campaigns/c1/game/stream")
        await act(async () => conns[0]!.send({ type: "snapshot", live: [] }))
        await waitFor(() => expect(result.current.connected).toBe(true))
        expect(invalidate).toHaveBeenCalledTimes(1)
        expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ["maddox", "campaigns"] })

        await act(async () => conns[0]!.send({ type: "live-start", live: live() }, { type: "delta", liveId: "l1", text: "A névoa " }, { type: "delta", liveId: "l1", text: "sobe." }))
        await waitFor(() => expect(result.current.live).toEqual([expect.objectContaining({ liveId: "l1", text: "A névoa sobe." })]))
        expect(invalidate).toHaveBeenCalledTimes(1)

        await act(async () => conns[0]!.send({ type: "live-end", liveId: "l1", messageId: "n2", error: null }))
        await waitFor(() => expect(result.current.finished).toBe(1))
        expect(result.current.live).toEqual([])
        expect(result.current.settled).toEqual([expect.objectContaining({ liveId: "l1", messageId: "n2", text: "A névoa sobe." })])
        expect(invalidate).toHaveBeenCalledTimes(2)
    })

    it("conexão que cai reconecta depois da espera e recebe o retrato do que está em andamento", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] })
        const { result } = setup()
        await waitFor(() => expect(conns).toHaveLength(1))
        await act(async () => conns[0]!.send({ type: "snapshot", live: [] }))
        await act(async () => conns[0]!.fail())
        await waitFor(() => expect(result.current.connected).toBe(false))
        expect(conns).toHaveLength(1)
        await act(async () => void (await vi.advanceTimersByTimeAsync(MADDOX_GAME_STREAM_RETRY_MS + 10)))
        await waitFor(() => expect(conns).toHaveLength(2))
        await act(async () => conns[1]!.send({ type: "snapshot", live: [live({ text: "Já em andamento" })] }))
        await waitFor(() => expect(result.current.live).toEqual([expect.objectContaining({ text: "Já em andamento" })]))
        expect(result.current.connected).toBe(true)
    })

    it("sem nenhuma linha (nem ping) pelo tempo limite, refaz a conexão", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] })
        setup()
        await waitFor(() => expect(conns).toHaveLength(1))
        await act(async () => void (await vi.advanceTimersByTimeAsync(MADDOX_GAME_STREAM_STALE_MS + 10)))
        expect(conns[0]!.signal.aborted).toBe(true)
        await act(async () => void (await vi.advanceTimersByTimeAsync(MADDOX_GAME_STREAM_RETRY_MS + 10)))
        await waitFor(() => expect(conns).toHaveLength(2))
    })

    it("falhas seguidas esperam cada vez mais (backoff); 401/403/404 param de reconectar", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ["setTimeout", "clearTimeout"] })
        nextStatus = [500, 500]
        const failing = setup()
        await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await act(async () => void (await vi.advanceTimersByTimeAsync(MADDOX_GAME_STREAM_RETRY_MS)))
        expect(fetchMock).toHaveBeenCalledTimes(2)
        // A segunda falha espera o dobro.
        await act(async () => void (await vi.advanceTimersByTimeAsync(MADDOX_GAME_STREAM_RETRY_MS)))
        expect(fetchMock).toHaveBeenCalledTimes(2)
        await act(async () => void (await vi.advanceTimersByTimeAsync(MADDOX_GAME_STREAM_RETRY_MS)))
        expect(fetchMock).toHaveBeenCalledTimes(3)
        failing.unmount()

        for (const status of [401, 403, 404]) {
            fetchMock.mockClear()
            nextStatus = [status]
            const view = setup()
            await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
            await act(async () => void (await vi.advanceTimersByTimeAsync(MADDOX_GAME_STREAM_RETRY_MS * 40)))
            expect(fetchMock, `status ${status}`).toHaveBeenCalledTimes(1)
            expect(view.result.current.connected).toBe(false)
            view.unmount()
        }
    })

    it("trocar de campanha fecha o stream anterior, conecta no novo e não mistura o estado", async () => {
        const { result, rerender } = setup("c1")
        await waitFor(() => expect(conns).toHaveLength(1))
        await act(async () => conns[0]!.send({ type: "snapshot", live: [live({ text: "Da campanha 1" })] }))
        await waitFor(() => expect(result.current.live).toHaveLength(1))

        rerender({ id: "c2", enabled: true })
        expect(result.current.live).toEqual([])
        await waitFor(() => expect(conns).toHaveLength(2))
        expect(conns[0]!.signal.aborted).toBe(true)
        expect(conns[1]!.url).toBe("/api/maddox/campaigns/c2/game/stream")
        await act(async () => conns[1]!.send({ type: "snapshot", live: [] }))
        await waitFor(() => expect(result.current.connected).toBe(true))
        expect(result.current.live).toEqual([])
    })

    it("desligado não conecta", async () => {
        const { rerender } = setup()
        await waitFor(() => expect(conns).toHaveLength(1))
        rerender({ id: "c1", enabled: false })
        expect(conns[0]!.signal.aborted).toBe(true)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(conns).toHaveLength(1)
    })
})
