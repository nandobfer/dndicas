import type { HTMLAttributes, PropsWithChildren } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import NpcDetailPage from "@/app/(dashboard)/my-npcs/[slug]/page"

const queryMockState = vi.hoisted(() => ({
    result: {
        data: {
            items: [{ _id: "npc-1", name: "Mestre Ferreiro" }],
        } as { items: { _id: string; name: string }[] } | undefined,
        isLoading: false,
    },
}))

vi.mock("next/navigation", () => ({
    useParams: () => ({ slug: "mestre-ferreiro" }),
    useRouter: () => ({
        back: vi.fn(),
    }),
}))

vi.mock("@tanstack/react-query", () => ({
    useQuery: () => queryMockState.result,
}))

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, variants, initial, animate, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { variants?: unknown; initial?: unknown; animate?: unknown }>) => {
            void variants
            void initial
            void animate
            return <div {...props}>{children}</div>
        },
    },
}))

vi.mock("@/components/ui/glass-card", () => ({
    GlassCard: ({ children }: PropsWithChildren) => <div>{children}</div>,
    GlassCardContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

vi.mock("@/components/ui/empty-state", () => ({
    EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("@/features/monsters/components/npc-preview", () => ({
    NpcPreview: ({ monster }: { monster: { name: string } }) => <div data-testid="npc-preview">{monster.name}</div>,
}))

describe("NpcDetailPage cache rendering", () => {
    beforeEach(() => {
        queryMockState.result = {
            data: {
                items: [{ _id: "npc-1", name: "Mestre Ferreiro" }],
            },
            isLoading: false,
        }
    })

    it("renders cached NPC data without showing loading", () => {
        queryMockState.result = {
            data: {
                items: [{ _id: "npc-1", name: "Mestre Ferreiro" }],
            },
            isLoading: true,
        }

        render(<NpcDetailPage />)

        expect(screen.getByTestId("npc-preview")).toHaveTextContent("Mestre Ferreiro")
        expect(screen.queryByText(/npc não encontrado/i)).not.toBeInTheDocument()
    })

    it("keeps the loading state when there is no cached NPC data", () => {
        queryMockState.result = {
            data: undefined,
            isLoading: true,
        }

        render(<NpcDetailPage />)

        expect(screen.queryByTestId("npc-preview")).not.toBeInTheDocument()
        expect(screen.queryByText(/npc não encontrado/i)).not.toBeInTheDocument()
    })
})
