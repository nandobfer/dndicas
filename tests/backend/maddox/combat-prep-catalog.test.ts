import { describe, expect, it } from "vitest"
import { buildCombatOptions, type CombatOptionsInput, type OptionWeapon } from "@/features/maddox/combat-options"
import { detectSneakAttack } from "@/features/maddox/combat-prep"
import { attackMode, freshEconomy, modeReasonText } from "@/features/maddox/combat-rules"
import { applyHitPointsChange, availableHitDice, hitPointsLine, parseHitDice, type SheetHitPoints } from "@/features/maddox/hit-points-ops"
import { isWeaponMasteryFeature, masteryKeyFromName, masteryLimit } from "@/features/maddox/weapon-mastery"
import { CATALOG_SOURCE_MISSING, CATALOG_SOURCE_NOT_READ, CATALOG_SOURCE_QUOTE, catalogRefKey, checkCatalogSource, createCatalogReadLog, recordCatalogRead, recordCatalogToolResult } from "@/features/maddox/server/catalog-reads"
import { CATALOG_NOT_CONSULTED_NOTICE, interpretPrep, orderedChanges } from "@/features/maddox/server/combat-prep"

/** DND-49 — a parte pura: fontes do catálogo, validação da preparação, maestrias e PV fora do combate. */

const ladino = { level: 1, abilities: { strength: 8, dexterity: 17, constitution: 14, intelligence: 10, wisdom: 12, charisma: 10 }, proficiencyBonus: 2, spellAttribute: null, spellSaveDc: 10, spellAttackBonus: 2, spellSlots: {} }
const adaga = (over: Partial<OptionWeapon> = {}): OptionWeapon => ({ id: "adaga", name: "Adaga", quantity: 2, damageDice: { quantidade: 1, tipo: "d4" }, damageType: "perfurante", properties: ["Acuidade / Finesse", "Leve", "Arremesso"], ...over })
const arco: OptionWeapon = { id: "arco", name: "Arco Curto", quantity: 1, damageDice: { quantidade: 1, tipo: "d6" }, damageType: "perfurante", properties: ["Munição"] }
const input = (patch: Partial<CombatOptionsInput> = {}): CombatOptionsInput => ({ sheet: ladino, weapons: [adaga(), arco], spells: [], items: [], abilities: [], economy: freshEconomy(), conditions: [], dying: false, ...patch })

/** Execução com a Adaga e a característica do Ladino lidas por ferramenta. */
const reads = () => {
    const log = createCatalogReadLog()
    recordCatalogTool(log, "Item", "adaga", { name: "Adaga", damageDice: { quantidade: 1, tipo: "d4" }, damageType: "perfurante", description: "Arma simples com Acuidade e Leve." })
    recordCatalogTool(log, "Habilidade", "maestria-ladino", { name: "Maestria em Arma (Ladino)", description: "Seu treinamento com armas permite que você use as propriedades de maestria de dois tipos de armas à sua escolha com as quais você tem Proficiência." })
    recordCatalogTool(log, "Habilidade", "furtivo", { name: "Ataque Furtivo", description: "Uma vez por turno, você pode causar 1d6 pontos de dano adicional." })
    return log
}
const recordCatalogTool = (log: ReturnType<typeof createCatalogReadLog>, tipo: string, id: string, entidade: Record<string, unknown>) => recordCatalogToolResult(log, { tipo, id, entidade })
const context = () => ({ options: buildCombatOptions(input({ ignoreResources: true, economy: { ...freshEconomy(), lightAttack: true } })), chargeIds: new Set<string>(), itemIds: new Set<string>(["item-1"]) })
const ADAGA = { ref: "Item:adaga", quote: "Arma simples com Acuidade e Leve" }

