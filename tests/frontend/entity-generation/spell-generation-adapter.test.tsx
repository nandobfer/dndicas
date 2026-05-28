import { render, screen } from "@testing-library/react"
import * as React from "react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { spellGenerationAdapter } from "@/features/entity-generation/adapters/spell-generation-adapter"
import type { GeneratedSpellCandidate } from "@/features/entity-generation/types/entity-generation.types"
import type { Spell } from "@/features/spells/types/spells.types"

vi.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

vi.mock("@/features/entity-generation/api/entity-generation-api", () => ({
    applySpellGenerationCandidate: vi.fn(),
    generateSpellGenerationCandidates: vi.fn(),
}))

const currentSpell: Spell = {
    _id: "spell-1",
    name: "Luz",
    originalName: "light",
    description: "<p>Descrição antiga.</p>",
    circle: 0,
    school: "Evocação",
    component: ["Verbal", "Material"],
    image: "/old-spell.png",
    source: "ABH p. 9",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
}

const candidate: GeneratedSpellCandidate = {
    candidateId: "light:xphb",
    matchLabel: "light (Livro do Jogador pág. 12)",
    name: "Luz Gerada",
    originalName: "light",
    description: "<p>Descrição nova.</p>",
    circle: 0,
    school: "Evocação",
    component: ["Verbal"],
    image: "/new-spell.png",
    source: "XPHB p. 12",
    status: "active",
}

function renderComparison(node: ReactNode) {
    render(<>{node}</>)
}

describe("spellGenerationAdapter comparison", () => {
    it("renders old and new spell fields", () => {
        renderComparison(spellGenerationAdapter.renderComparison(currentSpell, candidate))

        expect(screen.getByText("Luz")).toBeInTheDocument()
        expect(screen.getByText("Astarion's Book of Hungers pág. 9")).toBeInTheDocument()
        expect(screen.getByText("Luz Gerada")).toBeInTheDocument()
        expect(screen.getByText("Livro do Jogador pág. 12")).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Imagem atual de Luz" })).toHaveAttribute("src", "/old-spell.png")
        expect(screen.getByRole("img", { name: "Nova imagem de Luz Gerada" })).toHaveAttribute("src", "/new-spell.png")
        expect(screen.getByText("Descrição antiga.")).toBeInTheDocument()
        expect(screen.getByText("Descrição nova.")).toBeInTheDocument()
    })
})
