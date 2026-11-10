import { describe, expect, it } from "vitest"
import { buildCombatOptions, type CombatOptionsInput } from "@/features/maddox/combat-options"
import { applyCombatPrep, detectSneakAttack, onlyFreeBonus, sneakEligible } from "@/features/maddox/combat-prep"
import { combatSheetChangeSchema, parseList } from "@/features/maddox/combat-prep-schemas"
import { freshEconomy } from "@/features/maddox/combat-rules"
import { emptyOverlay, type CombatPrepOverlay } from "@/features/maddox/combat-types"
import { interpretPrep, mergeOverlay } from "@/features/maddox/server/combat-prep"

/** DND-41: a parte pura da preparação da mesa de combate — lista do turno, ataque furtivo e validação da resposta da IA. */

const sheet = { level: 3, abilities: { strength: 8, dexterity: 17, constitution: 14, intelligence: 8, wisdom: 16, charisma: 10 }, proficiencyBonus: 2, spellAttribute: null, spellSaveDc: 10, spellAttackBonus: 2, spellSlots: { "1": { total: 2, used: 2 } } }
const input = (patch: Partial<CombatOptionsInput> = {}): CombatOptionsInput => ({
    sheet,
    weapons: [
        { id: "adaga", name: "Adaga", quantity: 1, damageDice: { quantidade: 1, tipo: "d4" }, damageType: "perfurante", properties: ["Acuidade / Finesse", "Leve", "Arremesso"] },
        { id: "maca", name: "Maça", quantity: 1, damageDice: { quantidade: 1, tipo: "d6" }, damageType: "contundente", properties: [] },
        { id: "arco", name: "Arco Curto", quantity: 1, damageDice: { quantidade: 1, tipo: "d6" }, damageType: "perfurante", properties: ["Munição"] },
    ],
    spells: [],
    items: [{ id: "pocao", name: "Bomba", quantity: 1, consumable: true, effectDice: null, description: "" }],
    abilities: [],
    economy: freshEconomy(),
    conditions: [],
    dying: false,
    ...patch,
})
const live = (overlay: CombatPrepOverlay | null, patch: Partial<Parameters<typeof applyCombatPrep>[1]> = {}): Parameters<typeof applyCombatPrep>[1] => ({
    overlay,
    riders: [],
    economy: freshEconomy(),
    sheet,
    charges: new Map([["c1", { total: 2, used: 0 }]]),
    items: new Map([["pocao", 1]]),
    blocked: false,
    ...patch,
})

describe("DND-41 — lista do turno com a preparação por cima", () => {
    it("altera (com o motivo), remove e acrescenta antes das ações comuns; 'Outra ação' segue no fim", () => {
        const base = buildCombatOptions(input())
        const overlay: CombatPrepOverlay = {
            modify: [{ optionId: "weapon:maca", patch: { attack: { bonus: 1, damage: "1d6-1", damageType: "contundente", ranged: false, light: false } }, reason: "Força 8." }],
            remove: [{ optionId: "item:pocao:use", reason: "Não é usável em combate." }],
            add: [{ option: { id: "prep:astucia", category: "abilities", economy: "bonus", label: "Ação Ardilosa", detail: "Disparada, Desengajar ou Esconder", target: "self", multiTarget: false, resolution: "utility" }, reason: "Ladino de nível 2." }],
            suppress: [],
        }
        const result = applyCombatPrep(base, live(overlay))
        const maca = result.action.find((option) => option.id === "weapon:maca")!
        expect([maca.attack!.bonus, maca.adjusted?.reason]).toEqual([1, "Força 8."])
        expect(result.action.some((option) => option.id === "item:pocao:use")).toBe(false)
        expect(result.bonus.map((option) => option.id)).toEqual(["prep:astucia", "free"])
        expect(result.action.at(-1)!.id).toBe("free")
    })

    it("a disponibilidade continua do servidor: Ação bônus gasta, carga esgotada e espaço de magia esgotado tiram o acréscimo", () => {
        const overlay = emptyOverlay()
        overlay.add.push(
            { option: { id: "prep:a", category: "abilities", economy: "bonus", label: "Com carga", detail: "", target: "self", multiTarget: false, resolution: "utility", requires: { chargeId: "c1" } }, reason: "x" },
            { option: { id: "prep:b", category: "spells", economy: "action", label: "Magia", detail: "", target: "enemy", multiTarget: false, resolution: "utility", requires: { spellCircle: 1 } }, reason: "x" },
        )
        const base = buildCombatOptions(input())
        expect(applyCombatPrep(base, live(overlay)).bonus.find((option) => option.id === "prep:a")!.charges).toEqual({ chargeId: "c1", used: 0, total: 2 })
        expect(applyCombatPrep(base, live(overlay)).action.some((option) => option.id === "prep:b")).toBe(false)
        expect(applyCombatPrep(base, live(overlay, { charges: new Map([["c1", { total: 2, used: 2 }]]) })).bonus.some((option) => option.id === "prep:a")).toBe(false)
        expect(applyCombatPrep(base, live(overlay, { economy: { ...freshEconomy(), bonus: false } })).bonus.some((option) => option.id === "prep:a")).toBe(false)
        expect(applyCombatPrep(base, live(overlay, { blocked: true }))).toBe(base)
    })

    it("o id suprimido (criado na ficha e já acrescentado) não aparece duas vezes", () => {
        const base = buildCombatOptions(input())
        const overlay = { ...emptyOverlay(), suppress: ["weapon:arco"] }
        expect(applyCombatPrep(base, live(overlay)).action.some((option) => option.id === "weapon:arco")).toBe(false)
    })

    it("ataque furtivo: só em arma de Acuidade ou à distância (a arremessada só com Acuidade)", () => {
        const base = buildCombatOptions(input())
        const result = applyCombatPrep(base, live(emptyOverlay(), { riders: [{ key: "sneak-attack", dice: "2d6", source: "server", reason: null }] }))
        const marked = result.action.filter((option) => option.attack?.riders?.length).map((option) => option.id)
        expect(marked).toEqual(["weapon:adaga", "weapon:adaga:thrown", "weapon:arco"])
        expect(result.action.find((option) => option.id === "weapon:adaga")!.attack!.riders).toEqual([{ key: "sneak-attack", label: "Ataque furtivo (+2d6)", dice: "2d6" }])
        expect(sneakEligible({ ...base.action.find((option) => option.id === "weapon:maca")!, id: "weapon:maca:thrown", attack: { ...base.action.find((option) => option.id === "weapon:maca")!.attack!, ranged: true } })).toBe(false)
    })

    it("ataque furtivo pela classe ou pela característica, ⌈nível/2⌉d6", () => {
        expect(detectSneakAttack({ level: 1, classText: '<span data-label="Ladino">Ladino</span>', features: [] })).toBe("1d6")
        expect(detectSneakAttack({ level: 5, classText: "Guerreiro", features: ['<span class="mention">Ataque Furtivo</span>'] })).toBe("3d6")
        expect(detectSneakAttack({ level: 4, classText: "Rogue", features: [] })).toBe("2d6")
        expect(detectSneakAttack({ level: 5, classText: "Mago", features: ["Recuperação Arcana"] })).toBeNull()
    })

    it("o painel avisa quando só sobra 'Outra ação' na Ação bônus", () => {
        expect(onlyFreeBonus(buildCombatOptions(input()))).toBe(true)
        expect(onlyFreeBonus(buildCombatOptions(input({ economy: { ...freshEconomy(), action: false, attackAction: true, lightAttack: true, lightWeaponId: "outra" } })))).toBe(false)
    })
})