describe("DND-49 — registro das consultas ao catálogo", () => {
    it("só a leitura completa (get) conta; o trecho é comparado sem acento, caixa, pontuação e espaços extras", () => {
        const log = createCatalogReadLog()
        recordCatalogToolResult(log, { itens: [{ id: "x", tipo: "Item", nome: "Adaga" }] })
        expect(log.refs).toEqual([])
        recordCatalogRead(log, "Regra", "699fb13d", { name: "Maestria: Ágil / Nick", description: "<p>Ao realizar o ataque adicional da propriedade <b>Leve</b>, você pode fazê-lo como parte da Ação: Atacar.</p>" })
        expect(checkCatalogSource({ ref: "regra:699fb13d", quote: "ataque adicional da propriedade leve, voce pode faze-lo como parte da acao atacar" }, log)).toBeNull()
        expect(checkCatalogSource(undefined, log)).toBe(CATALOG_SOURCE_MISSING)
        expect(checkCatalogSource({ ref: "Regra:outra", quote: "Leve" }, log)).toBe(CATALOG_SOURCE_NOT_READ)
        expect(checkCatalogSource({ ref: "Regra:699fb13d", quote: "como Ação bônus extra" }, log)).toBe(CATALOG_SOURCE_QUOTE)
    })

    it("o id da subclasse com dois-pontos vira uma chave só", () => {
        expect(catalogRefKey("Subclasse:subclass:ladino:assassino")).toBe("subclasse:subclass:ladino:assassino")
        expect(catalogRefKey("semtipo")).toBeNull()
    })
})

describe("DND-49 — a preparação só aceita alteração de regra com fonte confirmada", () => {
    it("sem source, com ref não lido ou com trecho que não está no texto: vai para dropped e aparece recusada com o motivo", () => {
        const result = interpretPrep(
            {
                modify: [
                    { optionId: "weapon:adaga", attack: { bonus: 7, damage: "1d4+5" }, reason: "Inventado." },
                    { optionId: "weapon:arco", attack: { bonus: 5, damage: "1d6+3" }, reason: "Destreza.", source: { ref: "Item:arco", quote: "x" } },
                    { optionId: "weapon:adaga:thrown", attack: { bonus: 5, damage: "1d4+3" }, reason: "Arremesso.", source: { ref: "Item:adaga", quote: "Arma marcial" } },
                ],
            },
            context(),
            reads(),
        )
        expect(result.overlay.modify).toEqual([])
        expect(result.dropped).toBe(3)
        expect(result.droppedWithoutSource).toBe(3)
        expect(result.refusals.map((change) => change.refused)).toEqual([
            "Não confirmada no catálogo do DnDicas: sem a fonte do catálogo.",
            "Não confirmada no catálogo do DnDicas: a regra citada não foi consultada no catálogo.",
            "Não confirmada no catálogo do DnDicas: o trecho citado não está no catálogo.",
        ])
        expect(result.refusals.every((change) => change.applied === false)).toBe(true)
    })

    it("com fonte válida a alteração é aplicada; rótulo, detalhe e remoção passam sem fonte", () => {
        const result = interpretPrep(
            {
                modify: [
                    { optionId: "weapon:adaga", attack: { bonus: 5, damage: "1d4+3" }, reason: "Adaga 1d4 perfurante (item Adaga).", source: ADAGA },
                    { optionId: "weapon:arco", label: "Arco Curto (élfico)", detail: "Feito pela família", reason: "Só o nome." },
                ],
                remove: [{ optionId: "weapon:adaga:thrown", reason: "Ela não quer arremessar a adaga." }],
            },
            context(),
            reads(),
        )
        expect(result.overlay.modify.map((item) => item.optionId)).toEqual(["weapon:adaga", "weapon:arco"])
        expect(result.overlay.remove.map((item) => item.optionId)).toEqual(["weapon:adaga:thrown"])
        expect(result.refusals).toEqual([])
        expect(result.droppedWithoutSource).toBe(0)
    })

    it("troca de economia exige fonte e as ações padrão do servidor (Esconder-se, desarmado, 'Outra ação') não mudam (decisão do dono D2)", () => {
        const result = interpretPrep(
            {
                modify: [
                    { optionId: "weapon:adaga", economy: "bonus", reason: "Sem regra." },
                    { optionId: "standard:hide", detail: "Você fica Escondido, não Invisível.", reason: "Regra de memória." },
                ],
                remove: [{ optionId: "unarmed", reason: "x" }],
            },
            context(),
            reads(),
        )
        expect(result.overlay.modify).toEqual([])
        expect(result.overlay.remove).toEqual([])
        expect(result.refusals.map((change) => change.refused)).toEqual([
            "Não confirmada no catálogo do DnDicas: sem a fonte do catálogo.",
            "Recusada: esta opção segue a regra fixa do servidor e não é alterada na preparação.",
            "Recusada: esta opção segue a regra fixa do servidor e não é alterada na preparação.",
        ])
    })

    it("acréscimo que repete o ataque da maestria (Ágil) é recusado: o servidor resolve", () => {
        const result = interpretPrep({ add: [{ id: "nick", category: "abilities", economy: "action", label: "Adaga na outra mão (Maestria Nick)", resolution: "attack", attack: { bonus: 5, damage: "1d4" }, reason: "Nick.", source: ADAGA }] }, context(), reads())
        expect(result.overlay.add).toEqual([])
        expect(result.refusals[0]!.refused).toContain("os ataques das maestrias (Ágil, Trespassar) são resolvidos pelo servidor")
    })

    it("item ou talento fora do catálogo: nenhum número é inventado e o modelo que não consultou nada gera o aviso", () => {
        const result = interpretPrep(
            {
                sheetChanges: [{ type: "charge-upsert", name: "Impor as Mãos", total: 5, reason: "Paladino 1." }],
                add: [{ id: "impor", category: "abilities", economy: "action", label: "Impor as Mãos", resolution: "heal", heal: { dice: "5" }, reason: "Paladino 1." }],
                sneakAttack: { dice: null, reason: "O Ataque Furtivo de 1d6 está correto." },
            },
            context(),
            createCatalogReadLog(),
        )
        expect(result.sheetChanges).toEqual([])
        expect(result.overlay.add).toEqual([])
        // O "dice: null" sem fonte não apaga o furtivo do servidor.
        expect(result.rider).toBeUndefined()
        expect(result.droppedWithoutSource).toBe(3)
        expect(orderedChanges(result, [])[0]).toMatchObject({ area: "aviso", reason: CATALOG_NOT_CONSULTED_NOTICE })
    })

    it("alteração sem número (texto acrescentado, equipar) passa sem fonte", () => {
        const result = interpretPrep({ sheetChanges: [{ type: "text-append", field: "notes", text: "Treina com adagas.", reason: "Anotação." }, { type: "item-equip", itemId: "item-1", equipped: true, reason: "Estava na mochila." }] }, context(), createCatalogReadLog())
        expect(result.sheetChanges.map((change) => change.type)).toEqual(["text-append", "item-equip"])
        expect(result.refusals).toEqual([])
    })
})

