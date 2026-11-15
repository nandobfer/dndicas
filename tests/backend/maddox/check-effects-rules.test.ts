import { describe, expect, it } from "vitest"
import { checkEffectLabel, checkEffectRefusal, effectsForCheck, parseCheckEffectQuote, readCheckEffectEntries, readCheckEffects, type MaddoxCheckEffect } from "@/features/maddox/check-effects"

/** DND-69: regras puras dos efeitos de teste (o dado e o tipo de teste saem do trecho do catálogo). */

const guidance: MaddoxCheckEffect = {
    id: "e1",
    name: "Orientação",
    dice: { count: 1, die: "d4" },
    kinds: ["skill", "ability"],
    skill: "Sobrevivência",
    singleUse: false,
    concentration: true,
    casterCharacterId: "c1",
    casterName: "Lizwan",
    duration: "Concentração, até 1 minuto",
    source: { kind: "spell", ref: "Magia:69add0bca4e9c4998b9003d7", quote: "adiciona 1d4 a qualquer teste de atributo usando a perícia escolhida" },
    campaignId: "camp",
    turnNumber: 26,
    createdAt: "2026-11-15T05:20:51.000Z",
}

describe("DND-69 — leitura do trecho do catálogo", () => {
    it("Orientação: 1d4 em testes de atributo (e de perícia), com perícia escolhida", () => {
        expect(parseCheckEffectQuote("Até que a magia termine, a criatura adiciona 1d4 a qualquer teste de atributo usando a perícia escolhida.")).toEqual({ dice: { count: 1, die: "d4" }, kinds: ["skill", "ability"], requiresSkill: true })
    })

    it("teste de D20 vale nos três tipos; salvaguarda vale só na resistência", () => {
        expect(parseCheckEffectQuote("pode rolar 1d6 e adicionar o número rolado a um Teste de D20")).toMatchObject({ dice: { count: 1, die: "d6" }, kinds: ["skill", "ability", "save"], requiresSkill: false })
        expect(parseCheckEffectQuote("o alvo adiciona 1d4 a suas salvaguardas")).toMatchObject({ kinds: ["save"] })
    })

    it("recusa: sem dado, dois dados, dado que tira (Perdição), dano (Resistência) e sem tipo de teste", () => {
        expect(parseCheckEffectQuote("a criatura ganha vantagem em testes de atributo")).toContain("não traz o dado")
        expect(parseCheckEffectQuote("rola 1d6 no nível 1 e 1d8 no nível 5 em testes de atributo")).toContain("mais de um dado")
        expect(parseCheckEffectQuote("o alvo deve subtrair 1d4 da jogada de ataque ou salvaguarda")).toContain("só efeitos que somam")
        expect(parseCheckEffectQuote("a criatura reduz o dano total sofrido em 1d4 pontos")).toContain("só efeitos que somam")
        expect(parseCheckEffectQuote("adiciona 1d4 à próxima jogada de ataque")).toContain("não diz em que teste")
    })
})

describe("DND-69 — em que teste o efeito entra", () => {
    it("a perícia escolhida manda: outra perícia, atributo puro e resistência ficam de fora com o motivo", () => {
        expect(checkEffectRefusal(guidance, { kind: "skill", skill: "Sobrevivência" })).toBeNull()
        expect(checkEffectRefusal(guidance, { kind: "skill", skill: "sobrevivencia" })).toBeNull()
        expect(checkEffectRefusal(guidance, { kind: "skill", skill: "Furtividade" })).toBe("vale só em testes de Sobrevivência")
        expect(checkEffectRefusal(guidance, { kind: "ability", skill: null })).toBe("vale só em testes de Sobrevivência")
        const save = { ...guidance, id: "e2", name: "Favor", kinds: ["save" as const], skill: null }
        expect(checkEffectRefusal(save, { kind: "skill", skill: "Atletismo" })).toBe("vale só em testes de resistência")
        const split = effectsForCheck([guidance, save], { kind: "save", skill: null })
        expect(split.applied.map((item) => item.id)).toEqual(["e2"])
        expect(split.skipped.map((item) => item.effect.id)).toEqual(["e1"])
    })

    it("rótulo e leitura tolerante do que está gravado", () => {
        expect(checkEffectLabel(guidance)).toBe("Orientação +1d4 em testes de Sobrevivência (concentração de Lizwan)")
        expect(readCheckEffects([guidance, { name: "lixo" }, null])).toHaveLength(1)
        expect(readCheckEffects(undefined)).toEqual([])
        expect(readCheckEffectEntries([{ id: "e1", name: "Orientação", dice: "1d4", status: "applied", results: [3] }, { foo: 1 }])).toEqual([{ id: "e1", name: "Orientação", dice: "1d4", status: "applied", results: [3], reason: null }])
    })
})
