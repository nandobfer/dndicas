export type SheetSpellSlots = Record<string, { total: number; used: number }>

export function getAvailableSpellSlotLevels(spellSlots: SheetSpellSlots): string[] {
    return Object.entries(spellSlots)
        .filter(([, slot]) => slot.total > 0)
        .map(([level]) => level)
        .sort((a, b) => Number(a) - Number(b))
}
