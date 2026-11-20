import { describe, expect, it } from "vitest"
import { addedOptionDeps, changedPartLabels, diffPrepFingerprint, optionDeps, overlaySize, prepFingerprint, PREP_FULL_REASONS, pruneOverlay, sheetChangePart } from "@/features/maddox/combat-prep-cache"
import { emptyOverlay, type CombatPrepOverlay } from "@/features/maddox/combat-types"
import { snapshotOf } from "@/features/maddox/server/combat-prep-cache"
import { interpretPrep, OUT_OF_SCOPE_REFUSAL } from "@/features/maddox/server/combat-prep"
import { applyCombatPrep } from "@/features/maddox/combat-prep"
import { buildCombatOptions } from "@/features/maddox/combat-options"
import { freshEconomy } from "@/features/maddox/combat-rules"

/** DND-78: impressão digital da ficha por partes, o que muda entre dois combates e a poda do overlay guardado. */

const CONTEXT = { version: 1, instructions: "Prepare.", rigor: "fiel-dnd" }
const sheet = (over: Record<string, unknown> = {}) => ({
    level: 3, class: "Guerreiro", subclass: null, race: "Humano", origin: "Soldado", strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8,
    savingThrows: { strength: true }, skills: { atletismo: { proficient: true } }, spellSlots: { "1": { total: 2, used: 0 } }, resourceCharges: [{ id: "c1", name: "Retomar o Fôlego", total: 1, used: 0 }],
    hpCurrent: 20, hpMax: 20, hpTemp: 0, coins: { gp: 10 }, updatedAt: new Date("2026-11-01"), armorClassBonuses: [],
    ...over,
})
const lists = (over: Partial<Parameters<typeof snapshotOf>[1]> = {}): Parameters<typeof snapshotOf>[1] => ({
    attacks: [{ _id: "a1", name: "Espada", attackBonus: "+5", damageType: "1d8+3 cortante" }],
    traits: [{ _id: "t1", name: "Estilo de Luta", description: "Duelismo.", catalogTraitId: null }],
    feats: [],
    spells: [{ _id: "s1", name: "Escudo", circle: 1, prepared: true, castingTime: "Reação", concentration: false, catalogSpellId: null }],
    items: [{ _id: "i1", name: "Espada longa", quantity: 1, equipped: true, catalogItemId: "cat1", catalogItemType: "arma" }],
    ...over,
})
const fp = (s = sheet(), l = lists(), context = CONTEXT) => prepFingerprint(snapshotOf(s, l), context)

describe("DND-78 — impressão digital da ficha", () => {
    it("ignora o que muda no jogo: PV, cargas e espaços usados, moedas, quantidade, bônus de CA temporários e updatedAt", () => {
        const changed = fp(
            sheet({ hpCurrent: 3, hpTemp: 5, coins: { gp: 99 }, updatedAt: new Date(), spellSlots: { "1": { total: 2, used: 2 } }, resourceCharges: [{ id: "c1", name: "Retomar o Fôlego", total: 1, used: 1 }], armorClassBonuses: [{ name: "Escudo da Fé", value: 2 }] }),
            lists({ items: [{ _id: "i1", name: "Espada longa", quantity: 3, equipped: true, catalogItemId: "cat1", catalogItemType: "arma" }] }),
        )
        expect(diffPrepFingerprint(fp(), changed)).toEqual({ kind: "hit" })
    })

    it("base da ficha (nível, atributo, classe, conjuração, total de espaços) prepara a ficha inteira", () => {
        for (const over of [{ level: 4 }, { strength: 18 }, { class: "Paladino" }, { spellcastingAttribute: "wisdom" }, { spellSlots: { "1": { total: 3, used: 0 } } }, { skills: { atletismo: { proficient: true, expertise: true } } }]) {
            expect(diffPrepFingerprint(fp(), fp(sheet(over)))).toEqual({ kind: "full", reason: PREP_FULL_REASONS.core })
        }
    })

    it("instruções, grau ou versão do cache diferentes preparam a ficha inteira; sem cache também", () => {
        expect(diffPrepFingerprint(fp(), fp(sheet(), lists(), { ...CONTEXT, instructions: "Outra." }))).toEqual({ kind: "full", reason: PREP_FULL_REASONS.context })
        expect(diffPrepFingerprint(fp(), fp(sheet(), lists(), { ...CONTEXT, version: 2 }))).toEqual({ kind: "full", reason: PREP_FULL_REASONS.context })
        expect(diffPrepFingerprint(null, fp())).toEqual({ kind: "full", reason: null })
    })

    it("ataque, item, magia, característica e recurso mudam só a parte deles (novo, alterado e removido)", () => {
        const before = fp()
        const after = fp(
            sheet({ resourceCharges: [{ id: "c1", name: "Retomar o Fôlego", total: 2, used: 0 }] }),
            lists({
                items: [{ _id: "i1", name: "Espada longa", quantity: 1, equipped: false, catalogItemId: "cat1", catalogItemType: "arma" }, { _id: "i2", name: "Arco", quantity: 1, equipped: true, catalogItemId: "cat2", catalogItemType: "arma" }],
                spells: [],
            }),
        )
        const decision = diffPrepFingerprint(before, after)
        expect(decision).toEqual({ kind: "partial", changed: ["item:i1", "charge:c1"], added: ["item:i2"], removed: ["spell:s1"] })
        expect(changedPartLabels(decision as Extract<typeof decision, { kind: "partial" }>, before, after)).toEqual(["Item: Arco (novo)", "Item: Espada longa (alterado)", "Recurso: Retomar o Fôlego (alterado)", "Magia: Escudo (removido)"])
    })
})

