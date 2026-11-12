import { describe, expect, it } from "vitest"
import { checkPlayerChoice, offersCastingAttributeChoice, PLAYER_CHOICE_MISMATCH, PLAYER_CHOICE_MISSING, PLAYER_CHOICE_NOT_FOUND, ruleNamesSpell } from "@/features/maddox/player-choice"
import { combatSheetChangeSchema, parseList, requiresCatalogSource } from "@/features/maddox/combat-prep-schemas"
import { buildCombatOptions } from "@/features/maddox/combat-options"
import { freshEconomy } from "@/features/maddox/combat-rules"
import { fallbackQuestion, interpretPrep } from "@/features/maddox/server/combat-prep"

/** DND-51: a escolha do jogador (parte pura) e as operações novas da lista fechada da ficha. */

describe("DND-51 — escolha do jogador", () => {
    it("reconhece a regra que oferece lista de atributos de conjuração (com e sem vírgula antes do 'ou')", () => {
        expect(offersCastingAttributeChoice("Inteligência, Sabedoria, ou Carisma é sua habilidade de feitiços (escolha quando selecionar esta corrida).")).toBe(true)
        expect(offersCastingAttributeChoice("<p>Inteligência, Sabedoria ou Carisma é seu atributo de conjuração</p>")).toBe(true)
        expect(offersCastingAttributeChoice("Inteligência é o seu atributo de conjuração para as magias de mago.")).toBe(false)
    })

    it("magia nomeada pela regra não é escolha; magia de uma lista é", () => {
        expect(ruleNamesSpell("Você sabe Rajada de Veneno. Você pode lançar amizade animal", "Rajada de Veneno")).toBe(true)
        expect(ruleNamesSpell("Você aprende dois truques à sua escolha na lista de magias de Clérigo", "Orientação")).toBe(false)
    })

    it("o trecho precisa estar numa mensagem do jogador e citar o valor gravado", () => {
        const texts = ["não queria carisma como atributo de conjuração, e sim sabedoria", "[Orientação](#mention:Magia:1) e mensagem de truques"]
        expect(checkPlayerChoice({ quote: "e sim Sabedoria" }, "Sabedoria", texts)).toBeNull()
        expect(checkPlayerChoice({ quote: "orientação e mensagem" }, "Orientação", texts)).toBeNull()
        expect(checkPlayerChoice(undefined, "Sabedoria", texts)).toBe(PLAYER_CHOICE_MISSING)
        expect(checkPlayerChoice({ quote: "eu quero carisma" }, "Carisma", texts)).toBe(PLAYER_CHOICE_NOT_FOUND)
        // "não queria carisma" está na mensagem, mas não cita Sabedoria.
        expect(checkPlayerChoice({ quote: "não queria carisma" }, "Sabedoria", texts)).toBe(PLAYER_CHOICE_MISMATCH)
    })
})

describe("DND-51 — operações novas da ficha e a pergunta da preparação", () => {
    it("incluir e remover magia, talento, característica e item; a magia acrescentada exige a fonte do catálogo", () => {
        const { valid, dropped } = parseList(combatSheetChangeSchema, [
            { type: "spell-add", catalogSpellId: "a1", reason: "x" },
            { type: "spell-remove", spellId: "s1", reason: "x" },
            { type: "trait-remove", id: "t1", reason: "x" },
            { type: "feat-remove", id: "f1", reason: "x" },
            { type: "item-add", name: "Corda", reason: "x" },
            { type: "item-remove", itemId: "i1", reason: "x" },
            { type: "item-quantity", itemId: "i1", quantity: 3, reason: "x" },
            { type: "item-quantity", itemId: "i1", quantity: -1, reason: "x" },
        ])
        expect(dropped).toBe(1)
        expect(valid.map((change) => change.type)).toEqual(["spell-add", "spell-remove", "trait-remove", "feat-remove", "item-add", "item-remove", "item-quantity"])
        expect(valid[0]).toMatchObject({ prepared: true })
        expect(valid[4]).toMatchObject({ quantity: 1, equipped: false })
        expect(valid.map((change) => requiresCatalogSource("sheet", change))).toEqual([true, false, false, false, false, false, false])
        // A escolha malformada vira ausente (a alteração fica, e o servidor recusa pela falta da escolha).
        expect(combatSheetChangeSchema.parse({ type: "spellcasting-attribute", attribute: "wisdom", reason: "x", choice: { quote: "" } }).choice).toBeUndefined()
    })

    it("a resposta da preparação traz a pergunta do Maddox; sem ela, o servidor monta a sua", () => {
        const options = buildCombatOptions({ sheet: { level: 1, abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }, proficiencyBonus: 2, spellAttribute: null, spellSaveDc: 10, spellAttackBonus: 2, spellSlots: {} }, weapons: [], spells: [], items: [], abilities: [], economy: freshEconomy(), conditions: [], dying: false, ignoreResources: true })
        const context = { options, chargeIds: new Set<string>(), itemIds: new Set<string>() }
        expect(interpretPrep({ question: { text: "Qual atributo de conjuração você usa?" } }, context).question).toBe("Qual atributo de conjuração você usa?")
        expect(interpretPrep({ question: { text: "" } }, context).question).toBeNull()
        expect(fallbackQuestion(["Carisma", "Carisma"])).toContain("(sugestão do Maddox: Carisma)")
    })
})