describe("DND-49 — maestria de arma proposta na preparação", () => {
    const mastery = (current: string[] = [], table: { customColumns: { label: string; values: string[] }[] } | null = null) => ({ items: new Map([["adaga", "nick" as const], ["arco", "vex" as const], ["maca", "sap" as const]]), current: new Set(current), level: 1, table })
    const change = (catalogItemId: string, key: string, quote = "dois tipos de armas") => ({ type: "weapon-mastery", catalogItemId, mastery: key, reason: "Maestria em Arma (Ladino).", source: { ref: "Habilidade:maestria-ladino", quote } })

    it("o limite vem do número no texto da característica lida (dois tipos): a 3ª é recusada", () => {
        const result = interpretPrep({ sheetChanges: [change("adaga", "nick"), change("arco", "vex"), change("maca", "sap")] }, { ...context(), mastery: mastery() }, reads())
        expect(result.sheetChanges.map((item) => item.type === "weapon-mastery" && item.catalogItemId)).toEqual(["adaga", "arco"])
        expect(result.refusals[0]!.refused).toContain("a classe permite 2 maestria(s) neste nível")
    })

    it("a coluna da tabela de progressão vence o texto; sem número em lugar nenhum, recusa com o motivo", () => {
        const byTable = interpretPrep({ sheetChanges: [change("adaga", "nick", "as propriedades de maestria"), change("arco", "vex", "as propriedades de maestria")] }, { ...context(), mastery: mastery([], { customColumns: [{ label: "Maestria em Armas", values: ["1", "1", "2"] }] }) }, reads())
        expect(byTable.sheetChanges).toHaveLength(1)
        const noNumber = interpretPrep({ sheetChanges: [change("adaga", "nick", "as propriedades de maestria")] }, { ...context(), mastery: { ...mastery(), level: 1, table: null, items: new Map([["adaga", "nick" as const]]) } }, (() => {
            const log = createCatalogReadLog()
            recordCatalogTool(log, "Habilidade", "maestria-ladino", { name: "Maestria", description: "Você usa as propriedades de maestria." })
            return log
        })())
        expect(noNumber.refusals[0]!.refused).toContain("limite de maestrias não encontrado no catálogo")
    })

    it("a maestria proposta tem de ser a do item no catálogo", () => {
        const result = interpretPrep({ sheetChanges: [change("adaga", "vex")] }, { ...context(), mastery: mastery() }, reads())
        expect(result.refusals[0]!.refused).toContain("a arma não tem essa maestria no catálogo")
    })
})