describe("DND-78 — dependências das opções e poda do overlay", () => {
    it("liga cada opção à parte da ficha pelo id", () => {
        expect(optionDeps("weapon:i1")).toEqual(["item:i1"])
        expect(optionDeps("weapon:i1:thrown")).toEqual(["item:i1"])
        expect(optionDeps("offhand:i1")).toEqual(["item:i1"])
        expect(optionDeps("cleave:i1")).toEqual(["item:i1"])
        expect(optionDeps("item:i3:use")).toEqual(["item:i3"])
        expect(optionDeps("spell:s1")).toEqual(["spell:s1"])
        expect(optionDeps("ability:trait:t1")).toEqual(["trait:t1"])
        expect(optionDeps("ability:feat:f1")).toEqual(["feat:f1"])
        expect(optionDeps("prep:astucia")).toEqual(["core"])
        expect(optionDeps("unarmed")).toEqual(["core"])
        expect(addedOptionDeps({ requires: { chargeId: "c1", itemId: "i3" } })).toEqual(["charge:c1", "item:i3"])
        expect(addedOptionDeps({ requires: null })).toEqual(["core"])
    })

    it("tira só os ajustes das partes que mudaram e marca os mantidos como vindos do cache", () => {
        const overlay: CombatPrepOverlay = {
            modify: [
                { optionId: "weapon:i1", patch: { detail: "x" }, reason: "Duelismo.", preparedAt: "2026-11-01T00:00:00.000Z" },
                { optionId: "spell:s1", patch: { detail: "y" }, reason: "CD." },
            ],
            remove: [{ optionId: "item:i3:use", reason: "Não serve." }],
            add: [
                { option: { id: "prep:folego", category: "abilities", economy: "bonus", label: "Fôlego", detail: "", target: "self", multiTarget: false, resolution: "utility", requires: { chargeId: "c1" } }, reason: "Guerreiro." },
                { option: { id: "prep:livre", category: "other", economy: "bonus", label: "Livre", detail: "", target: "self", multiTarget: false, resolution: "utility" }, reason: "x", deps: ["spell:s1"] },
            ],
            suppress: ["ability:trait:t9"],
        }
        const kept = pruneOverlay(overlay, new Set(["spell:s1", "charge:c1"]))
        expect(kept.modify.map((entry) => [entry.optionId, entry.fromCache, entry.preparedAt])).toEqual([["weapon:i1", true, "2026-11-01T00:00:00.000Z"]])
        expect(kept.remove.map((entry) => entry.optionId)).toEqual(["item:i3:use"])
        expect(kept.add).toEqual([])
        expect(kept.suppress).toEqual(["ability:trait:t9"])
        expect(overlaySize(kept)).toBe(2)
        expect(overlaySize(pruneOverlay(overlay, new Set()))).toBe(5)
    })

    it("a opção ajustada na lista do turno diz se veio do cache ou foi preparada agora", () => {
        const base = buildCombatOptions({ sheet: { level: 3, abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 }, proficiencyBonus: 2, spellAttribute: null, spellSaveDc: 10, spellAttackBonus: 2, spellSlots: {} }, weapons: [{ id: "i1", name: "Espada", quantity: 1, damageDice: { quantidade: 1, tipo: "d8" }, damageType: "cortante", properties: [] }], spells: [], items: [], abilities: [], economy: freshEconomy(), conditions: [], dying: false })
        const live = (overlay: CombatPrepOverlay) => applyCombatPrep(base, { overlay, riders: [], economy: freshEconomy(), sheet: { level: 3, abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 }, proficiencyBonus: 2, spellAttribute: null, spellSaveDc: 10, spellAttackBonus: 2, spellSlots: {} }, charges: new Map(), items: new Map(), blocked: false })
        const cached = live({ ...emptyOverlay(), modify: [{ optionId: "weapon:i1", patch: { detail: "z" }, reason: "Duelismo.", preparedAt: "2026-11-01T00:00:00.000Z", fromCache: true }] })
        expect(cached.action.find((option) => option.id === "weapon:i1")!.adjusted).toEqual({ reason: "Duelismo.", origin: "cache", preparedAt: "2026-11-01T00:00:00.000Z" })
        const now = live({ ...emptyOverlay(), modify: [{ optionId: "weapon:i1", patch: { detail: "z" }, reason: "Duelismo." }] })
        expect(now.action.find((option) => option.id === "weapon:i1")!.adjusted).toEqual({ reason: "Duelismo.", origin: "now" })
    })
})

