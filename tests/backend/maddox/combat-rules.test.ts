import { describe, expect, it } from "vitest"
import {
    adjustDamage,
    applyDamage,
    applyHealing,
    attackMode,
    attackOutcome,
    autoCritical,
    averageOf,
    canAct,
    concentrationDc,
    criticalExpression,
    damageAtZero,
    deathSave,
    exhaustionPenalty,
    formatDiceExpression,
    hpBand,
    parseDiceExpression,
    saveMode,
    sortInitiative,
    type CombatCondition,
} from "@/features/maddox/combat-rules"

const cond = (key: CombatCondition["key"], level?: number): CombatCondition => ({ key, untilRound: null, ...(level ? { level } : {}) })
const subject = (...conditions: CombatCondition[]) => ({ conditions, flags: {} })

describe("combate tático — regras puras (Maddox 7)", () => {
    it("vantagem e desvantagem do ataque pelas condições e flags, que se anulam", () => {
        expect(attackMode({ attacker: subject(), target: subject(), ranged: false }).mode).toBe("normal")
        expect(attackMode({ attacker: subject(cond("invisible")), target: subject(), ranged: false }).mode).toBe("advantage")
        expect(attackMode({ attacker: subject(cond("poisoned")), target: subject(), ranged: false }).mode).toBe("disadvantage")
        expect(attackMode({ attacker: subject(), target: subject(cond("prone")), ranged: false }).mode).toBe("advantage")
        expect(attackMode({ attacker: subject(), target: subject(cond("prone")), ranged: true }).mode).toBe("disadvantage")
        expect(attackMode({ attacker: subject(), target: { conditions: [], flags: { dodging: true } }, ranged: false }).mode).toBe("disadvantage")
        // Esquiva não vale com o alvo incapacitado.
        expect(attackMode({ attacker: subject(), target: { conditions: [cond("stunned")], flags: { dodging: true } }, ranged: false }).mode).toBe("advantage")
        expect(attackMode({ attacker: subject(cond("poisoned")), target: subject(cond("restrained")), ranged: false }).mode).toBe("normal")
        expect(attackMode({ attacker: subject(), target: subject(), ranged: false, helped: true }).mode).toBe("advantage")
    })

    it("20 natural acerta com crítico, 1 natural erra; corpo a corpo em Paralisado/Inconsciente vira crítico", () => {
        expect(attackOutcome(20, 21, 30)).toEqual({ hit: true, critical: true, fumble: false })
        expect(attackOutcome(1, 25, 10)).toEqual({ hit: false, critical: false, fumble: true })
        expect(attackOutcome(10, 15, 15)).toMatchObject({ hit: true, critical: false })
        expect(attackOutcome(10, 14, 15)).toMatchObject({ hit: false })
        expect(autoCritical(subject(cond("paralyzed")), false)).toBe(true)
        expect(autoCritical(subject(cond("paralyzed")), true)).toBe(false)
        expect(attackOutcome(10, 16, 15, true)).toMatchObject({ hit: true, critical: true })
    })

    it("salvaguardas: falha automática de Força e Destreza incapacitado; Esquiva dá vantagem em Destreza; Contido, desvantagem", () => {
        expect(saveMode(subject(cond("stunned")), "dexterity")).toBe("fail")
        expect(saveMode(subject(cond("stunned")), "wisdom")).toBe("normal")
        expect(saveMode({ conditions: [], flags: { dodging: true } }, "dexterity")).toBe("advantage")
        expect(saveMode(subject(cond("restrained")), "dexterity")).toBe("disadvantage")
        expect(canAct(subject(cond("incapacitated")))).toBe(false)
        expect(canAct(subject(cond("poisoned")))).toBe(true)
        expect(exhaustionPenalty(subject(cond("exhaustion", 2)))).toBe(-4)
    })

    it("dano com resistência, imunidade e vulnerabilidade; PV temporários primeiro; 0 PV e morte instantânea", () => {
        expect(adjustDamage(9, "fogo", { resistances: ["fogo"] })).toEqual({ amount: 4, note: "resistente" })
        expect(adjustDamage(9, "Fogo", { immunities: ["fogo"] })).toEqual({ amount: 0, note: "imune" })
        expect(adjustDamage(9, "frio", { vulnerabilities: ["frio"] })).toEqual({ amount: 18, note: "vulnerável" })
        expect(applyDamage({ hp: 10, hpMax: 20, tempHp: 5 }, 7)).toMatchObject({ hp: 8, tempHp: 0, absorbed: 5, dealt: 2, droppedToZero: false })
        expect(applyDamage({ hp: 5, hpMax: 20, tempHp: 0 }, 9)).toMatchObject({ hp: 0, droppedToZero: true, massiveDeath: false })
        expect(applyDamage({ hp: 5, hpMax: 20, tempHp: 0 }, 25)).toMatchObject({ hp: 0, massiveDeath: true })
        expect(applyDamage({ hp: 0, hpMax: 20, tempHp: 0 }, 3)).toMatchObject({ atZero: true, droppedToZero: false })
        expect(applyHealing({ hp: 18, hpMax: 20, tempHp: 0 }, 9)).toMatchObject({ hp: 20, healed: 2 })
        expect(hpBand(20, 20)).toBe("ileso")
        expect(hpBand(11, 20)).toBe("ferido")
        expect(hpBand(10, 20)).toBe("muito-ferido")
        expect(hpBand(0, 20)).toBe("caido")
    })

    it("testes contra a morte e dano a 0 PV (2024)", () => {
        expect(deathSave(20, { success: 0, failure: 2 })).toMatchObject({ revived: true, success: 0, failure: 0 })
        expect(deathSave(1, { success: 0, failure: 0 })).toMatchObject({ failure: 2, dead: false })
        expect(deathSave(1, { success: 0, failure: 1 })).toMatchObject({ failure: 3, dead: true })
        expect(deathSave(10, { success: 2, failure: 1 })).toMatchObject({ success: 3, stable: true })
        expect(deathSave(9, { success: 0, failure: 0 })).toMatchObject({ failure: 1 })
        expect(damageAtZero({ success: 1, failure: 1 }, true)).toMatchObject({ failure: 3, dead: true })
        expect(concentrationDc(8)).toBe(10)
        expect(concentrationDc(31)).toBe(15)
        expect(concentrationDc(100)).toBe(30)
    })

    it("ordem de iniciativa: total, Destreza, personagens antes dos adversários, ordem de entrada", () => {
        const order = sortInitiative([
            { actorKey: "g", kind: "combatant" as const, total: 12, dexterity: 14, joinIndex: 2 },
            { actorKey: "a", kind: "character" as const, total: 12, dexterity: 14, joinIndex: 1 },
            { actorKey: "b", kind: "character" as const, total: 12, dexterity: 16, joinIndex: 0 },
            { actorKey: "c", kind: "character" as const, total: 18, dexterity: 8, joinIndex: 3 },
        ])
        expect(order.map((item) => item.actorKey)).toEqual(["c", "b", "a", "g"])
    })

    it("expressões de dados: leitura, crítico e média", () => {
        expect(parseDiceExpression("2d6 + 3")).toEqual({ terms: [{ dice: "d6", quantity: 2 }], modifier: 3 })
        expect(parseDiceExpression("1d8+1d8-1")).toEqual({ terms: [{ dice: "d8", quantity: 2 }], modifier: -1 })
        expect(parseDiceExpression("1d7")).toBeNull()
        expect(parseDiceExpression("dano")).toBeNull()
        expect(formatDiceExpression(criticalExpression(parseDiceExpression("1d6+3")!))).toBe("2d6+3")
        expect(averageOf(parseDiceExpression("2d6")!)).toBe(7)
    })
})