describe("DND-41 — validação da resposta da IA", () => {
    const context = () => ({ options: buildCombatOptions(input({ ignoreResources: true })), chargeIds: new Set(["c1"]), itemIds: new Set(["pocao"]) })

    it("descarta ids desconhecidos, valores fora da faixa e recursos que a ficha não tem", () => {
        const result = interpretPrep(
            {
                sheetChanges: [
                    { type: "ability", attribute: "dexterity", value: 17, reason: "ok" },
                    { type: "ability", attribute: "dexterity", value: 40, reason: "fora da faixa" },
                    { type: "attack-upsert", name: "Adaga", attackBonus: 50, damage: { quantity: 10, faces: 10 }, reason: "burla" },
                    { type: "apagar-tudo", reason: "não existe" },
                ],
                modify: [
                    { optionId: "weapon:adaga", attack: { bonus: 5, damage: "1d4+3", damageType: "perfurante" }, reason: "Acuidade." },
                    { optionId: "weapon:fantasma", attack: { bonus: 5, damage: "1d4+3" }, reason: "x" },
                    { optionId: "weapon:maca", attack: { bonus: 5, damage: "dez dados" }, reason: "x" },
                ],
                remove: [{ optionId: "free", reason: "x" }],
                add: [
                    { id: "Ação Ardilosa!", category: "abilities", economy: "bonus", label: "Ação Ardilosa", resolution: "utility", reason: "Ladino 2." },
                    { id: "sem-carga", category: "abilities", economy: "bonus", label: "X", resolution: "utility", chargeId: "nao-existe", reason: "x" },
                ],
                sneakAttack: { dice: "1d6", reason: "Ladino 1." },
            },
            context(),
        )
        expect(result.sheetChanges.map((change) => change.type)).toEqual(["ability"])
        expect(result.overlay.modify.map((item) => item.optionId)).toEqual(["weapon:adaga"])
        expect(result.overlay.modify[0]!.patch.attack!.finesse).toBe(true)
        expect(result.overlay.remove).toEqual([])
        expect(result.overlay.add.map((item) => item.option.id)).toEqual(["prep:acao-ardilosa"])
        expect(result.rider).toEqual({ dice: "1d6", reason: "Ladino 1." })
        expect(result.dropped).toBe(7)
        expect(result.optionChanges[0]).toMatchObject({ label: "Adaga", before: "+5 para acertar · 1d4+3 perfurante", after: "+5 para acertar · 1d4+3 perfurante" })
    })

    it("texto longo é cortado (não invalida a operação)", () => {
        const { valid } = parseList(combatSheetChangeSchema, [{ type: "ability", attribute: "wisdom", value: 12, reason: "x".repeat(2_000) }])
        expect(valid[0]!.reason.length).toBeLessThanOrEqual(400)
    })

    it("o pedido aceito mais novo vence pelo id da opção", () => {
        const first: CombatPrepOverlay = { ...emptyOverlay(), modify: [{ optionId: "weapon:adaga", patch: { label: "A" }, reason: "1" }], remove: [{ optionId: "weapon:maca", reason: "r" }] }
        const second: CombatPrepOverlay = { ...emptyOverlay(), modify: [{ optionId: "weapon:adaga", patch: { label: "B" }, reason: "2" }] }
        const merged = mergeOverlay(first, second)
        expect(merged.modify).toEqual([{ optionId: "weapon:adaga", patch: { label: "B" }, reason: "2" }])
        expect(merged.remove).toHaveLength(1)
    })
})
