/**
 * @fileoverview Tests for GlassImage lightbox interactions.
 */

import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import { GlassImage } from "@/components/ui/glass-image"

vi.mock("framer-motion", async () => {
    const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion")

    type MockDivProps = React.HTMLAttributes<HTMLDivElement> & {
        children?: React.ReactNode
        layoutId?: string
        initial?: unknown
        animate?: unknown
        exit?: unknown
        transition?: unknown
    }

    type MockImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
        children?: React.ReactNode
        layoutId?: string
        initial?: unknown
        animate?: unknown
        exit?: unknown
        transition?: unknown
    }

    const MockDiv = ({ children, layoutId, initial, animate, exit, transition, ...props }: MockDivProps) => {
        void layoutId
        void initial
        void animate
        void exit
        void transition

        return <div {...props}>{children}</div>
    }

    const MockImg = ({ children, layoutId, initial, animate, exit, transition, alt, ...props }: MockImageProps) => {
        void children
        void layoutId
        void initial
        void animate
        void exit
        void transition

        // eslint-disable-next-line @next/next/no-img-element
        return <img alt={alt || ""} {...props} />
    }

    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            div: MockDiv,
            img: MockImg,
        },
    }
})

describe("GlassImage", () => {
    it("opens and closes the enlarged image dialog", async () => {
        render(<GlassImage src="https://example.com/image.png" alt="Imagem de teste" />)

        fireEvent.click(screen.getByRole("button", { name: "Abrir imagem ampliada de Imagem de teste" }))

        expect(screen.getByRole("dialog", { name: "Imagem de teste" })).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Fechar visualização ampliada" }))

        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "Imagem de teste" })).not.toBeInTheDocument()
        })
    })

    it("does not bubble trigger or close interactions to the surrounding container", async () => {
        const onContainerClick = vi.fn()

        render(
            <div onClick={onContainerClick}>
                <GlassImage src="https://example.com/image.png" alt="Imagem protegida" />
            </div>
        )

        fireEvent.click(screen.getByRole("button", { name: "Abrir imagem ampliada de Imagem protegida" }))

        expect(onContainerClick).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole("button", { name: "Fechar visualização ampliada" }))

        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "Imagem protegida" })).not.toBeInTheDocument()
        })

        expect(onContainerClick).not.toHaveBeenCalled()
    })

    it("renders as a static image when expand is disabled", () => {
        render(<GlassImage src="https://example.com/image.png" alt="Imagem estática" enableExpand={false} />)

        expect(screen.queryByRole("button", { name: /Abrir imagem ampliada/i })).not.toBeInTheDocument()
        expect(screen.getByAltText("Imagem estática")).toBeInTheDocument()
    })

    it("only stretches the default trigger wrapper when explicitly requested", () => {
        const { rerender } = render(<GlassImage src="https://example.com/image.png" alt="Imagem compacta" />)

        expect(screen.getByRole("button", { name: "Abrir imagem ampliada de Imagem compacta" })).not.toHaveClass("h-full", "w-full")

        rerender(<GlassImage src="https://example.com/image.png" alt="Imagem compacta" triggerClassName="h-full w-full" />)

        expect(screen.getByRole("button", { name: "Abrir imagem ampliada de Imagem compacta" })).toHaveClass("h-full", "w-full")
    })
})
