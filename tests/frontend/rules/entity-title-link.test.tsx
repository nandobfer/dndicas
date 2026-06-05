import type { AnchorHTMLAttributes, HTMLAttributes, PropsWithChildren } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

import { EntityTitleLink } from "@/features/rules/components/entity-title-link"

const setQueryData = vi.fn()

vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({
        setQueryData,
    }),
}))

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, whileHover, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { whileHover?: unknown }>) => {
            void whileHover
            return <div {...props}>{children}</div>
        },
        span: ({
            children,
            whileHover,
            transition,
            ...props
        }: PropsWithChildren<HTMLAttributes<HTMLSpanElement> & { whileHover?: unknown; transition?: unknown }>) => {
            void whileHover
            void transition
            return <span {...props}>{children}</span>
        },
    },
}))

describe("EntityTitleLink", () => {
    beforeEach(() => {
        setQueryData.mockReset()
    })

    it("primes the detail cache with the provided entity before navigation", () => {
        const entity = { _id: "spell-1", name: "Bola de Fogo", description: "Explode." }

        render(<EntityTitleLink name="Bola de Fogo" entityType="Magia" entity={entity} />)

        fireEvent.click(screen.getByRole("link", { name: "Bola de Fogo" }))

        expect(setQueryData).toHaveBeenCalledWith(["magia", "bola-de-fogo"], entity)
    })

    it("does not prime cache when no entity is provided", () => {
        render(<EntityTitleLink name="Bola de Fogo" entityType="Magia" />)

        fireEvent.click(screen.getByRole("link", { name: "Bola de Fogo" }))

        expect(setQueryData).not.toHaveBeenCalled()
    })

    it("stores NPC links in the NPC detail query shape", () => {
        const npc = { _id: "npc-1", name: "Mestre Ferreiro" }

        render(<EntityTitleLink name="Mestre Ferreiro" entityType="NPC" entity={npc} />)

        fireEvent.click(screen.getByRole("link", { name: "Mestre Ferreiro" }))

        expect(setQueryData).toHaveBeenCalledWith(["npc-detail", "mestre-ferreiro"], {
            items: [npc],
            total: 1,
            page: 1,
            limit: 1,
        })
    })

    it("renders a plain title when disabled", () => {
        render(<EntityTitleLink name="Bola de Fogo" entityType="Magia" entity={{ name: "Bola de Fogo" }} disableLink />)

        expect(screen.queryByRole("link", { name: "Bola de Fogo" })).not.toBeInTheDocument()
        expect(screen.getByText("Bola de Fogo")).toBeInTheDocument()
        expect(setQueryData).not.toHaveBeenCalled()
    })
})
