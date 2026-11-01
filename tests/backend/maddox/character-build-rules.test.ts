import { describe, expect, it } from "vitest"
import { applyFeatAttributes, expertiseCount, featAttributeRule, featSlots, hitPointRows, hitPointsTotal, requiresFightingStyle, spellLimits, subclassLevel, validateFeatAttributes } from "@/features/maddox/character-build-rules"

/** Regras puras da ficha montada na entrevista (Maddox 5): níveis de subclasse e talento, magias, atributos e PV. */

const trait = (level: number, label: string) => ({ level, description: `<span data-type="mention" data-id="${label}" data-entity-type="Habilidade">${label}</span>` })
const FIGHTER = [
    trait(1, "Estilo de Luta (Guerreiro)"),
    trait(3, "Subclasse de Guerreiro"),
    ...[4, 6, 8, 12, 14, 16].map((level) => trait(level, "Melhoria de Atributo (Guerreiro)")),
    trait(19, "Dádiva Épica (Guerreiro)"),
]
const ROGUE = [trait(1, "Especialista (Ladino)"), trait(3, "Subclasse de Ladino"), trait(6, "Especialista (Ladino)"), ...[4, 8, 10, 12, 16].map((level) => trait(level, "Aumento no Valor de Habilidade")), trait(19, "Dádiva Épica")]
const base = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 }

describe("regras da ficha da entrevista", () => {
    it("níveis de talento pelos traços da classe (Guerreiro e Ladino), com a Dádiva Épica no 19", () => {
        expect(featSlots(FIGHTER, 20).map((slot) => `${slot.level}${slot.kind === "epic" ? "e" : ""}`)).toEqual(["4", "6", "8", "12", "14", "16", "19e"])
        expect(featSlots(ROGUE, 20).map((slot) => slot.level)).toEqual([4, 8, 10, 12, 16, 19])
        expect(featSlots(FIGHTER, 5).map((slot) => slot.level)).toEqual([4])
        expect(featSlots(FIGHTER, 3)).toEqual([])
    })

    it("subclasse no nível do traço (3 por padrão), estilo de luta e Especialista por nível", () => {
        expect(subclassLevel(FIGHTER)).toBe(3)
        expect(subclassLevel([trait(1, "Subclasse de Clérigo")])).toBe(1)
        expect(subclassLevel([])).toBe(3)
        expect(requiresFightingStyle(FIGHTER, 1)).toBe(true)
        expect(requiresFightingStyle(ROGUE, 20)).toBe(false)
        expect(expertiseCount(ROGUE, 1)).toBe(2)
        expect(expertiseCount(ROGUE, 6)).toBe(4)
    })

    it("magias pela tabela: Mago nível 5 com 4 truques, 9 magias e até o 3º círculo; sem tabela, nada", () => {
        const wizard = { spellSlots: { 5: { cantrips: 4, preparedSpells: 9, slots: { 1: 4, 2: 3, 3: 2 } } } } as never
        expect(spellLimits(wizard, 5)).toEqual({ cantrips: 4, prepared: 9, maxCircle: 3 })
        expect(spellLimits(wizard, 1)).toBeNull()
        expect(spellLimits(undefined, 5)).toBeNull()
    })

    it("Aumento de Atributo: +2 em um ou +1 em dois; talentos com atributos: +1 num dos listados", () => {
        const asi = featAttributeRule({ name: "Aperfeiçoamento da pontuação de atributo", attributeBonuses: [] })
        expect(asi).toEqual({ kind: "asi" })
        expect(validateFeatAttributes(asi, { strength: 2 }, "ASI")).toBeNull()
        expect(validateFeatAttributes(asi, { strength: 1, constitution: 1 }, "ASI")).toBeNull()
        expect(validateFeatAttributes(asi, { strength: 1 }, "ASI")).toBe("ASI: distribua +2 em um atributo ou +1 em dois.")
        const athlete = featAttributeRule({ name: "Atleta", attributeBonuses: [{ attribute: "Força" }, { attribute: "Destreza" }] })
        expect(validateFeatAttributes(athlete, { dexterity: 1 }, "Atleta")).toBeNull()
        expect(validateFeatAttributes(athlete, { wisdom: 1 }, "Atleta")).toBe("Atleta: escolha +1 em um destes atributos: Força, Destreza.")
        expect(validateFeatAttributes(featAttributeRule({ name: "Sorte" }), { wisdom: 1 }, "Sorte")).toBe("Sorte não aumenta atributos.")
    })

    it("aplica os aumentos com o teto do talento (20; Dádiva Épica até 30)", () => {
        const scores = applyFeatAttributes({ ...base, strength: 19 }, [{ attributes: { strength: 2 }, cap: 20 }, { attributes: { dexterity: 1, constitution: 1 } }])
        expect(scores).toMatchObject({ strength: 20, dexterity: 15, constitution: 14 })
        expect(applyFeatAttributes({ ...base, strength: 20 }, [{ attributes: { strength: 1 }, cap: 30 }]).strength).toBe(21)
    })

    it("PV por nível: média e rolagem com CON; falta rolar = sem total", () => {
        expect(hitPointRows(3, "d10", 2, [{ level: 3, die: 7 }])).toEqual([
            { level: 2, average: 7, die: null, rolled: null },
            { level: 3, average: 7, die: 7, rolled: 9 },
        ])
        expect(hitPointsTotal(3, "d10", 2, { "2": "average", "3": "roll" }, [{ level: 3, die: 7 }])).toBe(28)
        expect(hitPointsTotal(3, "d10", 2, { "2": "roll", "3": "average" }, [])).toBeNull()
        expect(hitPointsTotal(1, "d6", 2, null, [])).toBe(8)
    })
})
