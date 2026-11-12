import { z } from "zod"

/**
 * Lista fechada do ajuste da ficha pelo Maddox no reinício da campanha (DND-50). O Maddox compara a ficha atual com a
 * ficha que a entrevista gerou (a referência, calculada pelo servidor) e só escolhe O QUE volta: os valores vêm sempre da
 * referência, nunca do modelo.
 *
 * - `field`: o campo da ficha volta ao valor da referência;
 * - `remove`: um registro da ficha atual (item, ataque, traço, talento ou magia) sai;
 * - `restore`: um registro da referência (pelo `ref` dela) volta à ficha.
 */
export const SHEET_RESTORE_FIELDS = [
    "level",
    "experience",
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
    "savingThrows",
    "skills",
    "hpMax",
    "hpCurrent",
    "hpTemp",
    "hitDiceTotal",
    "hitDiceUsed",
    "deathSavesSuccess",
    "deathSavesFailure",
    "exhaustion",
    "inspiration",
    "spellcastingAttribute",
    "spellSlots",
    "resourceCharges",
    "coins",
    "weaponMasteries",
    "classFeatures",
    "speciesTraits",
    "featuresNotes",
    "weaponProficiencies",
    "toolProficiencies",
    "notes",
] as const
export type SheetRestoreField = (typeof SHEET_RESTORE_FIELDS)[number]

export const SHEET_RESTORE_COLLECTIONS = ["items", "attacks", "traits", "feats", "spells"] as const
export type SheetRestoreCollection = (typeof SHEET_RESTORE_COLLECTIONS)[number]

const reason = z.string().trim().max(500).catch("")

export const sheetRestoreChangeSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("field"), field: z.enum(SHEET_RESTORE_FIELDS), reason }),
    z.object({ type: z.literal("remove"), collection: z.enum(SHEET_RESTORE_COLLECTIONS), id: z.string().trim().min(1).max(40), reason }),
    z.object({ type: z.literal("restore"), collection: z.enum(SHEET_RESTORE_COLLECTIONS), ref: z.string().trim().min(1).max(40), reason }),
])
export type SheetRestoreChange = z.infer<typeof sheetRestoreChangeSchema>

/** Até 300 alterações; cada uma é validada sozinha (uma inválida não derruba as outras). */
export const sheetRestoreResponseSchema = z.object({ changes: z.array(z.unknown()).max(300).catch([]) })

/** Alterações válidas da resposta (as inválidas são descartadas e contadas). */
export function parseSheetRestoreChanges(value: unknown): { changes: SheetRestoreChange[]; invalid: number } {
    const parsed = sheetRestoreResponseSchema.safeParse(value)
    if (!parsed.success) throw new Error("resposta do Maddox fora do formato do ajuste da ficha")
    const changes: SheetRestoreChange[] = []
    let invalid = 0
    for (const item of parsed.data.changes) {
        const change = sheetRestoreChangeSchema.safeParse(item)
        if (change.success) changes.push(change.data)
        else invalid++
    }
    return { changes, invalid }
}
