import { describe, it, expect, vi } from "vitest"
import { applyClientFilters } from "@/features/backgrounds/hooks/useClientFilteredBackgrounds"
import type { Background } from "@/features/backgrounds/types/backgrounds.types"

const mockBackgrounds: Background[] = [
    {
        _id: "1",
        name: "Acolyte",
        suggestedAttributes: ["Sabedoria", "Carisma"],
        skillProficiencies: ["Intuição", "Religião"],
        featId: "feat-1",
    } as Background,
    {
        _id: "2",
        name: "Criminal",
        suggestedAttributes: ["Destreza", "Carisma"],
        skillProficiencies: ["Enganação", "Furtividade"],
        featId: "feat-2",
    } as Background,
    {
        _id: "3",
        name: "Sage",
        suggestedAttributes: ["Inteligência", "Sabedoria"],
        skillProficiencies: ["Arcanismo", "História"],
        featId: "feat-3",
    } as Background,
]

describe("applyClientFilters", () => {
    it("should return all items when no filters are applied", () => {
        const result = applyClientFilters(mockBackgrounds, {})
        expect(result).toHaveLength(3)
    })

    describe("suggestedAttributes (AND logic)", () => {
        it("should filter by a single attribute", () => {
            const result = applyClientFilters(mockBackgrounds, { suggestedAttributes: ["Sabedoria"] })
            expect(result.map(b => b.name)).toEqual(["Acolyte", "Sage"])
        })

        it("should filter by multiple attributes using AND logic", () => {
            // Both Sabedoria AND Carisma
            const result = applyClientFilters(mockBackgrounds, { suggestedAttributes: ["Sabedoria", "Carisma"] })
            expect(result.map(b => b.name)).toEqual(["Acolyte"])
        })

        it("should return empty array if no background matches all attributes", () => {
            const result = applyClientFilters(mockBackgrounds, { suggestedAttributes: ["Sabedoria", "Destreza"] })
            expect(result).toHaveLength(0)
        })
    })

    describe("skillProficiencies (OR logic)", () => {
        it("should filter by a single skill", () => {
            const result = applyClientFilters(mockBackgrounds, { skillProficiencies: ["Furtividade"] })
            expect(result.map(b => b.name)).toEqual(["Criminal"])
        })

        it("should filter by multiple skills using OR logic", () => {
            const result = applyClientFilters(mockBackgrounds, { skillProficiencies: ["Religião", "História"] })
            expect(result.map(b => b.name)).toEqual(["Acolyte", "Sage"])
        })
    })

    describe("featIds (OR logic)", () => {
        it("should filter by featId", () => {
            const result = applyClientFilters(mockBackgrounds, { featIds: ["feat-2"] })
            expect(result.map(b => b.name)).toEqual(["Criminal"])
        })

        it("should handle populated featId objects", () => {
            const backgroundsWithPopulatedFeats = [
                { _id: "4", name: "Custom", featId: { id: "feat-4", label: "Custom Feat" } } as any
            ]
            const result = applyClientFilters(backgroundsWithPopulatedFeats, { featIds: ["feat-4"] })
            expect(result).toHaveLength(1)
        })
    })
})
