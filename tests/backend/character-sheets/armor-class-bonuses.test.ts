import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import mongoose, { Types } from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import { computeSheetArmorClass, computeSheetArmorClassCalc } from "@/features/character-sheets/utils/armor-class"
import { armorClassBonusListSchema, expiredArmorClassBonuses, upsertArmorClassBonus, type ArmorClassBonus } from "@/features/character-sheets/utils/armor-class-bonuses"

/** DND-66: bônus de CA nomeados (conta da CA, regras de duração) e a migração do bônus único antigo. */

const sheet = { strength: 10, dexterity: 19, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10, armorClassOverride: null, unarmoredDefense: { enabled: false, base: 10, attributes: [] } }
const leather = [{ name: "<p>Armadura de couro</p>", equipped: true, catalogItemType: "armadura", catalogAcType: "base" as const, catalogAc: 11, catalogArmorType: "leve" as const }]
const bonus = (name: string, value: number, duration: ArmorClassBonus["duration"] = { kind: "permanent" }): ArmorClassBonus => ({ id: name, name, value, origin: "spell", duration, addedBy: "maddox" })

describe("DND-66 — CA com bônus nomeados", () => {
    it("soma dois bônus nomeados e mostra cada um pelo nome no tooltip", () => {
        const bonuses = [bonus("Escudo da Fé", 2), bonus("Cobertura parcial", 2)]
        expect(computeSheetArmorClass({ ...sheet, armorClassBonuses: [] }, leather)).toBe(15)
        expect(computeSheetArmorClass({ ...sheet, armorClassBonuses: bonuses }, leather)).toBe(19)
        const calc = computeSheetArmorClassCalc({ ...sheet, armorClassBonuses: bonuses }, leather)
        expect(calc.parts?.map((part) => `${part.label} ${part.value}`)).toEqual(["Armadura de couro 11", "Destreza +4", "Escudo da Fé +2", "Cobertura parcial +2"])
        expect(calc.formula).toBe("Armadura de couro(11) + DEX(4) + Escudo da Fé(2) + Cobertura parcial(2) = 19")
        expect(computeSheetArmorClass({ ...sheet, armorClassBonuses: [bonuses[0]!] }, leather)).toBe(17)
    })

    it("entrada inválida na lista não derruba a conta; a lista do PATCH recusa nomes repetidos", () => {
        expect(computeSheetArmorClass({ ...sheet, armorClassBonuses: [{ name: "lixo" } as unknown as ArmorClassBonus, bonus("Escudo da Fé", 2)] }, leather)).toBe(17)
        expect(armorClassBonusListSchema.safeParse([bonus("Escudo da Fé", 2), bonus("escudo da fé", 1)]).success).toBe(false)
        expect(armorClassBonusListSchema.safeParse([bonus("Escudo da Fé", 2), bonus("Anel", 1)]).success).toBe(true)
        expect(armorClassBonusListSchema.safeParse([bonus("Zero", 0)]).success).toBe(false)
    })

    it("mesmo nome substitui; vencimento por rodadas, concentração, fim do combate e descanso", () => {
        const { list, replaced } = upsertArmorClassBonus([bonus("Escudo da Fé", 2)], bonus("ESCUDO DA FE", 3))
        expect(replaced?.value).toBe(2)
        expect(list.map((item) => item.value)).toEqual([3])

        const combatId = String(new Types.ObjectId())
        const bonuses = [
            bonus("Rodadas", 1, { kind: "rounds", rounds: 2, combatId, untilRound: 3 }),
            bonus("Concentração", 2, { kind: "concentration", combatId, casterKey: "pc:ravel", casterName: "Ravel", spell: "Escudo da Fé" }),
            bonus("Combate", 1, { kind: "combat", combatId }),
            bonus("Curto", 1, { kind: "short-rest" }),
            bonus("Longo", 1, { kind: "long-rest" }),
            bonus("Momento", 1, { kind: "moment", moment: "o fim da cena" }),
            bonus("Sempre", 1),
        ]
        const names = (context: Parameters<typeof expiredArmorClassBonuses>[1]) => expiredArmorClassBonuses(bonuses, context).map((item) => `${item.bonus.name}:${item.reason}`)
        const concentrating = new Map([["pc:ravel", "Escudo da Fé"]])
        expect(names({ combatId, round: 2, concentrationByKey: concentrating })).toEqual([])
        expect(names({ combatId, round: 3, concentrationByKey: concentrating })).toEqual(["Rodadas:rounds"])
        expect(names({ combatId, round: 2, concentrationByKey: new Map([["pc:ravel", "Bênção"]]) })).toEqual(["Concentração:concentration"])
        expect(names({ combatId: null, round: 0, concentrationByKey: new Map(), endedCombatId: combatId })).toEqual(["Rodadas:combat-ended", "Concentração:combat-ended", "Combate:combat-ended"])
        expect(names({ combatId: String(new Types.ObjectId()), round: 0, concentrationByKey: new Map(), staleOnly: true })).toEqual(["Rodadas:stale-combat", "Concentração:stale-combat", "Combate:stale-combat"])
        expect(names({ combatId: null, round: 0, concentrationByKey: new Map(), rest: "short" })).toEqual(["Curto:rest"])
        expect(names({ combatId: null, round: 0, concentrationByKey: new Map(), rest: "long" })).toEqual(["Curto:rest", "Longo:rest"])
    })
})

describe("DND-66 — migração sheet-armor-class-bonuses", () => {
    let mongo: MongoMemoryServer
    beforeAll(async () => {
        mongo = await MongoMemoryServer.create()
        await mongoose.connect(mongo.getUri())
    })
    afterAll(async () => {
        await mongoose.disconnect()
        await mongo.stop()
    })
    beforeEach(async () => {
        await mongoose.connection.db!.dropDatabase()
    })

    it("converte o bônus único em \"Bônus manual\", tira o campo antigo e é idempotente", async () => {
        const { CharacterSheet } = await import("@/features/character-sheets/models/character-sheet")
        const { sheetArmorClassBonuses } = await import("@/lib/db/migrations/sheet-armor-class-bonuses")
        const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()]
        await CharacterSheet.collection.insertMany([
            { _id: ids[0], slug: "a", userId: "u", name: "A", armorClassBonus: 2 },
            { _id: ids[1], slug: "b", userId: "u", name: "B", armorClassBonus: null },
            { _id: ids[2], slug: "c", userId: "u", name: "C", armorClassBonuses: [] },
        ])
        await sheetArmorClassBonuses()
        await sheetArmorClassBonuses()
        const rows = await CharacterSheet.collection.find({ _id: { $in: ids } }).sort({ slug: 1 }).toArray()
        expect(rows.map((row) => "armorClassBonus" in row)).toEqual([false, false, false])
        expect(rows[0]!.armorClassBonuses).toEqual([expect.objectContaining({ name: "Bônus manual", value: 2, origin: "other", duration: { kind: "permanent" } })])
        expect(rows[1]!.armorClassBonuses).toEqual([])
        expect(rows[2]!.armorClassBonuses).toEqual([])
    })
})
