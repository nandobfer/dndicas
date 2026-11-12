import { describe, expect, it } from "vitest"
import { canSpendHitDice, emptyRestDecisions, hitDicePool, hitDieHeal, longRestHitDiceBack, quoteMentionsRest, REST_REASON_MANUAL_CHARGE, REST_REASON_NO_RULE, REST_REASON_SHORT_SLOTS, REST_REASON_UNAVAILABLE, restEntryDone, restEntryWaits, restNeedsCatalog, restPlan, restTranscriptLine, type RestSheet } from "@/features/maddox/rest-rules"
import { exhaustionLevel, exhaustionLine, exhaustionPenaltyOf, isExhaustionDeath, nextExhaustion } from "@/features/maddox/exhaustion-rules"
import { checkModifier } from "@/features/maddox/check-modifier"
import { deathSave } from "@/features/maddox/combat-rules"
import { restBannerText, restCharacterStatusText } from "@/features/maddox/rest-view"

const source = (entityId: string) => ({ kind: "class-feature", entityType: "Habilidade", entityId })

const wizard = (over: Partial<RestSheet> = {}): RestSheet => ({
    level: 5,
    hpCurrent: 12,
    hpMax: 30,
    hpTemp: 4,
    hitDiceTotal: "d6",
    hitDiceUsed: 4,
    deathSavesSuccess: 1,
    deathSavesFailure: 2,
    exhaustion: 2,
    spellSlots: { "1": { total: 4, used: 3 }, "2": { total: 3, used: 1 }, "3": { total: 2, used: 0 } },
    resourceCharges: [
        { id: "arcane", name: "Recuperação Arcana", total: 1, used: 1, source: source("hab-arcane") },
        { id: "luck", name: "Sorte", total: 3, used: 2, source: { kind: "feat", entityType: "Talento", entityId: "tal-luck" } },
        { id: "manual", name: "Fôlego do cozinheiro", total: 2, used: 2, source: null },
        { id: "fresh", name: "Intacta", total: 2, used: 0, source: source("hab-fresh") },
    ],
    ...over,
})

describe("DND-58 — dados de vida", () => {
    it("a ficha do Maddox grava só o tipo ('d8'): o total é o nível; '3d8' vale o número escrito", () => {
        expect(hitDicePool({ hitDiceTotal: "d8", hitDiceUsed: 1, level: 4 })).toEqual({ die: "d8", faces: 8, total: 4, used: 1, available: 3 })
        expect(hitDicePool({ hitDiceTotal: "3d10", hitDiceUsed: 5, level: 7 })).toMatchObject({ die: "d10", total: 3, used: 3, available: 0 })
        expect(hitDicePool({ hitDiceTotal: "", hitDiceUsed: 0, level: 3 })).toMatchObject({ die: null, available: 0 })
    })

    it("só rola com PV abaixo do máximo e dado disponível; cura nunca abaixo de 0 (Constituição negativa)", () => {
        expect(canSpendHitDice({ hitDiceTotal: "d8", hitDiceUsed: 0, level: 2, hpCurrent: 5, hpMax: 10 })).toBe(true)
        expect(canSpendHitDice({ hitDiceTotal: "d8", hitDiceUsed: 0, level: 2, hpCurrent: 10, hpMax: 10 })).toBe(false)
        expect(canSpendHitDice({ hitDiceTotal: "d8", hitDiceUsed: 2, level: 2, hpCurrent: 5, hpMax: 10 })).toBe(false)
        expect(canSpendHitDice({ hitDiceTotal: "d8", hitDiceUsed: 0, level: 2, hpCurrent: 0, hpMax: 10 })).toBe(true)
        expect(hitDieHeal(1 - 2)).toBe(0)
        expect(hitDieHeal(7)).toBe(7)
    })

    it("o descanso longo devolve metade do total (para baixo), no mínimo 1", () => {
        expect(longRestHitDiceBack(1)).toBe(1)
        expect(longRestHitDiceBack(5)).toBe(2)
        expect(longRestHitDiceBack(8)).toBe(4)
    })
})

