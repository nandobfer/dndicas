import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AdminSheetsTable } from "@/features/character-sheets/components/admin-sheets-table"
import type { AdminSheetListItem } from "@/features/character-sheets/types/character-sheet.types"

const routerPush = vi.fn()

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: routerPush }),
}))

vi.mock("framer-motion", async () => {
    const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion")
    type MotionProps = React.HTMLAttributes<HTMLElement> & {
        children?: React.ReactNode
        layout?: boolean
        variants?: unknown
        initial?: unknown
        animate?: unknown
        exit?: unknown
        transition?: unknown
    }
    const MockTr = ({ children, layout, variants, initial, animate, exit, transition, ...props }: MotionProps) => {
        void layout
        void variants
        void initial
        void animate
        void exit
        void transition
        return <tr {...props}>{children}</tr>
    }
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: { tr: MockTr },
    }
})

vi.mock("@/components/ui/glass-card", () => ({
    GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassCardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

vi.mock("@/components/ui/user-mini", () => ({
    UserMini: ({ name, username }: { name: string; username: string }) => <div>{`${name} (${username})`}</div>,
}))

vi.mock("@/components/ui/loading-state", () => ({
    LoadingState: ({ message }: { message?: string }) => <div>{message || "loading"}</div>,
}))

vi.mock("@/components/ui/empty-state", () => ({
    EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("@/components/ui/error-state", () => ({
    ErrorState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("@/components/ui/infinite-scroll-sentinel", () => ({
    InfiniteScrollSentinel: ({ onLoadMore, hasNextPage }: { onLoadMore?: () => void; hasNextPage?: boolean }) => (
        <button type="button" data-has-next-page={String(hasNextPage)} onClick={onLoadMore}>Carregar mais</button>
    ),
}))

vi.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => <span>{html}</span>,
}))

const item: AdminSheetListItem = {
    id: "sheet-1",
    slug: "kael",
    name: "Kael",
    photo: null,
    level: 7,
    class: "Guerreiro",
    subclass: "Campeão",
    race: "Humano",
    origin: "Soldado",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    owner: {
        id: "user-1",
        name: "Nando",
        username: "nandobfer",
        avatarUrl: null,
    },
}

describe("AdminSheetsTable", () => {
    beforeEach(() => {
        routerPush.mockReset()
    })

    it("uses infinite scrolling instead of table pagination", () => {
        const onLoadMore = vi.fn()

        render(
            <AdminSheetsTable
                items={[item]}
                isLoading={false}
                hasNextPage
                isFetchingNextPage={false}
                onLoadMore={onLoadMore}
                onRetry={vi.fn()}
            />
        )

        expect(screen.queryByText(/Página/i)).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }))
        expect(onLoadMore).toHaveBeenCalledTimes(1)
    })

    it("navigates to the sheet detail when clicking a row", () => {
        render(
            <AdminSheetsTable
                items={[item]}
                isLoading={false}
                hasNextPage={false}
                isFetchingNextPage={false}
                onLoadMore={vi.fn()}
                onRetry={vi.fn()}
            />
        )

        fireEvent.click(screen.getByText("Kael"))

        expect(routerPush).toHaveBeenCalledWith("/sheets/kael")
    })
})
