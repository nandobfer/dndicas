/**
 * @fileoverview Tests for progression-utils pure functions.
 * Tests proficiency bonus calculation, spell templates, and row builder.
 */

import {
    getProficiencyBonus,
    applySpellTemplate,
    hasSpellSlotData,
    buildProgressionRows,
    createEmptyCustomColumn,
    SPELL_TEMPLATE_LABELS,
    SPELL_TEMPLATES,
} from "@/features/classes/utils/progression-utils"
import type { ClassTrait } from "@/features/classes/types/classes.types"
import type { ClassProgressionData } from "@/features/classes/types/progression.types"

// ─── getProficiencyBonus ──────────────────────────────────────────────────────

describe("getProficiencyBonus", () => {
    it.each([
        [1, 2], [2, 2], [3, 2], [4, 2],
        [5, 3], [6, 3], [7, 3], [8, 3],
        [9, 4], [10, 4], [11, 4], [12, 4],
        [13, 5], [14, 5], [15, 5], [16, 5],
        [17, 6], [18, 6], [19, 6], [20, 6],
    ] as [number, number][])("level %i returns +%i", (level, expected) => {
        expect(getProficiencyBonus(level)).toBe(expected)
    })

    it("returns 2 for invalid levels as fallback", () => {
        expect(getProficiencyBonus(0)).toBe(2)
        expect(getProficiencyBonus(21)).toBe(2)
        expect(getProficiencyBonus(-1)).toBe(2)
    })
})

// ─── applySpellTemplate ───────────────────────────────────────────────────────

describe("applySpellTemplate", () => {
    describe("full caster", () => {
        const table = applySpellTemplate("full")

        it("level 1 has 2 first-circle slots and 3 cantrips", () => {
            expect(table[1]?.cantrips).toBe(3)
            expect(table[1]?.slots?.[1]).toBe(2)
            expect(table[1]?.slots?.[2]).toBeUndefined()
        })

        it("level 3 has both 1st and 2nd circle slots", () => {
            expect(table[3]?.slots?.[1]).toBe(4)
            expect(table[3]?.slots?.[2]).toBe(2)
            expect(table[3]?.slots?.[3]).toBeUndefined()
        })

        it("level 20 has slots up to 9th circle", () => {
            expect(table[20]?.slots?.[9]).toBe(1)
            expect(table[20]?.slots?.[7]).toBe(2)
            expect(table[20]?.cantrips).toBe(5)
        })

        it("returns a deep copy (mutations do not affect original)", () => {
            const t1 = applySpellTemplate("full")
            const t2 = applySpellTemplate("full")
            t1[1]!.cantrips = 99
            expect(t2[1]?.cantrips).toBe(3)
        })
    })

    describe("half caster", () => {
        const table = applySpellTemplate("half")

        it("level 1 has no spell slots", () => {
            expect(table[1]).toBeUndefined()
        })

        it("level 2 starts with 2 first-circle slots", () => {
            expect(table[2]?.slots?.[1]).toBe(2)
            expect(table[2]?.cantrips).toBeUndefined()
        })

        it("level 20 only has slots up to 5th circle", () => {
            expect(table[20]?.slots?.[5]).toBe(3)
            expect(table[20]?.slots?.[6]).toBeUndefined()
        })
    })

    describe("third caster", () => {
        const table = applySpellTemplate("third")

        it("levels 1-2 have no spell slots", () => {
            expect(table[1]).toBeUndefined()
            expect(table[2]).toBeUndefined()
        })

        it("level 3 starts with 2 first-circle slots", () => {
            expect(table[3]?.slots?.[1]).toBe(2)
        })

        it("level 20 only reaches 4th circle", () => {
            expect(table[20]?.slots?.[4]).toBe(1)
            expect(table[20]?.slots?.[5]).toBeUndefined()
        })
    })

    describe("warlock", () => {
        const table = applySpellTemplate("warlock")

        it("level 1 has 1 first-circle slot", () => {
            expect(table[1]?.slots?.[1]).toBe(1)
        })

        it("level 5 uses 3rd circle pact slots (not 1st)", () => {
            expect(table[5]?.slots?.[3]).toBe(2)
            expect(table[5]?.slots?.[1]).toBeUndefined()
        })

        it("level 20 has 4 fifth-circle slots", () => {
            expect(table[20]?.slots?.[5]).toBe(4)
        })
    })

    it("all templates cover all template type labels", () => {
        const labelKeys = Object.keys(SPELL_TEMPLATE_LABELS)
        const templateKeys = Object.keys(SPELL_TEMPLATES)
        expect(labelKeys.sort()).toEqual(templateKeys.sort())
    })
})

// ─── hasSpellSlotData ─────────────────────────────────────────────────────────

describe("hasSpellSlotData", () => {
    it("returns false when progressionData is undefined", () => {
        expect(hasSpellSlotData(undefined)).toBe(false)
    })

    it("returns false when spellSlots is undefined", () => {
        expect(hasSpellSlotData({ customColumns: [] })).toBe(false)
    })

    it("returns false when spellSlots is empty object", () => {
        expect(hasSpellSlotData({ spellSlots: {} })).toBe(false)
    })

    it("returns true when spellSlots has at least one entry", () => {
        expect(hasSpellSlotData({ spellSlots: { 1: { cantrips: 3 } } })).toBe(true)
    })
})

