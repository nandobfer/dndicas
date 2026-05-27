import { render, screen } from "@testing-library/react"
import * as React from "react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { featGenerationAdapter } from "@/features/entity-generation/adapters/feat-generation-adapter"
import type { GeneratedFeatCandidate } from "@/features/entity-generation/types/entity-generation.types"
import type { Feat } from "@/features/feats/types/feats.types"

vi.mock("@/features/entity-generation/api/entity-generation-api", () => ({
    applyFeatGenerationCandidate: vi.fn(),
    generateFeatGenerationCandidates: vi.fn(),
}))

const currentFeat: Feat = {
    _id: "feat-1",
    name: "Ator",
    originalName: "Actor",
    description: "<p>Descrição antiga.</p>",
    source: "ABH p. 9",
    level: 4,
    prerequisites: ["Carisma 13 ou superior"],
    attributeBonuses: [{ attribute: "Carisma", value: 1 }],
    category: "Geral",
    status: "active",
    createdAt: "",
    updatedAt: "",
}

const candidate: GeneratedFeatCandidate = {
    candidateId: "actor:xphb",
    matchLabel: "Actor (Livro do Jogador pág. 12)",
    name: "Ator Gerado",
    originalName: "Actor",
    description: "<p>Descrição nova.</p>",
    source: "XPHB p. 12",
    level: 4,
    prerequisites: ["Carisma 13 ou superior"],
    attributeBonuses: [{ attribute: "Carisma", value: 1 }],
    category: "Geral",
    status: "active",
}

function renderComparison(node: ReactNode) {
    render(<>{node}</>)
}

describe("featGenerationAdapter comparison", () => {
    it("renders old and new feat fields", () => {
        renderComparison(featGenerationAdapter.renderComparison(currentFeat, candidate))

        expect(screen.getByText("Ator")).toBeInTheDocument()
        expect(screen.getByText("Astarion's Book of Hungers pág. 9")).toBeInTheDocument()
        expect(screen.getByText("Ator Gerado")).toBeInTheDocument()
        expect(screen.getByText("Livro do Jogador pág. 12")).toBeInTheDocument()
        expect(screen.getByText("Descrição antiga.")).toBeInTheDocument()
        expect(screen.getByText("Descrição nova.")).toBeInTheDocument()
    })
})
