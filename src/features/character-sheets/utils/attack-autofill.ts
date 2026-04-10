"use client"

import type { CharacterAttack } from "../types/character-sheet.types"
import type { ItemType, Item } from "@/features/items/types/items.types"

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

export function buildDiceValueHtml(quantity: number, faces: string): string {
    return `<span data-type="dice-value" data-qty="${quantity}" data-faces="${faces.replace("d", "")}"></span>`
}

export function buildWeaponAttackAutofill(catalogItem: Item, calc: CalcValues): Pick<CharacterAttack, "attackBonus" | "damageType"> {
    let damageText = ""
    if (catalogItem.damageDice) {
        const { quantidade, tipo } = catalogItem.damageDice
        damageText = buildDiceValueHtml(quantidade, tipo)
        if (catalogItem.damageType) {
            damageText += ` ${catalogItem.damageType}`
        }
    }

    const propertiesHtml = (catalogItem.properties ?? []).map((property) => `${property.name ?? ""} ${property.description ?? ""}`)
    const hasFinesse = hasFinesseProperty(propertiesHtml)
    const attrMod = hasFinesse
        ? Math.max(calc.attrMods.dexterity.value, calc.attrMods.strength.value)
        : calc.attrMods.strength.value
    const attackBonusValue = calc.profBonus.value + attrMod

    if (damageText) {
        damageText += ` ${formatBonus(attrMod)}`
    }

    return {
        damageType: damageText ? `<p>${damageText}</p>` : "",
        attackBonus: formatBonus(attackBonusValue),
    }
}
