import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EntityGenerationAIModal, type EntityGenerationAdapter } from "@/features/entity-generation/components/entity-generation-ai-modal"
import { ENTITY_GENERATION_PUSHER_EVENTS } from "@/features/entity-generation/realtime/entity-generation-pusher"

const realtimeMocks = vi.hoisted(() => {
    const mockGetPusherBrowserConfig = vi.fn()
    const mockSubscribe = vi.fn()
    const mockUnsubscribe = vi.fn()

    return { mockGetPusherBrowserConfig, mockSubscribe, mockUnsubscribe }
})

vi.mock("@/components/ui/glass-modal", () => ({
    GlassModal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
    GlassModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    GlassModalDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    GlassModalFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
    GlassModalHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
    GlassModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock("sonner", () => ({
    toast: { success: vi.fn() },
}))

vi.mock("@/core/realtime/pusher-browser-config", () => ({
    getPusherBrowserConfig: realtimeMocks.mockGetPusherBrowserConfig,
}))

vi.mock("@/core/realtime/pusher-browser-service", () => ({
    PusherBrowserService: {
        getInstance: vi.fn(() => ({
            subscribe: realtimeMocks.mockSubscribe,
            unsubscribe: realtimeMocks.mockUnsubscribe,
        })),
    },
}))

interface TestEntity {
    _id: string
    name: string
}

interface TestCandidate {
    id: string
    label: string
}

class MockChannel {
    private listeners = new Map<string, Array<(event: MessageEvent) => void>>()

    bind(event: string, listener: (event: MessageEvent) => void) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    }

    unbind = vi.fn()

    emit(event: string, data: unknown = {}) {
        for (const listener of this.listeners.get(event) ?? []) {
            listener(data as MessageEvent)
        }
    }
}

describe("EntityGenerationAIModal", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "run-1") })
        vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000)
        vi.spyOn(Math, "random").mockReturnValue(0.5)
        realtimeMocks.mockGetPusherBrowserConfig.mockResolvedValue({
            key: "key",
            wsHost: "pusher.local",
            wsPort: 6001,
            wssPort: 6001,
            forceTLS: false,
            enabledTransports: ["ws"],
            cluster: "mt1",
        })
    })

    it("subscribes to Pusher, updates progress, and keeps an entity snapshot while saving", async () => {
        const channel = new MockChannel()
        realtimeMocks.mockSubscribe.mockReturnValue(channel)
        const entity = { _id: "entity-1", name: "Entidade Atual" }
        const candidate = { id: "candidate-1", label: "Candidato" }
        const renderComparison = vi.fn((current: TestEntity) => <div>Comparando {current.name}</div>)
        const generate = vi.fn().mockResolvedValue({ candidates: [candidate] })
        const apply = vi.fn().mockResolvedValue(undefined)
        const adapter: EntityGenerationAdapter<TestEntity, TestCandidate> = {
            entityName: "Entidade",
            getId: (item) => item._id,
            getTitle: (item) => item.name,
            getCandidateId: (item) => item.id,
            getCandidateLabel: (item) => item.label,
            generate,
            apply,
            renderComparison,
        }

        function Harness() {
            const [open, setOpen] = React.useState(true)
            const [currentEntity, setCurrentEntity] = React.useState<TestEntity | null>(entity)

            return (
                <EntityGenerationAIModal
                    open={open}
                    entity={currentEntity}
                    adapter={adapter}
                    onApplied={() => setCurrentEntity(null)}
                    onOpenChange={setOpen}
                />
            )
        }

        render(<Harness />)

        await waitFor(() => expect(realtimeMocks.mockSubscribe).toHaveBeenCalledWith(expect.any(Object), "entity-generation.run-1"))

        await act(async () => {
            channel.emit(ENTITY_GENERATION_PUSHER_EVENTS.progress, { current: 2, total: 4, message: "Traduzindo raça" })
        })

        expect(screen.getByText("Traduzindo raça")).toBeInTheDocument()
        expect(screen.getByText("50%")).toBeInTheDocument()
        expect(generate).not.toHaveBeenCalled()

        await act(async () => {
            channel.emit("pusher:subscription_succeeded")
        })

        await waitFor(() => expect(generate).toHaveBeenCalledWith(entity, "run-1"))
        expect(screen.getByText("Comparando Entidade Atual")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(apply).toHaveBeenCalledWith(entity, candidate))
        expect(renderComparison.mock.calls.every(([current]) => current?.name === "Entidade Atual")).toBe(true)
    })

    it("falls back to the final HTTP result when Pusher config is unavailable", async () => {
        realtimeMocks.mockGetPusherBrowserConfig.mockResolvedValue(null)
        const entity = { _id: "entity-1", name: "Entidade Atual" }
        const candidate = { id: "candidate-1", label: "Candidato" }
        const adapter: EntityGenerationAdapter<TestEntity, TestCandidate> = {
            entityName: "Entidade",
            getId: (item) => item._id,
            getTitle: (item) => item.name,
            getCandidateId: (item) => item.id,
            getCandidateLabel: (item) => item.label,
            generate: vi.fn().mockResolvedValue({ candidates: [candidate] }),
            apply: vi.fn().mockResolvedValue(undefined),
            renderComparison: (current) => <div>Comparando {current.name}</div>,
        }

        render(<EntityGenerationAIModal open entity={entity} adapter={adapter} onOpenChange={vi.fn()} />)

        await waitFor(() => expect(adapter.generate).toHaveBeenCalledWith(entity, "run-1"))
        expect(realtimeMocks.mockSubscribe).not.toHaveBeenCalled()
        expect(screen.getByText("Comparando Entidade Atual")).toBeInTheDocument()
    })

    it("creates a fallback run id when crypto.randomUUID is unavailable", async () => {
        vi.stubGlobal("crypto", {})
        const channel = new MockChannel()
        realtimeMocks.mockSubscribe.mockReturnValue(channel)
        const entity = { _id: "entity-1", name: "Entidade Atual" }
        const adapter: EntityGenerationAdapter<TestEntity, TestCandidate> = {
            entityName: "Entidade",
            getId: (item) => item._id,
            getTitle: (item) => item.name,
            getCandidateId: (item) => item.id,
            getCandidateLabel: (item) => item.label,
            generate: vi.fn().mockResolvedValue({ candidates: [] }),
            apply: vi.fn().mockResolvedValue(undefined),
            renderComparison: (current) => <div>Comparando {current.name}</div>,
        }

        render(<EntityGenerationAIModal open entity={entity} adapter={adapter} onOpenChange={vi.fn()} />)

        await waitFor(() => expect(realtimeMocks.mockSubscribe).toHaveBeenCalledWith(expect.any(Object), "entity-generation.loyw3v28-i"))

        await act(async () => {
            channel.emit("pusher:subscription_succeeded")
        })

        await waitFor(() => expect(adapter.generate).toHaveBeenCalledWith(entity, "loyw3v28-i"))
    })
})
