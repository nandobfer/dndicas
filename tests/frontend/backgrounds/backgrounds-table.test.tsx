import { screen } from "@testing-library/react"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import type { ReactNode } from "react"
import { renderWithQueryClient as render } from "../test-utils"
import { BackgroundsTable } from "@/features/backgrounds/components/backgrounds-table"
import type { Background } from "@/features/backgrounds/types/backgrounds.types"

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock("@/core/hooks/useAuth", () => ({
    useAuth: () => ({ isAdmin: false }),
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => <img src={src} alt={alt} className={className} />,
}))

vi.mock("@/components/ui/glass-dropdown-menu", () => ({
    GlassDropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    GlassDropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuItem: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

vi.mock("@/components/ui/glass-tooltip", () => ({
    SimpleGlassTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...props}>{children}</tr>,
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
    },
}))

const baseBackground: Background = {
    _id: "background-1",
    name: "Soldado",
    description: "<p>Treinado para a guerra.</p>",
    source: "PHB",
    status: "active",
    skillProficiencies: ["Atletismo"],
    suggestedAttributes: ["Força"],
    equipment: "Espada curta",
    traits: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe("BackgroundsTable", () => {
    beforeEach(() => {
        class MockIntersectionObserver {
            observe = vi.fn()
            disconnect = vi.fn()
            unobserve = vi.fn()
            takeRecords = vi.fn(() => [])
            root = null
            rootMargin = ""
            thresholds = []
        }

        vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)
    })

    afterAll(() => {
        vi.unstubAllGlobals()
    })

    it("renders the background image in the identity column", () => {
        render(<BackgroundsTable data={[{ ...baseBackground, image: "/soldado.png" }]} isLoading={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.getByRole("img", { name: "Soldado" })).toHaveAttribute("src", "/soldado.png")
        expect(screen.getByRole("link", { name: "Soldado" })).toHaveAttribute("href", "/backgrounds/soldado")
    })

    it("falls back to the shield icon when there is no image", () => {
        render(<BackgroundsTable data={[baseBackground]} isLoading={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.queryByRole("img", { name: "Soldado" })).not.toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Soldado" })).toBeInTheDocument()
    })
})
