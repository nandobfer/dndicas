"use client"

import type { CharacterAttack } from "../types/character-sheet.types"
import type { ItemType, Item } from "@/features/items/types/items.types"
import { getDiceHex } from "@/features/rules/utils/dice-render-utils"

interface CalcValues {
    spellAttackBonus: { value: number }
    profBonus: { value: number }
    attrMods: {
        strength: { value: number }
        dexterity: { value: number }
    }
}

export function formatBonus(value: number): string {
    return value >= 0 ? `+${value}` : `${value}`
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export function hasFinesseProperty(propertiesHtml: string[]): boolean {
    return propertiesHtml.some((value) => /acuidade|finesse/i.test(stripHtml(value)))
}

export function resolveCatalogItemType(item: { type?: string | null; itemType?: string | null }): ItemType | null {
    const rawType = item.itemType ?? item.type
    if (rawType === "arma" || rawType === "armadura" || rawType === "escudo" || rawType === "ferramenta" || rawType === "consumível" || rawType === "munição" || rawType === "qualquer") {
        return rawType
    }
    return null
}

export function buildDiceValueHtml(quantity: number, faces: string, bonus?: number, colorHex?: string): string {
    const bonusAttr = bonus !== undefined ? ` data-bonus="${bonus}"` : ""
    const colorAttr = colorHex ? ` data-color-hex="${colorHex}"` : ""
    return `<span data-type="dice-value" data-qty="${quantity}" data-faces="${faces.replace("d", "")}"${bonusAttr}${colorAttr}></span>`
}

export function buildWeaponAttackAutofill(catalogItem: Item, calc: CalcValues): Pick<CharacterAttack, "attackBonus" | "damageType"> {
    const propertiesHtml = (catalogItem.properties ?? []).map((property) => `${property.name ?? ""} ${property.description ?? ""}`)
    const hasFinesse = hasFinesseProperty(propertiesHtml)
    const attrMod = hasFinesse
        ? Math.max(calc.attrMods.dexterity.value, calc.attrMods.strength.value)
        : calc.attrMods.strength.value
    const attackBonusValue = calc.profBonus.value + attrMod

    let damageText = ""
    if (catalogItem.damageDice) {
        const { quantidade, tipo } = catalogItem.damageDice
        const colorHex = getDiceHex(catalogItem.damageType ?? "")
        damageText = buildDiceValueHtml(quantidade, tipo, attrMod, colorHex)
        if (catalogItem.damageType) {
            damageText += ` ${catalogItem.damageType}`
        }
    }

    return {
        damageType: damageText ? `<p>${damageText}</p>` : "",
        attackBonus: formatBonus(attackBonusValue),
    }
}
