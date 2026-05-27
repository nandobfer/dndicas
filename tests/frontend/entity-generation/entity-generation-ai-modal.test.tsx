import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { EntityGenerationAIModal, type EntityGenerationAdapter } from "@/features/entity-generation/components/entity-generation-ai-modal"

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

interface TestEntity {
    _id: string
    name: string
}

interface TestCandidate {
    id: string
    label: string
}

class MockEventSource {
    static instances: MockEventSource[] = []

    onerror: (() => void) | null = null
    private listeners = new Map<string, Array<(event: MessageEvent) => void>>()

    constructor(readonly url: string) {
        MockEventSource.instances.push(this)
    }

    addEventListener(event: string, listener: (event: MessageEvent) => void) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    }

    close = vi.fn()

    emit(event: string, data: unknown = {}) {
        for (const listener of this.listeners.get(event) ?? []) {
            listener({ data: JSON.stringify(data) } as MessageEvent)
        }
    }
}

describe("EntityGenerationAIModal", () => {
    it("keeps an entity snapshot while saving so comparison never receives null", async () => {
        MockEventSource.instances = []
        vi.stubGlobal("EventSource", MockEventSource)

        const entity = { _id: "entity-1", name: "Entidade Atual" }
        const candidate = { id: "candidate-1", label: "Candidato" }
        const renderComparison = vi.fn((current: TestEntity) => <div>Comparando {current.name}</div>)
        const apply = vi.fn().mockResolvedValue(undefined)
        const adapter: EntityGenerationAdapter<TestEntity, TestCandidate> = {
            entityName: "Entidade",
            getId: (item) => item._id,
            getTitle: (item) => item.name,
            getCandidateId: (item) => item.id,
            getCandidateLabel: (item) => item.label,
            streamUrl: (item) => `/stream/${item._id}`,
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

        await act(async () => {
            MockEventSource.instances[0].emit("candidate", candidate)
            MockEventSource.instances[0].emit("done")
        })

        expect(screen.getByText("Comparando Entidade Atual")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: /salvar/i }))

        await waitFor(() => expect(apply).toHaveBeenCalledWith(entity, candidate))
        expect(renderComparison.mock.calls.every(([current]) => current?.name === "Entidade Atual")).toBe(true)

        vi.unstubAllGlobals()
    })
})
