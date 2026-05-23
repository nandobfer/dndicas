import type { ChangeEvent, ComponentPropsWithoutRef, ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SubclassPreview } from "@/features/classes/components/subclass-preview"
import type { Subclass } from "@/features/classes/types/classes.types"

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: ReactNode; href: string } & ComponentPropsWithoutRef<"a">) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: ComponentPropsWithoutRef<"div">) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: ComponentPropsWithoutRef<"span">) => <span {...props}>{children}</span>,
    },
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/ui/glass-attribute-chip", () => ({
    GlassAttributeChip: ({ attribute }: { attribute: string }) => <span>{attribute}</span>,
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

vi.mock("@/components/ui/glass-input", () => ({
    GlassInput: ({ value = "", onChange, ...props }: { value?: string; onChange?: (event: ChangeEvent<HTMLInputElement>) => void } & ComponentPropsWithoutRef<"input">) => (
        <input value={value} onChange={onChange} {...props} />
    ),
}))

vi.mock("@/components/ui/glass-selector", () => ({
    GlassSelector: () => <div data-testid="glass-selector" />,
}))

vi.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}))

vi.mock("@/features/classes/components/mention-renderer", () => ({
    MentionRenderer: ({ item }: { item: { name?: string; description?: string } }) => (
        <div>{item.name ?? item.description ?? "Sem conteúdo"}</div>
    ),
}))

const createSubclass = (overrides: Partial<Subclass> = {}): Subclass => ({
    _id: "subclass-1",
    name: "Cavaleiro Arcano",
    description: "<p>Uma tradição marcial com magia própria.</p>",
    color: "#8b5cf6",
    spellcasting: true,
    spellcastingAttribute: "Inteligência",
    spells: [
        {
            _id: "spell-1",
            name: "Mãos Mágicas",
            description: "Uma mão espectral aparece.",
            circle: 0,
        },
    ],
    traits: [
        {
            _id: "trait-1",
            level: 3,
            description: "Vínculo com Arma",
        },
    ],
    ...overrides,
})

describe("SubclassPreview", () => {
    it("renders subclass-only skills and spells in embedded mode", () => {
        render(<SubclassPreview subclass={createSubclass()} parentClassName="Guerreiro" linkToParentClass mode="embedded" />)

        expect(screen.getByText("Uma tradição marcial com magia própria.")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /magias/i })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /habilidades/i })).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: /magias/i }))
        fireEvent.click(screen.getByRole("button", { name: /truques/i }))
        expect(screen.getByText("Mãos Mágicas")).toBeInTheDocument()
        expect(screen.queryByText("Bola de Fogo")).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: /habilidades/i }))
        expect(screen.getByText("Vínculo com Arma")).toBeInTheDocument()
        expect(screen.queryByText("Ataque Extra")).not.toBeInTheDocument()
    })

    it("does not render the spells section when the subclass has no spellcasting", () => {
        render(
            <SubclassPreview
                subclass={createSubclass({
                    spellcasting: false,
                    spellcastingAttribute: undefined,
                    spells: [],
                })}
                mode="embedded"
            />,
        )

        expect(screen.queryByRole("button", { name: /magias/i })).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: /habilidades/i })).toBeInTheDocument()
    })
})
