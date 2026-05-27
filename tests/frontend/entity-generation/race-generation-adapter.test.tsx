import { render, screen } from "@testing-library/react"
import * as React from "react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { raceGenerationAdapter } from "@/features/entity-generation/adapters/race-generation-adapter"
import type { GeneratedRaceCandidate } from "@/features/entity-generation/types/entity-generation.types"
import type { Race } from "@/features/races/types/races.types"

vi.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ src, alt }: { src: string; alt: string }) => React.createElement("img", { src, alt }),
}))

vi.mock("@/features/entity-generation/api/entity-generation-api", () => ({
    applyRaceGenerationCandidate: vi.fn(),
}))

const currentRace: Race = {
    _id: "race-1",
    name: "Elfo",
    originalName: "Elf",
    image: "/old-elf.png",
    description: "<p>Descrição antiga.</p>",
    source: "ABH p. 9",
    status: "active",
    size: "Médio",
    speed: "9 metros",
    traits: [{ name: "Sentidos Aguçados", description: "<p>Descrição antiga da habilidade.</p>", level: 1 }],
    spells: [],
    variations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

const candidate: GeneratedRaceCandidate = {
    candidateId: "elf:phb",
    matchLabel: "Elf (Livro do Jogador pág. 21)",
    name: "Elfo Gerado",
    originalName: "Elf",
    image: "/new-elf.png",
    description: "<p>Descrição nova.</p>",
    source: "PHB p. 21",
    status: "active",
    size: "Médio",
    speed: "9 metros",
    traits: [{ name: "Transe", originalName: "Trance", description: "<p>Descrição traduzida do transe.</p>", level: 1 }],
    spells: [],
    variations: [],
}

function renderComparison(node: ReactNode) {
    render(<>{node}</>)
}

describe("raceGenerationAdapter comparison", () => {
    it("renders old and new images", () => {
        renderComparison(raceGenerationAdapter.renderComparison(currentRace, candidate))

        expect(screen.getByText("Astarion's Book of Hungers pág. 9")).toBeInTheDocument()
        expect(screen.getByText("Livro do Jogador pág. 21")).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Imagem atual de Elfo" })).toHaveAttribute("src", "/old-elf.png")
        expect(screen.getByRole("img", { name: "Nova imagem de Elfo Gerado" })).toHaveAttribute("src", "/new-elf.png")
    })

    it("renders trait names and translated descriptions", () => {
        renderComparison(raceGenerationAdapter.renderComparison(currentRace, candidate))

        expect(screen.getByText("Sentidos Aguçados")).toBeInTheDocument()
        expect(screen.getByText("Descrição antiga da habilidade.")).toBeInTheDocument()
        expect(screen.getByText("Transe")).toBeInTheDocument()
        expect(screen.getByText("Descrição traduzida do transe.")).toBeInTheDocument()
    })
})
