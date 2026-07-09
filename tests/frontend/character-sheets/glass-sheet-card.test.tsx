import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { GlassSheetCard } from "@/components/ui/glass-sheet-card"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"

const glassImageMocks = vi.hoisted(() => ({
    props: vi.fn(),
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: (props: {
        src: string
        alt: string
        expandLabel?: string
        triggerClassName?: string
    }) => {
        glassImageMocks.props(props)
        return (
            <button
                type="button"
                data-testid="sheet-card-image"
                data-src={props.src}
                aria-label={props.expandLabel ?? props.alt}
                onClick={(event) => event.stopPropagation()}
            >
                {props.alt}
            </button>
        )
    },
}))

const sheet = {
    _id: "sheet-1",
    name: "Kael",
    photo: "https://cdn.test/kael.webp",
    class: "Guerreiro",
    subclass: "",
    race: "Humano",
    origin: "Soldado",
    level: 3,
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 11,
    charisma: 8,
    hpCurrent: 18,
    hpMax: 24,
    computedArmorClass: 15,
    history: "",
} as CharacterSheet

describe("GlassSheetCard", () => {
    it("keeps the sheet image expandable inside the card", () => {
        render(<GlassSheetCard sheet={sheet} showDelete={false} />)

        expect(glassImageMocks.props).toHaveBeenCalledWith(expect.objectContaining({
            src: "https://cdn.test/kael.webp",
            expandLabel: "Abrir imagem ampliada de Kael",
            triggerClassName: "h-full w-full",
            className: "h-full w-full rounded-lg aspect-auto",
        }))
    })

    it("renders the sheet photo in the left image column", () => {
        render(<GlassSheetCard sheet={sheet} showDelete={false} />)

        expect(screen.getByTestId("sheet-card-image")).toHaveAttribute("data-src", "https://cdn.test/kael.webp")
        expect(screen.getByRole("heading", { name: "Kael" })).toBeInTheDocument()
    })

    it("does not open the sheet card when the image itself is clicked", () => {
        const onOpen = vi.fn()

        render(<GlassSheetCard sheet={sheet} showDelete={false} onOpen={onOpen} />)

        fireEvent.click(screen.getByRole("button", { name: "Abrir imagem ampliada de Kael" }))

        expect(onOpen).not.toHaveBeenCalled()
    })

    it("uses an initial fallback when the sheet has no photo", () => {
        render(<GlassSheetCard sheet={{ ...sheet, photo: null, name: "Lia" }} showDelete={false} />)

        expect(screen.queryByTestId("sheet-card-image")).not.toBeInTheDocument()
        expect(screen.getByText("L")).toBeInTheDocument()
    })

    it("renders class, subclass, species and origin as plain text extracted from html", () => {
        render(
            <GlassSheetCard
                sheet={{
                    ...sheet,
                    class: '<span data-mention="class">Guerreiro</span>',
                    subclass: '<a href="/classes/campeao">Campeão</a>',
                    race: "<p>Humano &amp; Variante</p>",
                    origin: '<span class="mention-badge">Soldado</span>',
                }}
                showDelete={false}
            />
        )

        expect(screen.getByText("Guerreiro · Campeão · Humano & Variante · Soldado")).toBeInTheDocument()
        expect(screen.queryByText(/data-mention|href|mention-badge|<span|<a|<p/)).not.toBeInTheDocument()
    })
})
