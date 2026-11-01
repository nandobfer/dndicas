import { describe, expect, it } from "vitest"
import { attacksPerAction, buildCombatOptions, costFromCastingTime, findCombatOption, profileFromText, spellDice, spellResolution, type CombatOptionsInput } from "@/features/maddox/combat-options"
import { freshEconomy } from "@/features/maddox/combat-rules"

const sheet = {
    level: 5,
    abilities: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 8 },
    proficiencyBonus: 3,
    spellAttribute: "wisdom" as const,
    spellSaveDc: 12,
    spellAttackBonus: 4,
    spellSlots: { "1": { total: 2, used: 2 }, "2": { total: 1, used: 0 } },
}

const base = (patch: Partial<CombatOptionsInput> = {}): CombatOptionsInput => ({
    sheet,
    weapons: [
        { id: "w1", name: "Espada Longa", quantity: 1, damageDice: { quantidade: 1, tipo: "d8" }, damageType: "cortante", properties: ["Versátil"] },
        { id: "w2", name: "Adaga", quantity: 1, damageDice: { quantidade: 1, tipo: "d4" }, damageType: "perfurante", properties: ["Acuidade", "Leve", "Arremesso"] },
        { id: "w3", name: "Arco Curto", quantity: 1, damageDice: { quantidade: 1, tipo: "d6" }, damageType: "perfurante", properties: ["Munição", "Duas Mãos"] },
    ],
    spells: [
        { id: "s1", name: "Curar Ferimentos", circle: 1, prepared: true, castingTime: "Ação", concentration: false, saveAttribute: null, baseDice: { quantidade: 2, tipo: "d8" }, extraDicePerLevel: { quantidade: 2, tipo: "d8" }, damageType: null, description: "A criatura recupera pontos de vida.", profile: null },
        { id: "s2", name: "Palavra Curativa", circle: 1, prepared: true, castingTime: "Ação Bônus", concentration: false, saveAttribute: null, baseDice: { quantidade: 2, tipo: "d4" }, extraDicePerLevel: null, damageType: null, description: "Recupera pontos de vida.", profile: null },
        { id: "s3", name: "Chama Sagrada", circle: 0, prepared: false, castingTime: "Ação", concentration: false, saveAttribute: "dexterity", baseDice: { quantidade: 1, tipo: "d8" }, extraDicePerLevel: null, damageType: "radiante", description: "Salvaguarda de Destreza.", profile: null },
        { id: "s4", name: "Bênção", circle: 1, prepared: false, castingTime: "Ação", concentration: true, saveAttribute: null, baseDice: null, extraDicePerLevel: null, damageType: null, description: "", profile: null },
        { id: "s5", name: "Escudo da Fé", circle: 1, prepared: true, castingTime: "Ação Bônus", concentration: true, saveAttribute: null, baseDice: null, extraDicePerLevel: null, damageType: null, description: "", profile: null },
    ],
    items: [
        { id: "i1", name: "Poção de Cura", quantity: 2, consumable: true, effectDice: { quantidade: 2, tipo: "d4" }, description: "Recupera pontos de vida." },
        { id: "i2", name: "Frasco de Ácido", quantity: 0, consumable: true, effectDice: null, description: "" },
    ],
    abilities: [
        { id: "trait:a", name: "Retomar o Fôlego", description: "Como uma Ação Bônus, recupera PV.", profile: { cost: "bonus", trigger: null, resolution: null, halfOnSave: false }, charge: { id: "c1", total: 1, used: 1 } },
        { id: "trait:b", name: "Surto de Ação", description: "", profile: { cost: "other", trigger: null, resolution: null, halfOnSave: false }, charge: null },
        { id: "trait:c", name: "Fúria", description: "Como uma Ação Bônus, entre em fúria.", profile: { cost: "bonus", trigger: null, resolution: null, halfOnSave: false }, charge: { id: "c2", total: 3, used: 1 } },
        { id: "trait:d", name: "Truque Estranho", description: "Algo misterioso.", profile: null, charge: null },
        { id: "trait:e", name: "Ataque Extra", description: "", profile: { cost: "passive", trigger: null, resolution: null, halfOnSave: false }, charge: null },
    ],
    economy: freshEconomy(),
    conditions: [],
    dying: false,
    ...patch,
})