describe("DND-49 — Ladino 1 com Adaga: os números batem com o catálogo", () => {
    it("Acuidade usa o maior entre Força e Destreza; à distância usa Destreza; proficiência +2; 1d4 perfurante; furtivo 1d6", () => {
        const options = buildCombatOptions(input())
        expect(options.action.find((option) => option.id === "weapon:adaga")!.attack).toMatchObject({ bonus: 5, damage: "1d4+3", damageType: "perfurante", finesse: true })
        expect(options.action.find((option) => option.id === "weapon:arco")!.attack).toMatchObject({ bonus: 5, damage: "1d6+3", ranged: true })
        const strong = buildCombatOptions(input({ sheet: { ...ladino, abilities: { ...ladino.abilities, strength: 18, dexterity: 12 } } }))
        expect(strong.action.find((option) => option.id === "weapon:adaga")!.attack).toMatchObject({ bonus: 6, damage: "1d4+4" })
        expect(detectSneakAttack({ level: 1, classText: "Ladino", features: [] })).toBe("1d6")
        expect(ladino.spellSaveDc).toBe(10)
    })
})

describe("DND-49 — maestrias nas opções do turno", () => {
    const nick = [adaga({ mastery: "nick" })]

    it("Ágil: depois do ataque com a arma Leve, o ataque extra entra na Ação (não na Ação bônus); uma vez por turno", () => {
        const after = buildCombatOptions(input({ weapons: nick, economy: { ...freshEconomy(), action: false, attackAction: true, lightAttack: true, lightWeaponId: "adaga" } }))
        expect(after.action.find((option) => option.id === "offhand:adaga")).toMatchObject({ economy: "action", label: "Adaga (outra mão · Maestria Ágil)", attack: { damage: "1d4" } })
        expect(after.bonus.some((option) => option.id.startsWith("offhand:"))).toBe(false)
        const used = buildCombatOptions(input({ weapons: nick, economy: { ...freshEconomy(), action: false, attackAction: true, lightAttack: true, lightWeaponId: "adaga", lightExtraUsed: true } }))
        expect([...used.action, ...used.bonus].some((option) => option.id.startsWith("offhand:"))).toBe(false)
    })

    it("uma só arma Leve com quantidade 1: sem ataque extra", () => {
        const options = buildCombatOptions(input({ weapons: [adaga({ quantity: 1, mastery: "nick" })], economy: { ...freshEconomy(), action: false, attackAction: true, lightAttack: true, lightWeaponId: "adaga" } }))
        expect([...options.action, ...options.bonus].some((option) => option.id.startsWith("offhand:"))).toBe(false)
    })

    it("Trespassar: liberado pelo acerto, uma vez por turno, sem somar o modificador ao dano", () => {
        const weapons = [adaga({ id: "machado", name: "Machado", properties: [], mastery: "cleave", damageDice: { quantidade: 1, tipo: "d12" } })]
        const open = buildCombatOptions(input({ weapons, sheet: { ...ladino, abilities: { ...ladino.abilities, strength: 16 } }, economy: { ...freshEconomy(), action: false, attackAction: true, cleave: { weaponId: "machado", targetKey: "npc:1" } } }))
        expect(open.action.find((option) => option.id === "cleave:machado")).toMatchObject({ label: "Machado (Maestria Trespassar)", attack: { damage: "1d12", mastery: "cleave" } })
        const used = buildCombatOptions(input({ weapons, economy: { ...freshEconomy(), cleave: { weaponId: "machado", targetKey: "npc:1" }, cleaveUsed: true } }))
        expect(used.action.some((option) => option.id.startsWith("cleave:"))).toBe(false)
    })

    it("Afligir e Drenar entram na vantagem/desvantagem com o motivo; as duas juntas = rolagem normal com os dois motivos", () => {
        const vexed = attackMode({ attacker: { conditions: [], flags: { vex: { targetKey: "npc:1", round: 2 } } }, target: { conditions: [] }, ranged: false, targetKey: "npc:1" })
        expect(vexed).toMatchObject({ mode: "advantage", reasons: ["Maestria Afligir"] })
        expect(attackMode({ attacker: { conditions: [], flags: { vex: { targetKey: "npc:1", round: 2 } } }, target: { conditions: [] }, ranged: false, targetKey: "npc:2" }).mode).toBe("normal")
        const both = attackMode({ attacker: { conditions: [{ key: "invisible", untilRound: null, source: "Esconder" }], flags: { sapped: { byKey: "pc:1", byName: "Nala" } } }, target: { conditions: [] }, ranged: false })
        expect(both).toMatchObject({ mode: "normal", advantage: true, disadvantage: true })
        expect(modeReasonText(both.mode, both.reasons)).toBe("Normal: vantagem e desvantagem se anulam (atacante invisível, atacante sob a Maestria Drenar)")
        expect(modeReasonText("advantage", ["atacante invisível"])).toBe("Vantagem: atacante invisível")
    })
})

