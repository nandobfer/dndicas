import { render, screen } from "@testing-library/react"
import * as React from "react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { monsterGenerationAdapter } from "@/features/entity-generation/adapters/monster-generation-adapter"
import type { GeneratedMonsterCandidate } from "@/features/entity-generation/types/entity-generation.types"
import type { Monster } from "@/features/monsters/types/monsters.types"

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

vi.mock("@/features/entity-generation/api/entity-generation-api", () => ({
    applyMonsterGenerationCandidate: vi.fn(),
    generateMonsterGenerationCandidates: vi.fn(),
}))

const currentMonster: Monster = {
    _id: "monster-1",
    id: "monster-1",
    name: "Goblin",
    originalName: "Goblin",
    source: "ABH p. 9",
    description: "<p>Descrição antiga.</p>",
    image: "/old.png",
    status: "active",
    type: "humanoid",
    size: "S",
    alignment: "NE",
    armorClass: "15",
    hitPointsFormula: "7",
    speed: "9m",
    attributes: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
    savingThrows: {},
    skills: {},
    senses: {},
    sensesAndLanguages: [],
    challengeRating: "1/4",
    languages: "Comum, Goblin",
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    traits: [{ label: "Fuga Ágil", description: "<p>Antiga.</p>" }],
    actions: [{ label: "Cimitarra", description: "<p>Antiga ação.</p>" }],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    lairActions: [],
    regionalEffects: [],
    createdAt: "",
    updatedAt: "",
}

const candidate: GeneratedMonsterCandidate = {
    ...currentMonster,
    candidateId: "goblin:mm",
    matchLabel: "Goblin (Monster Manual pág. 23)",
    name: "Goblin Gerado",
    source: "MM p. 23",
    description: "<p>Descrição nova.</p>",
    image: "/new.png",
    traits: [{ label: "Fuga Ágil", description: "<p>Nova.</p>" }],
    actions: [{ label: "Cimitarra", description: "<p>Nova ação.</p>" }],
}

function renderComparison(node: ReactNode) {
    render(<>{node}</>)
}

describe("monsterGenerationAdapter comparison", () => {
    it("renders old and new monster fields, images and params", () => {
        renderComparison(monsterGenerationAdapter.renderComparison(currentMonster, candidate))

        expect(screen.getByText("Goblin")).toBeInTheDocument()
        expect(screen.getByText("Astarion's Book of Hungers pág. 9")).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Imagem atual de Goblin" })).toHaveAttribute("src", "/old.png")
        expect(screen.getByText("Goblin Gerado")).toBeInTheDocument()
        expect(screen.getByText("Monster Manual pág. 23")).toBeInTheDocument()
        expect(screen.getByRole("img", { name: "Nova imagem de Goblin Gerado" })).toHaveAttribute("src", "/new.png")
        expect(screen.getByText("Nova.")).toBeInTheDocument()
        expect(screen.getByText("Nova ação.")).toBeInTheDocument()
    })
})
