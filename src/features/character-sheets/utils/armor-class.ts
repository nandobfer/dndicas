import type { CharacterItem, CharacterSheet } from "../types/character-sheet.types"
import { getArmorClass } from "./dnd-calculations"

/**
 * CA calculada da ficha a partir dos itens equipados (armadura base, escudos e bônus), a mesma conta da listagem de fichas.
 * Módulo puro: usado pelo serviço das fichas e pelo resumo da ficha no prompt do narrador do Maddox.
 */

export type ArmorClassSheet = Pick<CharacterSheet, "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"> &
    Partial<Pick<CharacterSheet, "armorClassOverride" | "armorClassBonus" | "unarmoredDefense">>

export type ArmorClassItem = Pick<CharacterItem, "name" | "equipped"> &
    Partial<Pick<CharacterItem, "catalogItemType" | "catalogAcType" | "catalogAc" | "catalogAcBonus" | "catalogArmorType">>

function stripHtml(html: string | null | undefined) {
    return String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function armorClassBonusValue(item: ArmorClassItem): number | null {
    if (item.catalogAcType === "bonus" && item.catalogAc != null) return item.catalogAc
    if (item.catalogAcBonus != null) return item.catalogAcBonus
    return null
}

/** `items` são os itens da própria ficha (os não equipados são ignorados). */
export function computeSheetArmorClass(sheet: ArmorClassSheet, items: readonly ArmorClassItem[]): number {
    const equippedArmor = items.find((item) => item.equipped && item.catalogItemType === "armadura" && item.catalogAcType === "base" && item.catalogAc != null) ?? null
    const armorClassBonusSources = items
        .filter((item) => item.equipped)
        .map((item) => ({ name: stripHtml(item.name) || "Item", acBonus: armorClassBonusValue(item) }))
        .filter((item): item is { name: string; acBonus: number } => item.acBonus != null)
    return getArmorClass(
        sheet.dexterity,
        sheet.armorClassOverride ?? null,
        equippedArmor ? { name: stripHtml(equippedArmor.name) || "Armadura", ac: equippedArmor.catalogAc ?? null, armorType: equippedArmor.catalogArmorType ?? null } : null,
        armorClassBonusSources,
        sheet.armorClassBonus ?? null,
        sheet.unarmoredDefense ?? null,
        { strength: sheet.strength, dexterity: sheet.dexterity, constitution: sheet.constitution, intelligence: sheet.intelligence, wisdom: sheet.wisdom, charisma: sheet.charisma },
    ).value
}
