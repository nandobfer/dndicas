import { describe, expect, it } from "vitest"
import { applyCoinChange, coinChangeProblem, coinChangeText, coinsText, isCoinItemName } from "@/features/maddox/coin-rules"

/** DND-65: moedas são campo da ficha. pp = prata (`sp`), pl = platina (`pp`). */
describe("coin-rules (DND-65)", () => {
    it("coinsText mostra as moedas com saldo, da mais valiosa à menos valiosa", () => {
        expect(coinsText({ gp: 11, sp: 30, cp: 0, ep: 0, pp: 2 })).toBe("2 pl, 11 po, 30 pp")
        expect(coinsText({ gp: 0, sp: 0 })).toBe("nenhuma")
        expect(coinsText(undefined)).toBe("nenhuma")
    })

    it("subtrair 5 pp de 30 pp deixa 25 pp no campo sp (prata), sem mexer na platina", () => {
        const result = applyCoinChange({ gp: 0, sp: 30, cp: 0, ep: 0, pp: 4 }, { subtract: { pp: 5 } })
        expect(result).toMatchObject({ ok: true, inc: { "coins.sp": -5 }, requires: { "coins.sp": 5 } })
        if (result.ok) expect(result.after).toMatchObject({ sp: 25, pp: 4 })
    })

    it("somar e depois subtrair deixa o saldo exato", () => {
        const first = applyCoinChange({ gp: 1 }, { add: { po: 2 } })
        expect(first.ok && first.after.gp).toBe(3)
        const second = applyCoinChange(first.ok ? first.after : {}, { subtract: { po: 1 } })
        expect(second.ok && second.after.gp).toBe(2)
    })

    it("gastar mais do que existe é recusado com o motivo (sem troco automático)", () => {
        const result = applyCoinChange({ gp: 11, sp: 0 }, { subtract: { pp: 5 } }, "Lizwan")
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.reason).toContain("Lizwan não tem moedas suficientes")
            expect(result.reason).toContain("tem 0 pp e precisa tirar 5 pp")
            expect(result.reason).toContain("saldo: 11 po")
        }
    })

    it("troco explícito na mesma alteração", () => {
        const result = applyCoinChange({ gp: 11, sp: 0 }, { subtract: { po: 1 }, add: { pp: 10 } })
        expect(result).toMatchObject({ ok: true, inc: { "coins.gp": -1, "coins.sp": 10 }, requires: { "coins.gp": 1 } })
    })

    it("valor negativo, decimal, vazio, acima do teto ou a mesma moeda nos dois lados é recusado", () => {
        expect(coinChangeProblem({ add: { po: -1 } })).toContain("inválida")
        expect(coinChangeProblem({ add: { po: 2.5 } })).toContain("inválida")
        expect(coinChangeProblem({ add: { po: "5" as unknown as number } })).toContain("inválida")
        expect(coinChangeProblem({})).toContain("ao menos uma moeda")
        expect(coinChangeProblem({ add: { po: 0 } })).toContain("ao menos uma moeda")
        expect(coinChangeProblem({ add: { po: 1_000_000 } })).toContain("acima do limite")
        expect(coinChangeProblem({ add: { pp: 1 }, subtract: { pp: 1 } })).toContain("mesma moeda")
        expect(applyCoinChange({ gp: 5 }, { add: { po: -1 } }).ok).toBe(false)
    })

    it("coinChangeText", () => {
        expect(coinChangeText({ add: { po: 2 }, subtract: { pp: 5 } })).toBe("+2 po, −5 pp")
    })

    it("isCoinItemName pega moeda e não pega objeto de metal nem poção", () => {
        for (const name of ["Peças de prata", "<p>Moedas de prata</p>", "30 po", "5pp", "Moeda de ouro", "30 peças de prata", "Bolsa de moedas de ouro", "12 moedas de cobre", "Peças de Platina"]) expect(isCoinItemName(name), name).toBe(true)
        for (const name of ["Espada Curta de Prata", "Poção de Cura", "Adaga", "Kit de Assaltante", "Anel de ouro", ""]) expect(isCoinItemName(name), name).toBe(false)
    })
})