describe("combate tático — opções do personagem (Maddox 7): só o que ele pode usar", () => {
    it("armas equipadas com o bônus certo (Força, Acuidade, Destreza à distância) e o ataque desarmado", () => {
        const options = buildCombatOptions(base())
        const weapons = options.action.filter((option) => option.category === "weapons")
        expect(weapons.map((option) => [option.label, option.attack!.bonus, option.attack!.damage])).toEqual([
            ["Espada Longa", 6, "1d8+3"],
            ["Adaga", 6, "1d4+3"],
            ["Arco Curto", 5, "1d6+2"],
            ["Ataque desarmado", 6, "4"],
        ])
        expect(weapons.find((option) => option.label === "Arco Curto")!.attack!.ranged).toBe(true)
    })

    it("magias: preparadas (ou truques) com espaço livre no círculo ou acima e o custo do tempo de conjuração", () => {
        const options = buildCombatOptions(base())
        const action = options.action.filter((option) => option.category === "spells")
        const bonus = options.bonus.filter((option) => option.category === "spells")
        // 1º círculo esgotado: as magias de 1º só saem no 2º (upcast); Bênção não está preparada.
        expect(action.map((option) => option.label)).toEqual(["Curar Ferimentos", "Chama Sagrada"])
        expect(action[0]!.spell).toMatchObject({ circle: 1, levels: [2] })
        expect(action[0]!.heal).toMatchObject({ dice: "4d8+1" })
        expect(action[1]!.save).toMatchObject({ ability: "dexterity", dc: 12, damage: "2d8" })
        expect(bonus.map((option) => option.label)).toEqual(["Palavra Curativa", "Escudo da Fé"])
        expect(bonus[1]!.detail).toContain("Concentração")
        // Regra de 2024: uma magia com espaço por turno.
        const afterSlot = buildCombatOptions(base({ economy: { ...freshEconomy(), slotSpellCast: true } }))
        expect(afterSlot.action.filter((option) => option.category === "spells").map((option) => option.label)).toEqual(["Chama Sagrada"])
    })

    it("itens consumíveis com quantidade; poção em si mesmo é Ação bônus e num aliado, Ação", () => {
        const options = buildCombatOptions(base())
        expect(options.bonus.find((option) => option.id === "item:i1:self")).toMatchObject({ target: "self", heal: { dice: "2d4" } })
        expect(options.action.find((option) => option.id === "item:i1:ally")).toMatchObject({ target: "ally" })
        expect([...options.action, ...options.bonus].some((option) => option.id.startsWith("item:i2"))).toBe(false)
    })

    it("habilidades pelo custo, sem as esgotadas, passivas e sem uso em combate; as sem custo identificado vão para o Maddox", () => {
        const options = buildCombatOptions(base())
        expect(options.bonus.filter((option) => option.category === "abilities").map((option) => option.label)).toEqual(["Fúria", "Truque Estranho"])
        expect(options.action.filter((option) => option.category === "abilities").map((option) => option.label)).toEqual(["Truque Estranho"])
        expect(options.action.find((option) => option.label === "Truque Estranho")!.uncertain).toBe(true)
    })

    it("Ataque Extra, a economia da ação Atacar e a arma Leve na Ação bônus", () => {
        expect(attacksPerAction([{ name: "Ataque Extra" }])).toBe(2)
        expect(attacksPerAction([{ name: "Ataque Extra" }, { name: "Dois Ataques Extras" }])).toBe(3)
        const midAttack = buildCombatOptions(base({ economy: { ...freshEconomy(), action: false, attackAction: true, attacksLeft: 1, lightAttack: true } }))
        expect(midAttack.action.every((option) => option.category === "weapons")).toBe(true)
        expect(midAttack.bonus.find((option) => option.id === "offhand:w2")!.attack).toMatchObject({ damage: "1d4" })
        const noAction = buildCombatOptions(base({ economy: { ...freshEconomy(), action: false } }))
        expect(noAction.action).toEqual([])
        expect(findCombatOption(noAction, "action", "weapon:w1")).toBeNull()
    })

    it("outra mão: a mesma arma Leve só volta na Ação bônus se houver duas; outra arma Leve aparece", () => {
        const twoLight = base().weapons.concat({ id: "w4", name: "Machadinha", quantity: 1, damageDice: { quantidade: 1, tipo: "d6" }, damageType: "cortante", properties: ["Leve"] })
        const afterDagger = { ...freshEconomy(), action: false, attackAction: true, attacksLeft: 0, lightAttack: true, lightWeaponId: "w2" }
        // Uma adaga só: atacou com ela, não há "Adaga (outra mão)".
        expect(buildCombatOptions(base({ economy: afterDagger })).bonus.filter((option) => option.category === "weapons")).toEqual([])
        // Outra arma Leve: só ela.
        expect(buildCombatOptions(base({ weapons: twoLight, economy: afterDagger })).bonus.filter((option) => option.category === "weapons").map((option) => option.id)).toEqual(["offhand:w4"])
        // Duas adagas: a mesma arma vale.
        const twoDaggers = base().weapons.map((weapon) => (weapon.id === "w2" ? { ...weapon, quantity: 2 } : weapon))
        expect(buildCombatOptions(base({ weapons: twoDaggers, economy: afterDagger })).bonus.filter((option) => option.category === "weapons").map((option) => option.id)).toEqual(["offhand:w2"])
    })

    it("habilidade com cura/acerto automático só resolve pelo servidor com os dados no texto; ataque e salvaguarda sem números vão para o Maddox", () => {
        const abilities = [
            { id: "trait:h", name: "Retomar o Fôlego", description: "Recupera pontos de vida iguais a 1d10 mais seu nível.", profile: { cost: "bonus" as const, trigger: null, resolution: "heal" as const, halfOnSave: false }, charge: null },
            { id: "trait:h2", name: "Cura Leve", description: "Recupera pontos de vida.", profile: { cost: "bonus" as const, trigger: null, resolution: "heal" as const, halfOnSave: false }, charge: null },
            { id: "trait:x", name: "Golpe Sombrio", description: "Faça um ataque com arma: 2d6 extra.", profile: { cost: "bonus" as const, trigger: null, resolution: "attack" as const, halfOnSave: false }, charge: null },
            { id: "trait:y", name: "Raio", description: "Acerta automaticamente: 1d4 de força.", profile: { cost: "bonus" as const, trigger: null, resolution: "auto" as const, halfOnSave: false }, charge: null },
        ]
        const bonus = buildCombatOptions(base({ abilities })).bonus.filter((option) => option.category === "abilities")
        expect(bonus.find((option) => option.id === "ability:trait:h")).toMatchObject({ resolution: "heal", heal: { dice: "1d10" } })
        expect(bonus.find((option) => option.id === "ability:trait:h2")).toMatchObject({ resolution: "utility" })
        expect(bonus.find((option) => option.id === "ability:trait:x")).toMatchObject({ resolution: "utility" })
        expect(bonus.find((option) => option.id === "ability:trait:x")!.attack).toBeUndefined()
        expect(bonus.find((option) => option.id === "ability:trait:y")).toMatchObject({ resolution: "auto", attack: { damage: "1d4" } })
    })

    it("incapacitado ou com 0 PV não tem opções; reação de oportunidade e magias de reação", () => {
        expect(buildCombatOptions(base({ conditions: [{ key: "stunned", untilRound: null }] }))).toMatchObject({ action: [], bonus: [], reactions: [] })
        expect(buildCombatOptions(base({ dying: true })).action).toEqual([])
        const reactions = buildCombatOptions(base()).reactions
        expect(reactions[0]).toMatchObject({ id: "opportunity", trigger: "leave-reach", label: "Ataque de oportunidade (Espada Longa)" })
        expect(buildCombatOptions(base({ economy: { ...freshEconomy(), reaction: false } })).reactions).toEqual([])
    })

    it("classificação pelo texto: custo, gatilho, passivas e resolução das magias", () => {
        expect(profileFromText("Como uma Ação Bônus, você pode…")).toMatchObject({ cost: "bonus" })
        expect(profileFromText("Você pode usar sua Reação quando for atingido por uma jogada de ataque")).toMatchObject({ cost: "reaction", trigger: "hit" })
        expect(profileFromText("Como Reação, quando uma criatura conjurar uma magia")).toMatchObject({ cost: "reaction", trigger: "spell" })
        expect(profileFromText("Você usa uma ação para recuperar o fôlego")).toMatchObject({ cost: "action" })
        expect(profileFromText("Você ataca duas vezes sempre que usar a ação Atacar")).toMatchObject({ cost: "passive" })
        expect(profileFromText("Você tem visão no escuro.")).toBeNull()
        expect(costFromCastingTime("Ação Bônus")).toBe("bonus")
        expect(costFromCastingTime("1 reação")).toBe("reaction")
        expect(costFromCastingTime("1 minuto")).toBe("other")
        expect(spellResolution({ saveAttribute: null, baseDice: { quantidade: 1, tipo: "d10" }, description: "Faça um ataque à distância com magia", profile: null })).toBe("attack")
        expect(spellResolution({ saveAttribute: null, baseDice: null, description: "Quando for atingido por uma jogada de ataque, +5 na CA", profile: null })).toBe("utility")
        expect(spellDice({ circle: 0, baseDice: { quantidade: 1, tipo: "d10" }, extraDicePerLevel: null }, 11, 0)).toBe("3d10")
        expect(spellDice({ circle: 3, baseDice: { quantidade: 8, tipo: "d6" }, extraDicePerLevel: { quantidade: 1, tipo: "d6" } }, 9, 5)).toBe("10d6")
    })
})
