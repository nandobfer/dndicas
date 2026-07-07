import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Editor } from "@tiptap/core"

const mocks = vi.hoisted(() => ({
    searchUnifiedEntitiesOnServer: vi.fn(),
    reactRendererInstances: [] as Array<{
        props: Record<string, unknown>
        updateProps: ReturnType<typeof vi.fn>
        destroy: ReturnType<typeof vi.fn>
        element: HTMLDivElement
    }>,
}))

vi.mock("@/core/utils/unified-search-client", () => ({
    searchUnifiedEntitiesOnServer: mocks.searchUnifiedEntitiesOnServer,
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

function createEditorMock(): Editor {
    return {
        isDestroyed: false,
        commands: { blur: vi.fn(), insertContent: vi.fn() },
        state: { selection: { empty: true, from: 1 } },
    } as unknown as Editor
}

describe("getSuggestionConfig server search", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.resetModules()
        mocks.searchUnifiedEntitiesOnServer.mockReset()
        mocks.reactRendererInstances.length = 0
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("returns immediately and updates the rendered mention list with server results", async () => {
        const editor = createEditorMock()
        let resolveWorkerSearch: (items: unknown[]) => void = () => undefined
        mocks.searchUnifiedEntitiesOnServer.mockReturnValue(new Promise((resolve) => {
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

        expect(mocks.searchUnifiedEntitiesOnServer).not.toHaveBeenCalled()

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
        expect(mocks.searchUnifiedEntitiesOnServer).toHaveBeenCalledWith(
            "raio",
            10,
            0,
            expect.objectContaining({ specificEntityTypes: ["Magia", "Regra"] }),
        )
    })

    it("keeps loading active until server results resolve", async () => {
        const editor = createEditorMock()
        mocks.searchUnifiedEntitiesOnServer.mockResolvedValue([
            { id: "spell-1", _id: "spell-1", name: "Raio de Fogo", label: "Raio de Fogo", type: "Magia", status: "active" },
        ])

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

        expect(mocks.reactRendererInstances[0].updateProps).toHaveBeenLastCalledWith({
            items: [expect.objectContaining({ id: "spell-1", entityType: "Magia" })],
            loading: false,
            query: "raio",
        })
    })

    it("ignores stale worker responses from older queries", async () => {
        const editor = createEditorMock()
        const resolvers: Array<(items: unknown[]) => void> = []
        mocks.searchUnifiedEntitiesOnServer.mockImplementation(() => new Promise((resolve) => {
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
