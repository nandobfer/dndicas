import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    searchUnifiedInWorkerProgressively: vi.fn(),
    peekUnifiedSearch: vi.fn(),
    reactRendererInstances: [] as Array<{
        props: Record<string, unknown>
        updateProps: ReturnType<typeof vi.fn>
        destroy: ReturnType<typeof vi.fn>
        element: HTMLDivElement
    }>,
}))

vi.mock("@/core/utils/search-worker-client", () => ({
    searchUnifiedInWorkerProgressively: mocks.searchUnifiedInWorkerProgressively,
}))

vi.mock("@/core/utils/search-engine", () => ({
    peekUnifiedSearch: mocks.peekUnifiedSearch,
}))

vi.mock("@tiptap/react", () => ({
    ReactRenderer: class MockReactRenderer {
        props: Record<string, unknown>
        updateProps = vi.fn((nextProps: Record<string, unknown>) => {
            this.props = { ...this.props, ...nextProps }
        })
        destroy = vi.fn()
        element = document.createElement("div")
        ref = null

        constructor(_component: unknown, options: { props: Record<string, unknown> }) {
            this.props = options.props
            mocks.reactRendererInstances.push(this)
        }
    },
}))

vi.mock("tippy.js", () => ({
    default: vi.fn(() => ({
        destroy: vi.fn(),
        hide: vi.fn(),
        setProps: vi.fn(),
    })),
}))

describe("getSuggestionConfig worker search", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.resetModules()
        mocks.searchUnifiedInWorkerProgressively.mockReset()
        mocks.peekUnifiedSearch.mockReset()
        mocks.reactRendererInstances.length = 0
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("returns immediately and updates the rendered mention list with worker results", async () => {
        const editor = {
            isDestroyed: false,
            commands: { blur: vi.fn(), insertContent: vi.fn() },
            state: { selection: { empty: true, from: 1 } },
        }
        let resolveWorkerSearch: (items: unknown[]) => void = () => undefined
        mocks.searchUnifiedInWorkerProgressively.mockReturnValue(new Promise((resolve) => {
            resolveWorkerSearch = resolve
        }))

        const workerResults = [
            { id: "spell-1", _id: "spell-1", name: "Raio de Fogo", label: "Raio de Fogo", type: "Magia", status: "active" },
            { id: "excluded", _id: "excluded", name: "Excluir", label: "Excluir", type: "Regra", status: "active" },
        ]

        const { getSuggestionConfig } = await import("@/features/rules/utils/suggestion")
        const config = getSuggestionConfig({
            excludeId: "excluded",
            specificEntityMentions: ["Magia", "Regra"],
        })
        const renderer = config.render()

        const initialItems = await config.items({ query: "raio" })
        renderer.onStart?.({
            editor,
            items: initialItems,
            query: "raio",
            text: "@raio",
            range: { from: 1, to: 6 },
            command: vi.fn(),
            decorationNode: null,
            clientRect: () => new DOMRect(),
        })

        expect(initialItems).toEqual([])
        expect(mocks.reactRendererInstances[0].props).toEqual(expect.objectContaining({
            items: [],
            loading: true,
            query: "raio",
        }))

        await vi.advanceTimersByTimeAsync(299)

        expect(mocks.searchUnifiedInWorkerProgressively).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        resolveWorkerSearch(workerResults)
        await vi.runAllTicks()

        expect(mocks.reactRendererInstances[0].updateProps).toHaveBeenLastCalledWith({
            items: [
                expect.objectContaining({
                    id: "spell-1",
                    label: "Raio de Fogo",
                    entityType: "Magia",
                }),
            ],
            loading: false,
            query: "raio",
        })
        expect(mocks.searchUnifiedInWorkerProgressively).toHaveBeenCalledWith(
            "raio",
            10,
            0,
            expect.objectContaining({ specificEntityTypes: ["Magia", "Regra"] }),
            expect.any(Function),
        )
        expect(mocks.peekUnifiedSearch).not.toHaveBeenCalled()
    })

    it("updates the rendered mention list with partial results while keeping loading active", async () => {
        const editor = {
            isDestroyed: false,
            commands: { blur: vi.fn(), insertContent: vi.fn() },
            state: { selection: { empty: true, from: 1 } },
        }
        mocks.searchUnifiedInWorkerProgressively.mockImplementation((_query, _limit, _offset, _options, onPartial) => {
            onPartial?.({
                results: [{ id: "rule-1", _id: "rule-1", name: "Raio", label: "Raio", type: "Regra", status: "active" }],
                loadedProviders: 1,
                totalProviders: 2,
                done: false,
            })

            return Promise.resolve([
                { id: "spell-1", _id: "spell-1", name: "Raio de Fogo", label: "Raio de Fogo", type: "Magia", status: "active" },
            ])
        })

        const { getSuggestionConfig } = await import("@/features/rules/utils/suggestion")
        const config = getSuggestionConfig()
        const renderer = config.render()

        const initialItems = await config.items({ query: "raio" })
        renderer.onStart?.({
            editor,
            items: initialItems,
            query: "raio",
            text: "@raio",
            range: { from: 1, to: 6 },
            command: vi.fn(),
            decorationNode: null,
            clientRect: () => new DOMRect(),
        })

        await vi.advanceTimersByTimeAsync(300)
        await vi.runAllTicks()

        expect(mocks.reactRendererInstances[0].updateProps).toHaveBeenCalledWith({
            items: [expect.objectContaining({ id: "rule-1", entityType: "Regra" })],
            loading: true,
            query: "raio",
        })
        expect(mocks.reactRendererInstances[0].updateProps).toHaveBeenLastCalledWith({
            items: [expect.objectContaining({ id: "spell-1", entityType: "Magia" })],
            loading: false,
            query: "raio",
        })
    })

    it("ignores stale worker responses from older queries", async () => {
        const editor = {
            isDestroyed: false,
            commands: { blur: vi.fn(), insertContent: vi.fn() },
            state: { selection: { empty: true, from: 1 } },
        }
        const resolvers: Array<(items: unknown[]) => void> = []
        mocks.searchUnifiedInWorkerProgressively.mockImplementation(() => new Promise((resolve) => {
            resolvers.push(resolve)
        }))

        const { getSuggestionConfig } = await import("@/features/rules/utils/suggestion")
        const config = getSuggestionConfig()
        const renderer = config.render()

        const firstItems = await config.items({ query: "rai" })
        renderer.onStart?.({
            editor,
            items: firstItems,
            query: "rai",
            text: "@rai",
            range: { from: 1, to: 5 },
            command: vi.fn(),
            decorationNode: null,
            clientRect: () => new DOMRect(),
        })

        await vi.advanceTimersByTimeAsync(300)
        await config.items({ query: "raio" })
        await vi.advanceTimersByTimeAsync(300)

        resolvers[0]([{ id: "old", _id: "old", name: "Antigo", label: "Antigo", type: "Regra", status: "active" }])
        await vi.runAllTicks()

        expect(mocks.reactRendererInstances[0].updateProps).not.toHaveBeenCalledWith(expect.objectContaining({
            items: [expect.objectContaining({ id: "old" })],
        }))

        resolvers[1]([{ id: "spell-1", _id: "spell-1", name: "Raio de Fogo", label: "Raio de Fogo", type: "Magia", status: "active" }])
        await vi.runAllTicks()

        expect(mocks.reactRendererInstances[0].updateProps).toHaveBeenLastCalledWith({
            items: [
                expect.objectContaining({
                id: "spell-1",
                label: "Raio de Fogo",
                entityType: "Magia",
                }),
            ],
            loading: false,
            query: "raio",
        })
    })
})
