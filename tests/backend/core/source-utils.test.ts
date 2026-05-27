import { describe, expect, it } from "vitest"

import {
    buildSourcePrefixRegexes,
    extractBookName,
    extractSourcePage,
    formatSourceDisplay,
    getBookDisplayName,
    getSourceDisplayLabel,
    normalizeSourceSelection,
    getSourceSearchTerms,
    matchesSourceFilter,
} from "@/core/utils/source-utils"

describe("source-utils", () => {
    it("extracts the source name without page suffixes", () => {
        expect(extractBookName("LDJ pág. 42")).toBe("LDJ")
        expect(extractBookName("PHB pg. 230")).toBe("PHB")
        expect(extractBookName("XPHB p. 12")).toBe("XPHB")
        expect(extractBookName("LDJ pág.")).toBe("LDJ")
    })

    it("extracts the source page when present", () => {
        expect(extractSourcePage("ABH pág. 9")).toBe(9)
        expect(extractSourcePage("PHB p. 230")).toBe(230)
        expect(extractSourcePage("Livro do Jogador")).toBeUndefined()
    })

    it("maps source aliases to canonical display names", () => {
        expect(getBookDisplayName("PHB pg. 230")).toBe("Livro do Jogador")
        expect(getBookDisplayName("Player's Handbook 2024 p. 12")).toBe("Livro do Jogador")
        expect(getBookDisplayName("LDM pág. 98")).toBe("Monster Manual")
        expect(getBookDisplayName("XGE")).toBe("Xanathar's Guide to Everything")
    })

    it("returns searchable aliases for canonical sources", () => {
        expect(getSourceSearchTerms("Livro do Jogador")).toEqual(
            expect.arrayContaining(["Livro do Jogador", "LDJ", "PHB", "XPHB", "Player's Handbook"]),
        )
    })

    it("formats full source display labels with translated page suffix", () => {
        expect(formatSourceDisplay("ABH", 9)).toBe("Astarion's Book of Hungers pág. 9")
        expect(getSourceDisplayLabel("ABH p. 9")).toBe("Astarion's Book of Hungers pág. 9")
        expect(getSourceDisplayLabel("Player's Handbook 2024 p. 12")).toBe("Livro do Jogador pág. 12")
    })

    it("normalizes and deduplicates selected source values", () => {
        expect(normalizeSourceSelection(["LDJ pág.", "Livro do Jogador", "PHB pg. 230"])).toEqual(["Livro do Jogador"])
    })

    it("builds prefix regexes that still match legacy abbreviations from a canonical filter value", () => {
        const regexes = buildSourcePrefixRegexes(["Livro do Jogador"])

        expect(regexes.some((regex) => regex.test("LDJ pág. 72"))).toBe(true)
        expect(regexes.some((regex) => regex.test("PHB pg. 230"))).toBe(true)
        expect(regexes.some((regex) => regex.test("Player's Handbook 2024 p. 12"))).toBe(true)
    })

    it("matches source filters by canonical source name", () => {
        expect(matchesSourceFilter("LDJ pág. 72", ["Livro do Jogador"])).toBe(true)
        expect(matchesSourceFilter("Player's Handbook 2024 p. 12", ["Livro do Jogador"])).toBe(true)
        expect(matchesSourceFilter("XGE pág. 31", ["Livro do Jogador"])).toBe(false)
    })
})
