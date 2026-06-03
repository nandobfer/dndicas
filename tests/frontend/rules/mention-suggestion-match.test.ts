import { describe, expect, it } from "vitest"
import { findMentionSuggestionMatch } from "@/features/rules/utils/mention-interaction-surface"

const matchAt = (text: string, parentOffset: number, position = parentOffset + 10) =>
    findMentionSuggestionMatch({ text, parentOffset, position })

describe("findMentionSuggestionMatch", () => {
    it("limits an inserted @ before existing text to the first following word", () => {
        const text = "prefixo @Ataque Especial continua"
        const parentOffset = text.indexOf("@") + 1
        const position = 30

        expect(matchAt(text, parentOffset, position)).toEqual({
            range: {
                from: position - 1,
                to: position + "Ataque".length,
            },
            query: "Ataque",
            text: "@Ataque",
        })
    })

    it("does not absorb a word separated from @ by a space", () => {
        const text = "prefixo @ Ataque Especial"
        const parentOffset = text.indexOf("@") + 1
        const position = 25

        expect(matchAt(text, parentOffset, position)).toEqual({
            range: {
                from: position - 1,
                to: position,
            },
            query: "",
            text: "@",
        })
    })

    it("matches normal typed mention text until the cursor", () => {
        const text = "prefixo @Ata"
        const parentOffset = text.length
        const position = 40

        expect(matchAt(text, parentOffset, position)).toEqual({
            range: {
                from: position - "@Ata".length,
                to: position,
            },
            query: "Ata",
            text: "@Ata",
        })
    })


    it("keeps spaces when they are part of the typed query", () => {
        const text = "prefixo @Ataque Especial"
        const parentOffset = text.length
        const position = 50

        expect(matchAt(text, parentOffset, position)).toEqual({
            range: {
                from: position - "@Ataque Especial".length,
                to: position,
            },
            query: "Ataque Especial",
            text: "@Ataque Especial",
        })
    })

    it("exits the suggestion when the typed query ends with double spaces", () => {
        const text = "prefixo @Ataque  "

        expect(matchAt(text, text.length)).toBeNull()
    })

    it("stops the temporary mention at mention boundaries", () => {
        expect(matchAt("@Ataque@Especial", "@Ataque".length)?.query).toBe("Ataque")
        expect(matchAt("@Ataque\u200BEspecial", "@Ataque".length)?.query).toBe("Ataque")
        expect(matchAt("@Ataque\uFFFCEspecial", "@Ataque".length)?.query).toBe("Ataque")
    })
})
