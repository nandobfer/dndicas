import type { HTMLAttributes, PropsWithChildren } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

const copyActionMockState = vi.hoisted(() => ({
    handleCopyToNpc: vi.fn(),
}))

const routerMockState = vi.hoisted(() => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
}))

const searchParamsMockState = vi.hoisted(() => ({
    edit: null as string | null,
}))

vi.mock("next/navigation", () => ({
    useParams: () => ({ slug: "mestre-ferreiro" }),
    useRouter: () => routerMockState,
    useSearchParams: () => ({
        get: (key: string) => (key === "edit" ? searchParamsMockState.edit : null),
    }),
}))

vi.mock("@tanstack/react-query", () => ({
    useQuery: () => queryMockState.result,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock("framer-motion", () => ({
    motion: {
        button: ({ children, whileHover, whileTap, ...props }: PropsWithChildren<HTMLAttributes<HTMLButtonElement> & { whileHover?: unknown; whileTap?: unknown }>) => {
            void whileHover
            void whileTap
            return <button {...props}>{children}</button>
        },
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

vi.mock("@/components/ui/glass-dropdown-menu", () => ({
    GlassDropdownMenu: ({ children }: PropsWithChildren) => <div>{children}</div>,
    GlassDropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
    GlassDropdownMenuContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
    GlassDropdownMenuItem: ({ children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) => <div {...props}>{children}</div>,
}))

vi.mock("@/features/monsters/components/user-npc-form-modal", () => ({
    UserNpcFormModal: ({ isOpen, npc }: { isOpen: boolean; npc: { name?: string } | null }) => (isOpen ? <div data-testid="npc-form-modal">{npc?.name}</div> : null),
}))

vi.mock("@/features/monsters/hooks/useCopyToNpcAction", () => ({
    getNpcDetailHref: (npc: { name: string }, options: { edit?: boolean } = {}) => `/my-npcs/${encodeURIComponent(npc.name.toLowerCase().trim().replace(/\s+/g, "-"))}${options.edit ? "?edit=1" : ""}`,
    useCopyToNpcAction: (_sourceType: "monster" | "npc", options?: { onCopied?: (npc: { _id: string; name: string }) => void }) => ({
        copiedNpc: null,
        isFormOpen: false,
        handleCopyToNpc: (npc: { name: string }) => {
            copyActionMockState.handleCopyToNpc(npc)
            options?.onCopied?.({ _id: "npc-2", name: `${npc.name} (Cópia)` })
        },
        closeForm: vi.fn(),
        handleSuccess: vi.fn(),
    }),
}))

describe("NpcDetailPage cache rendering", () => {
    beforeEach(() => {
        copyActionMockState.handleCopyToNpc.mockReset()
        routerMockState.back.mockReset()
        routerMockState.push.mockReset()
        routerMockState.replace.mockReset()
        searchParamsMockState.edit = null
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

    it("copies the current NPC from the detail action menu", () => {
        render(<NpcDetailPage />)

        fireEvent.click(screen.getByText("Copiar para NPC"))

        expect(copyActionMockState.handleCopyToNpc).toHaveBeenCalledWith(expect.objectContaining({ name: "Mestre Ferreiro" }))
        expect(routerMockState.push).toHaveBeenCalledWith("/my-npcs/mestre-ferreiro-(c%C3%B3pia)?edit=1")
    })

    it("opens the edit modal from the detail action menu", () => {
        render(<NpcDetailPage />)

        fireEvent.click(screen.getByText("Editar"))

        expect(screen.getByTestId("npc-form-modal")).toHaveTextContent("Mestre Ferreiro")
    })

    it("opens edit modal automatically when edit query param is present", async () => {
        searchParamsMockState.edit = "1"

        render(<NpcDetailPage />)

        await waitFor(() => expect(screen.getByTestId("npc-form-modal")).toHaveTextContent("Mestre Ferreiro"))
        expect(routerMockState.replace).not.toHaveBeenCalled()
    })
})