// ─── buildProgressionRows ─────────────────────────────────────────────────────

describe("buildProgressionRows", () => {
    const makeTraits = (levels: number[]): ClassTrait[] =>
        levels.map((level, i) => ({
            _id: `trait-${i}`,
            level,
            description: `<p>Habilidade nível ${level}</p>`,
        }))

    it("always returns exactly 20 class rows even with no traits", () => {
        const { rows } = buildProgressionRows([])
        const classRows = rows.filter((r) => r.source === "class")
        expect(classRows).toHaveLength(20)
    })

    it("each level 1-20 has a class row", () => {
        const { rows } = buildProgressionRows([])
        const classLevels = rows.filter((r) => r.source === "class").map((r) => r.level)
        for (let l = 1; l <= 20; l++) {
            expect(classLevels).toContain(l)
        }
    })

    it("traits are assigned to the correct level rows", () => {
        const traits = makeTraits([1, 3, 5, 10])
        const { rows } = buildProgressionRows(traits)
        const level1 = rows.find((r) => r.level === 1 && r.source === "class")!
        const level3 = rows.find((r) => r.level === 3 && r.source === "class")!
        const level7 = rows.find((r) => r.level === 7 && r.source === "class")!
        expect(level1.traits).toHaveLength(1)
        expect(level3.traits).toHaveLength(1)
        expect(level7.traits).toHaveLength(0)
    })

    it("multiple traits at the same level are grouped into one row", () => {
        const traits = makeTraits([3, 3, 3])
        const { rows } = buildProgressionRows(traits)
        const level3Rows = rows.filter((r) => r.level === 3 && r.source === "class")
        expect(level3Rows).toHaveLength(1)
        expect(level3Rows[0].traits).toHaveLength(3)
    })

    it("proficiency bonus is correct for each level", () => {
        const { rows } = buildProgressionRows([])
        const classRows = rows.filter((r) => r.source === "class")
        classRows.forEach((row) => {
            expect(row.proficiencyBonus).toBe(getProficiencyBonus(row.level))
        })
    })

    it("rows are sorted by level ascending, class before subclass at same level", () => {
        const traits = makeTraits([3])
        const subclassRows = [
            { traits: makeTraits([3]), progressionData: undefined, color: "#ff0000", name: "TestSub" },
        ]
        const { rows } = buildProgressionRows(traits, undefined, subclassRows)
        const level3 = rows.filter((r) => r.level === 3)
        expect(level3[0].source).toBe("class")
        expect(level3[1].source).toBe("subclass")
    })

    it("subclass rows only appear at levels where the subclass has traits", () => {
        const { rows } = buildProgressionRows([], undefined, [
            { traits: makeTraits([5, 7]), progressionData: undefined, color: "#00ff00", name: "MySub" },
        ])
        const subclassRows = rows.filter((r) => r.source === "subclass")
        expect(subclassRows).toHaveLength(2)
        expect(subclassRows.map((r) => r.level).sort()).toEqual([5, 7])
    })

    it("subclass rows carry correct color and name", () => {
        const { rows } = buildProgressionRows([], undefined, [
            { traits: makeTraits([2]), progressionData: undefined, color: "#aabbcc", name: "Berserker" },
        ])
        const subRow = rows.find((r) => r.source === "subclass")!
        expect(subRow.subclassColor).toBe("#aabbcc")
        expect(subRow.subclassName).toBe("Berserker")
    })

    it("activeSpellCircles collects circles from spellSlots", () => {
        const progression: ClassProgressionData = {
            spellSlots: {
                1: { slots: { 1: 2 } },
                3: { slots: { 1: 4, 2: 2 } },
            },
        }
        const { activeSpellCircles } = buildProgressionRows([], progression)
        expect(activeSpellCircles.has(1)).toBe(true)
        expect(activeSpellCircles.has(2)).toBe(true)
        expect(activeSpellCircles.has(3)).toBe(false)
    })

    it("allCustomColumns includes class and subclass columns without duplicates", () => {
        const progression: ClassProgressionData = {
            customColumns: [{ id: "col-1", label: "Ataque Furtivo", values: Array(20).fill(null) }],
        }
        const subclassProgression: ClassProgressionData = {
            customColumns: [{ id: "col-2", label: "Escudo Arcano", values: Array(20).fill(null) }],
        }
        const { allCustomColumns } = buildProgressionRows([], progression, [
            { traits: [], progressionData: subclassProgression, color: "#0000ff", name: "Sub" },
        ])
        expect(allCustomColumns).toHaveLength(2)
        expect(allCustomColumns[0].id).toBe("col-1")
        expect(allCustomColumns[1].id).toBe("col-2")
        expect(allCustomColumns[1].subclassColor).toBe("#0000ff")
    })

    it("handles undefined subclassRows gracefully", () => {
        expect(() => buildProgressionRows([], undefined, undefined)).not.toThrow()
    })
})

// ─── createEmptyCustomColumn ──────────────────────────────────────────────────

describe("createEmptyCustomColumn", () => {
    it("creates a column with 20 null values", () => {
        const col = createEmptyCustomColumn("test-id", "Test Label")
        expect(col.id).toBe("test-id")
        expect(col.label).toBe("Test Label")
        expect(col.values).toHaveLength(20)
        expect(col.values.every((v) => v === null)).toBe(true)
    })
})
