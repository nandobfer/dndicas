import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdminSheetsList } from "@/features/character-sheets/components/admin-sheets-list"
import type { AdminSheetListItem } from "@/features/character-sheets/types/character-sheet.types"

const routerPush = vi.fn()

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: routerPush,
    }),
}))

vi.mock("framer-motion", async () => {
    const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion")

    type MockProps = React.HTMLAttributes<HTMLDivElement> & {
        children?: React.ReactNode
        layout?: boolean
        variants?: unknown
        initial?: unknown
        animate?: unknown
        exit?: unknown
        transition?: unknown
    }

    const MockDiv = ({ children, layout, variants, initial, animate, exit, transition, ...props }: MockProps) => {
        void layout
        void variants
        void initial
        void animate
        void exit
        void transition
        return <div {...props}>{children}</div>
    }

    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            div: MockDiv,
        },
    }
})

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({
        src,
        alt,
        expandLabel,
    }: {
        src: string
        alt: string
        expandLabel?: string
    }) => (
        <button type="button" aria-label={expandLabel} data-testid="admin-sheet-photo" data-src={src}>
            {alt}
        </button>
    ),
}))

vi.mock("@/components/ui/glass-card", () => ({
    GlassCard: ({
        children,
        onClick,
        className,
    }: {
        children: React.ReactNode
        onClick?: () => void
        className?: string
    }) => (
        <div role="button" tabIndex={0} className={className} onClick={onClick}>
            {children}
        </div>
    ),
    GlassCardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
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

vi.mock("@/components/ui/user-mini", () => ({
    UserMini: ({ name, username }: { name: string; username: string }) => <div>{`${name} (${username})`}</div>,
}))

vi.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => <span>{html}</span>,
}))

const item: AdminSheetListItem = {
    id: "sheet-1",
    slug: "kael",
    name: "Kael",
    photo: "/api/upload?key=kael.webp",
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

describe("AdminSheetsList", () => {
    beforeEach(() => {
        routerPush.mockReset()
        class IntersectionObserverMock {
            observe() {}
            disconnect() {}
        }

        vi.stubGlobal("IntersectionObserver", IntersectionObserverMock)
    })

    it("renders the sheet photo and the character level subtitle", () => {
        render(
            <AdminSheetsList
                items={[item]}
                isLoading={false}
                hasNextPage={false}
                isFetchingNextPage={false}
                onLoadMore={vi.fn()}
                onRetry={vi.fn()}
            />
        )

        expect(screen.getByTestId("admin-sheet-photo")).toHaveAttribute("data-src", "/api/upload?key=kael.webp")
        expect(screen.getByText("Nível 7")).toBeInTheDocument()
        expect(screen.queryByText(/avatar ausente|avatar pendente/i)).not.toBeInTheDocument()
    })

    it("does not navigate when clicking the character image", () => {
        render(
            <AdminSheetsList
                items={[item]}
                isLoading={false}
                hasNextPage={false}
                isFetchingNextPage={false}
                onLoadMore={vi.fn()}
                onRetry={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Abrir foto ampliada de Kael" }))

        expect(routerPush).not.toHaveBeenCalled()
    })

    it("navigates to the sheet when clicking the row card", () => {
        const { container } = render(
            <AdminSheetsList
                items={[item]}
                isLoading={false}
                hasNextPage={false}
                isFetchingNextPage={false}
                onLoadMore={vi.fn()}
                onRetry={vi.fn()}
            />
        )

        fireEvent.click(container.querySelector(".cursor-pointer.overflow-hidden.transition-colors.hover\\:bg-white\\/\\[0\\.03\\]") as HTMLElement)

        expect(routerPush).toHaveBeenCalledWith("/sheets/kael")
    })
})
