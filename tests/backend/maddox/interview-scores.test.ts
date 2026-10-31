import { describe, expect, it } from "vitest"
import { finalScores, rolledScores, scoresLine, sixthScore, validateBonus, validateSubmission } from "@/features/maddox/interview-scores"

const scores = (strength: number, dexterity: number, constitution: number, intelligence: number, wisdom: number, charisma: number) => ({ strength, dexterity, constitution, intelligence, wisdom, charisma })

describe("atributos da entrevista (Maddox 5) — regras puras", () => {
    it("conjunto padrão: cada valor de 15, 14, 13, 12, 10 e 8 exatamente uma vez", () => {
        expect(validateSubmission("standard", scores(8, 15, 14, 10, 13, 12), null)).toBeNull()
        expect(validateSubmission("standard", scores(15, 15, 14, 10, 13, 12), null)).toMatch(/exatamente uma vez/)
        expect(validateSubmission("standard", scores(16, 15, 14, 10, 13, 8), null)).toMatch(/exatamente uma vez/)
        expect(validateSubmission("standard", { strength: 15 }, null)).toMatch(/seis atributos/)
    })

    it("compra de pontos: 8–15 e custo até 27", () => {
        expect(validateSubmission("point-buy", scores(15, 15, 15, 8, 8, 8), null)).toBeNull()
        expect(validateSubmission("point-buy", scores(8, 8, 8, 8, 8, 8), null)).toBeNull()
        expect(validateSubmission("point-buy", scores(15, 15, 15, 9, 8, 8), null)).toMatch(/27 pontos/)
        expect(validateSubmission("point-buy", scores(16, 8, 8, 8, 8, 8), null)).toMatch(/entre 8 e 15/)
        expect(validateSubmission("point-buy", scores(7, 8, 8, 8, 8, 8), null)).toMatch(/entre 8 e 15/)
    })

    it("rolagem: exatamente as cinco pontuações roladas e a sexta (72 − soma), em qualquer ordem", () => {
        const rolls = { scores: [17, 14, 12, 9, 12], ...sixthScore([17, 14, 12, 9, 12]) }
        expect(rolls.sixth).toBe(8)
        expect(rolledScores(rolls)).toEqual([17, 14, 12, 9, 12, 8])
        expect(validateSubmission("roll", scores(8, 17, 12, 14, 9, 12), rolls)).toBeNull()
        expect(validateSubmission("roll", scores(18, 17, 12, 14, 9, 12), rolls)).toMatch(/roladas/)
        expect(validateSubmission("roll", scores(8, 17, 12, 14, 9, 12), { scores: [17, 14, 12], sixth: null, invalid: false })).toMatch(/5 rolagens/)
        expect(validateSubmission("roll", scores(8, 17, 12, 14, 9, 12), null)).toMatch(/5 rolagens/)
    })

    it("sexta pontuação fora de 3–18 é inválida (reiniciar)", () => {
        expect(sixthScore([18, 18, 18, 18, 18])).toEqual({ sixth: null, invalid: true })
        expect(sixthScore([3, 3, 3, 3, 3])).toEqual({ sixth: null, invalid: true })
        expect(sixthScore([12, 12, 12])).toEqual({ sixth: null, invalid: false })
        const invalid = { scores: [18, 18, 18, 18, 18], sixth: null, invalid: true }
        expect(rolledScores(invalid)).toEqual([18, 18, 18, 18, 18])
        expect(validateSubmission("roll", scores(18, 18, 18, 18, 18, 18), invalid)).toMatch(/fora do intervalo 3-18/)
    })

    it("bônus do antecedente: soma 3, +1/+2 por atributo, só nos sugeridos quando há catálogo", () => {
        const suggested = ["dexterity", "constitution", "intelligence"] as const
        expect(validateBonus({ dexterity: 2, intelligence: 1 }, suggested)).toBeNull()
        expect(validateBonus({ dexterity: 1, constitution: 1, intelligence: 1 }, suggested)).toBeNull()
        expect(validateBonus({ dexterity: 3 }, suggested)).toMatch(/\+1 ou \+2/)
        expect(validateBonus({ dexterity: 1, intelligence: 1 }, suggested)).toMatch(/exatamente 3/)
        expect(validateBonus({ strength: 2, dexterity: 1 }, suggested)).toMatch(/só dá bônus em Destreza, Constituição, Inteligência \(recebido também: Força\)/)
        expect(validateBonus({}, suggested)).toMatch(/Distribua 3/)
        // Antecedente fora do catálogo: qualquer atributo, mesma regra de pontos.
        expect(validateBonus({ strength: 2, charisma: 1 }, [])).toBeNull()
    })

    it("valor final = base + bônus, sem teto, e linha legível", () => {
        const base = scores(18, 14, 13, 12, 10, 8)
        expect(finalScores(base, { strength: 2, dexterity: 1 })).toEqual(scores(20, 15, 13, 12, 10, 8))
        expect(finalScores(base, null)).toEqual(base)
        expect(scoresLine(base, { strength: 2 })).toBe("Força 18 (+2) = 20, Destreza 14, Constituição 13, Inteligência 12, Sabedoria 10, Carisma 8")
    })
})