describe("DND-58 — recuperação no fim do descanso", () => {
    it("longo: PV máximos, metade dos dados, todos os espaços, testes zerados, exaustão −1; magias preparadas não são campo do plano", () => {
        const decisions = emptyRestDecisions()
        decisions.charges.set("arcane", { recover: "all" })
        const plan = restPlan(wizard(), "long", decisions)
        expect(plan.set).toMatchObject({ hpCurrent: 30, hpTemp: 0, hitDiceUsed: 2, deathSavesSuccess: 0, deathSavesFailure: 0, exhaustion: 1 })
        expect(plan.set.spellSlots).toEqual({ "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 }, "3": { total: 2, used: 0 } })
        expect((plan.set.resourceCharges as RestSheet["resourceCharges"]).find((charge) => charge.id === "arcane")!.used).toBe(0)
        expect(plan.recovered.map((line) => line.label)).toEqual(expect.arrayContaining(["PV", "Dados de vida gastos", "Exaustão", "Espaços de 1º círculo", "Recuperação Arcana"]))
        expect(plan.notRecovered).toEqual(expect.arrayContaining([{ label: "Sorte", reason: REST_REASON_NO_RULE }, { label: "Fôlego do cozinheiro", reason: REST_REASON_MANUAL_CHARGE }]))
        expect(plan.notRecovered.some((line) => line.label === "Intacta")).toBe(false)
        expect(Object.keys(plan.set)).not.toContain("prepared")
    })

    it("longo com poucos dados: nunca passa de zero gastos", () => {
        expect(restPlan(wizard({ level: 1, hitDiceUsed: 1 }), "long").set.hitDiceUsed).toBe(0)
    })

    it("curto: PV e dados de vida não mudam; espaços só com a regra da classe (Magia de Pacto); cargas pelo catálogo", () => {
        const none = restPlan(wizard(), "short")
        expect(none.set).not.toHaveProperty("hpCurrent")
        expect(none.set).not.toHaveProperty("hitDiceUsed")
        expect(none.set).not.toHaveProperty("exhaustion")
        expect(none.set).not.toHaveProperty("spellSlots")
        expect(none.notRecovered).toEqual(expect.arrayContaining([{ label: "Espaços de 1º círculo", reason: REST_REASON_SHORT_SLOTS }]))
        const pact = emptyRestDecisions()
        pact.shortRestSlots = true
        pact.charges.set("luck", { recover: 1 })
        const warlock = restPlan(wizard(), "short", pact)
        expect(warlock.set.spellSlots).toMatchObject({ "1": { used: 0 }, "2": { used: 0 } })
        expect((warlock.set.resourceCharges as RestSheet["resourceCharges"]).find((charge) => charge.id === "luck")!.used).toBe(1)
    })

    it("'Seguir sem': cargas e espaços do curto não voltam, com o motivo", () => {
        const plan = restPlan(wizard(), "short", { ...emptyRestDecisions(), unavailable: true })
        expect(plan.notRecovered).toEqual(expect.arrayContaining([{ label: "Recuperação Arcana", reason: REST_REASON_UNAVAILABLE }, { label: "Espaços de 1º círculo", reason: REST_REASON_UNAVAILABLE }]))
        expect(plan.set).toEqual({})
    })

    it("classe sem conjuração e nada gasto: nada a decidir no catálogo", () => {
        const fighter = wizard({ spellSlots: {}, resourceCharges: [{ id: "surge", name: "Surto de Ação", total: 1, used: 0, source: source("hab-surge") }] })
        expect(restNeedsCatalog(fighter, "short")).toBe(false)
        expect(restNeedsCatalog(wizard(), "long")).toBe(true)
        expect(restPlan(fighter, "short").notRecovered).toEqual([])
    })

    it("o trecho do catálogo precisa falar do descanso: curto só curto; longo aceita curto ou longo (pt-BR e inglês)", () => {
        expect(quoteMentionsRest("Você recupera todos os espaços quando termina um Descanso Curto ou Longo", "short")).toBe(true)
        expect(quoteMentionsRest("regain all expended Pact Magic spell slots when you finish a Short or Long Rest", "short")).toBe(true)
        expect(quoteMentionsRest("você recupera os usos gastos ao terminar um descanso longo", "short")).toBe(false)
        expect(quoteMentionsRest("você recupera os usos gastos ao terminar um descanso longo", "long")).toBe(true)
        expect(quoteMentionsRest("recupera ao terminar um descanso curto", "long")).toBe(true)
        expect(quoteMentionsRest("uma vez por dia", "long")).toBe(false)
    })

    it("parte concluída, espera e transcrição", () => {
        const base = { prep: { status: "ready", recovered: [{ label: "PV", before: "3", after: "10" }], notRecovered: [{ label: "Sorte", reason: REST_REASON_NO_RULE }] }, hitDice: { status: "open", rolls: [{ healed: 4 }] }, exchange: { status: "open", applied: ["Magia X → Y"] }, doneReason: null, name: "Lyra" }
        expect(restEntryDone(base)).toBe(false)
        expect(restEntryWaits(base)).toEqual(["hit-dice", "exchange"])
        expect(restEntryDone({ ...base, hitDice: { status: "done", rolls: [] }, exchange: { status: "nothing", applied: [] } })).toBe(true)
        expect(restEntryWaits({ ...base, prep: { ...base.prep, status: "failed" } })).toContain("prep")
        const line = restTranscriptLine({ type: "short", status: "closed", description: "Fogueira", interruption: null, characters: [base] })
        expect(line).toContain("Descanso curto concluído — Fogueira")
        expect(line).toContain("Lyra: recuperou PV: 3 → 10")
        expect(line).toContain("gastou 1 dado(s) de vida (+4 PV)")
        expect(restTranscriptLine({ type: "long", status: "interrupted", description: "", interruption: "Emboscada", characters: [base] })).toBe("Descanso longo interrompido (Emboscada) — Lyra: nada foi recuperado.")
    })

    it("textos da tela: faixa e situação de cada personagem", () => {
        expect(restBannerText([])).toBeNull()
        expect(restBannerText([{ characterName: "Lyra", parts: ["hit-dice", "exchange"] }])).toBe("Descanso — aguardando Lyra (dados de vida, trocas)")
        const entry = { prep: { status: "ready" as const, recovered: [], notRecovered: [], skippedCatalog: false, error: null }, hitDice: { status: "none" as const, die: null, available: 0, hp: 0, hpMax: 0, constitution: 0, rolls: [] }, exchange: { status: "open" as const, applied: [], requests: 0 }, doneReason: null, done: false, answeredBy: "player" as const }
        expect(restCharacterStatusText(entry)).toBe("Pensando nas trocas")
        expect(restCharacterStatusText({ ...entry, doneReason: "offline" })).toBe("Offline: concluiu sem rolar e sem trocar")
        expect(restCharacterStatusText({ ...entry, answeredBy: "owner" })).toBe("Aguardando o dono da campanha")
    })
})

describe("DND-58 — exaustão", () => {
    it("nível 0–6, −2 por nível, nível 6 = morte", () => {
        expect(exhaustionLevel(9)).toBe(6)
        expect(exhaustionLevel(undefined)).toBe(0)
        expect(exhaustionPenaltyOf(3)).toBe(-6)
        expect(exhaustionPenaltyOf(0)).toBe(0)
        expect(nextExhaustion(5, 3)).toBe(6)
        expect(nextExhaustion(1, -4)).toBe(0)
        expect(isExhaustionDeath(6)).toBe(true)
        expect(isExhaustionDeath(5)).toBe(false)
        expect(exhaustionLine("Nala", 1, 2, "marcha forçada")).toBe("Exaustão de Nala: 1 → 2 (marcha forçada)")
    })

    it("a penalidade entra em todo teste da ficha (perícia, atributo, resistência) com a parcela 'Exaustão'", () => {
        const sheet = { strength: 10, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, level: 1, proficiencyBonusOverride: null, savingThrows: { strength: false, dexterity: true, constitution: false, intelligence: false, wisdom: false, charisma: false }, skills: {} as never, exhaustion: 2 }
        const save = checkModifier(sheet, { kind: "save", ability: "dexterity", skill: null })
        expect(save.value).toBe(2 + 2 - 4)
        expect(save.parts.at(-1)).toEqual({ label: "Exaustão", value: "-4", color: "manual" })
        expect(checkModifier({ ...sheet, exhaustion: 0 }, { kind: "ability", ability: "dexterity", skill: null }).value).toBe(2)
        expect(checkModifier(sheet, { kind: "ability", ability: "dexterity", skill: null }).value).toBe(-2)
    })

    it("teste contra a morte: o total (d20 + penalidade) decide o 10+; os naturais seguem o d20", () => {
        expect(deathSave(11, { success: 0, failure: 0 }, -2)).toMatchObject({ success: 0, failure: 1 })
        expect(deathSave(12, { success: 0, failure: 0 }, -2)).toMatchObject({ success: 1, failure: 0 })
        expect(deathSave(20, { success: 0, failure: 2 }, -10)).toMatchObject({ revived: true })
        expect(deathSave(1, { success: 0, failure: 0 }, 0)).toMatchObject({ failure: 2 })
    })
})