describe("DND-49 — nomes e limite das maestrias", () => {
    it("reconhece a maestria pelo nome do catálogo (pt e en) e a característica de classe que dá maestria", () => {
        expect(masteryKeyFromName("Maestria: Ágil / Nick")).toBe("nick")
        expect(masteryKeyFromName('<span data-id="1">Maestria: Afligir</span>')).toBe("vex")
        expect(masteryKeyFromName("Maestria: Garantido")).toBe("graze")
        expect(masteryKeyFromName("Propriedade: Leve")).toBeNull()
        expect(isWeaponMasteryFeature("Maestria em Arma (Ladino)")).toBe(true)
        expect(isWeaponMasteryFeature("Maestria com Armas (Paladino)")).toBe(true)
        expect(isWeaponMasteryFeature("Maestria em Conjuros")).toBe(false)
    })

    it("limite: tabela de progressão, senão o número escrito; sem número, null", () => {
        expect(masteryLimit({ customColumns: [{ label: "Maestria em Armas", values: ["3", "3", "3", "4"] }] }, 4, "dois tipos")).toBe(4)
        expect(masteryLimit(null, 1, "de três tipos de armas Simples")).toBe(3)
        expect(masteryLimit(null, 1, "use as propriedades de maestria")).toBeNull()
    })
})

describe("DND-49 — PV fora do combate", () => {
    const zero: SheetHitPoints = { hp: 0, hpMax: 10, tempHp: 2, deathSuccess: 1, deathFailure: 2, hitDiceUsed: 0, hitDiceTotal: "3d8" }

    it("curar acorda (testes contra a morte zerados) e nunca passa do máximo; definir limita entre 0 e o máximo", () => {
        expect(applyHitPointsChange(zero, { op: "curar", amount: 50 }).next).toMatchObject({ hp: 10, deathSuccess: 0, deathFailure: 0 })
        expect(applyHitPointsChange(zero, { op: "definir", value: -3 }).next.hp).toBe(0)
        expect(applyHitPointsChange(zero, { op: "curar", amount: 0 }).error).toBe("Informe uma cura maior que zero.")
    })

    it("estabilizar só a 0 PV; acordar com 1 PV só depois de estabilizado", () => {
        const stable = applyHitPointsChange(zero, { op: "estabilizar" }).next
        expect(stable).toMatchObject({ hp: 0, deathSuccess: 3, deathFailure: 0 })
        expect(applyHitPointsChange(zero, { op: "acordar" }).error).toContain("precisa estar estabilizado")
        expect(applyHitPointsChange(stable, { op: "acordar" }).next).toMatchObject({ hp: 1, deathSuccess: 0 })
        expect(applyHitPointsChange({ ...zero, hp: 4 }, { op: "estabilizar" }).error).toContain("não está a 0 PV")
    })

    it("descanso curto gasta dados de vida; descanso longo recupera os PV máximos e zera os testes contra a morte", () => {
        expect(parseHitDice("3d8")).toEqual({ count: 3, die: "d8" })
        expect(availableHitDice({ hitDiceTotal: "3d8", hitDiceUsed: 1 })).toBe(2)
        expect(applyHitPointsChange(zero, { op: "descanso-curto", healed: 7, spent: 1 }).next).toMatchObject({ hp: 7, hitDiceUsed: 1 })
        expect(applyHitPointsChange({ ...zero, hitDiceUsed: 2 }, { op: "descanso-longo" }).next).toMatchObject({ hp: 10, tempHp: 0, deathSuccess: 0, deathFailure: 0, hitDiceUsed: 0 })
        expect(hitPointsLine("Nala", 0, 1, "acordou na caverna")).toBe("PV de Nala: 0 → 1 (acordou na caverna)")
    })
})