describe("DND-78 — preparação parcial: só o que mudou passa na conferência", () => {
    const options = buildCombatOptions({ sheet: { level: 3, abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 }, proficiencyBonus: 2, spellAttribute: null, spellSaveDc: 10, spellAttackBonus: 2, spellSlots: {} }, weapons: [{ id: "i1", name: "Espada", quantity: 1, damageDice: { quantidade: 1, tipo: "d8" }, damageType: "cortante", properties: [] }, { id: "i2", name: "Arco", quantity: 1, damageDice: { quantidade: 1, tipo: "d6" }, damageType: "perfurante", properties: ["Munição"] }], spells: [], items: [], abilities: [], economy: freshEconomy(), conditions: [], dying: false, ignoreResources: true })
    const context = { options, chargeIds: new Set(["c1"]), itemIds: new Set(["i1", "i2"]) }

    it("recusa alteração de opção, correção da ficha e acréscimo de partes que não mudaram; aceita os da parte que mudou e as criações", () => {
        const result = interpretPrep(
            {
                sheetChanges: [
                    { type: "item-equip", itemId: "i1", equipped: false, reason: "Fora do escopo." },
                    { type: "item-equip", itemId: "i2", equipped: true, reason: "O arco é novo." },
                    { type: "save-proficiency", attribute: "dexterity", proficient: true, reason: "Base da ficha." },
                ],
                modify: [
                    { optionId: "weapon:i1", detail: "não", reason: "A espada não mudou." },
                    { optionId: "weapon:i2", detail: "sim", reason: "O arco é novo." },
                ],
                remove: [{ optionId: "weapon:i1:thrown", reason: "x" }],
                add: [
                    { id: "a", category: "abilities", economy: "bonus", label: "Fôlego", resolution: "utility", target: "self", chargeId: "c1", reason: "Recurso que não mudou." },
                    { id: "b", category: "other", economy: "bonus", label: "Tiro rápido", resolution: "utility", target: "self", reason: "Liga às partes que mudaram." },
                ],
            },
            context,
            undefined,
            new Set(["item:i2"]),
        )
        expect(result.sheetChanges.map((change) => change.type === "item-equip" && change.itemId)).toEqual(["i2"])
        expect(result.overlay.modify.map((entry) => entry.optionId)).toEqual(["weapon:i2"])
        expect(result.overlay.add.map((entry) => [entry.option.id, entry.deps])).toEqual([["prep:b", ["item:i2"]]])
        expect(result.refusals.filter((change) => change.refused === `Recusada: ${OUT_OF_SCOPE_REFUSAL}.`)).toHaveLength(4)
    })

    it("sem escopo (ficha inteira), nada é recusado por estar fora do que mudou", () => {
        const result = interpretPrep({ sheetChanges: [{ type: "item-equip", itemId: "i1", equipped: false, reason: "x" }], modify: [{ optionId: "weapon:i1", detail: "ok", reason: "x" }] }, context)
        expect(result.sheetChanges).toHaveLength(1)
        expect(result.overlay.modify).toHaveLength(1)
        expect(result.overlay.add.every((entry) => entry.deps === undefined)).toBe(true)
    })

    it("a parte de cada correção da ficha", () => {
        expect(sheetChangePart({ type: "attack-upsert", attackId: "a1", name: "x" } as never)).toBe("attack:a1")
        expect(sheetChangePart({ type: "attack-upsert", name: "x" } as never)).toBe("new")
        expect(sheetChangePart({ type: "spell-add", catalogSpellId: "x" } as never)).toBe("new")
        expect(sheetChangePart({ type: "trait-remove", id: "t1" } as never)).toBe("trait:t1")
        expect(sheetChangePart({ type: "ability", attribute: "strength", value: 10 } as never)).toBe("core")
    })
})
