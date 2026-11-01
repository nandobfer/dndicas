import { describe, expect, it } from "vitest"
import { monsterActionFromCatalog, monsterStatsFromCatalog, monsterStatsFromCustom, multiattackOf, parseHitRoll, rechargeHit } from "@/features/maddox/server/combat-monsters"

describe("combate tático — bloco de estatísticas dos adversários (Maddox 7)", () => {
    it("lê o dano do catálogo (dados somados e o primeiro tipo)", () => {
        expect(parseHitRoll("1d6 +2 cortante")).toEqual({ damage: "1d6+2", damageType: "cortante" })
        expect(parseHitRoll("2d8 + 10 cortante + 2d8 fogo")).toEqual({ damage: "4d8+10", damageType: "cortante" })
        expect(parseHitRoll("13d10 fogo")).toEqual({ damage: "13d10", damageType: "fogo" })
        expect(parseHitRoll(undefined)).toEqual({ damage: null, damageType: null })
    })

    it("ações: ataque com bônus, salvaguarda com CD e metade no sucesso, recarga e Ataques Múltiplos", () => {
        expect(monsterActionFromCatalog({ label: "Cimitarra", description: "<p>Ataque corpo a corpo: +4 para acertar.</p>", attackRoll: 4, hitRoll: "1d6 + 2 cortante" }, "action")).toMatchObject({ kind: "attack", bonus: 4, damage: "1d6+2", ranged: false })
        expect(monsterActionFromCatalog({ label: "Arco Curto", description: "<p>Ataque à distância: +4 para acertar.</p>", attackRoll: 4, hitRoll: "1d6+2 perfurante" }, "action").ranged).toBe(true)
        expect(monsterActionFromCatalog({ label: "Sopro de Fogo (Recarga 5-6)", description: "<p>Salvaguarda de Destreza CD 24. Falha: 71 (13d10) de dano de Fogo. Sucesso: Metade do dano.</p>", hitRoll: "13d10 fogo", recharge: "5-6" }, "action")).toMatchObject({
            kind: "save",
            name: "Sopro de Fogo",
            ability: "dexterity",
            dc: 24,
            halfOnSave: true,
            recharge: "5-6",
        })
        expect(multiattackOf([{ label: "Ataques Múltiplos", description: "<p>O dragão realiza três ataques de Rasgar.</p>" }])).toBe(3)
        expect(multiattackOf([])).toBe(1)
        expect(rechargeHit("5-6", 4)).toBe(false)
        expect(rechargeHit("5-6", 5)).toBe(true)
    })

    it("catálogo: PV pela média, CA pelo primeiro número, salvaguardas pela proficiência do ND e resistências em pt-BR", () => {
        const stats = monsterStatsFromCatalog({
            _id: "m1",
            name: "Ogro",
            armorClass: "11 (armadura de couro)",
            hitPointsFormula: "7d10 + 21",
            attributes: { strength: 19, dexterity: 8, constitution: 16, intelligence: 5, wisdom: 7, charisma: 7 },
            savingThrows: { constitution: { proficient: true }, wisdom: { override: 1 } },
            challengeRating: "2",
            damageResistances: ["fire", "physical"],
            actions: [{ label: "Clava Grande", description: "<p>Ataque corpo a corpo: +6.</p>", attackRoll: 6, hitRoll: "2d8+4 concussão" }],
        })
        expect(stats).toMatchObject({ source: "catalog", ac: 11, hpMax: 59, hp: 59, initiativeBonus: -1, multiattack: 1 })
        expect(stats.saves).toMatchObject({ constitution: 5, wisdom: 1, strength: 4 })
        expect(stats.resistances).toEqual(expect.arrayContaining(["fogo", "cortante", "perfurante"]))
    })

    it("bloco próprio (Rigoroso)", () => {
        const stats = monsterStatsFromCustom({ ca: 13, pv: 22, destreza: 14, acoes: [{ nome: "Garra", tipo: "ataque", bonus: 5, dano: "2d6+3", tipoDano: "cortante" }, { nome: "Uivo", tipo: "salvaguarda", cd: 13, atributo: "Sabedoria" }] })
        expect(stats).toMatchObject({ source: "custom", ac: 13, hpMax: 22, initiativeBonus: 2 })
        expect(stats.actions[1]).toMatchObject({ kind: "save", ability: "wisdom", dc: 13 })
    })
})
