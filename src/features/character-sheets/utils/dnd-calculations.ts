import type { AttributeType, SkillName } from "../types/character-sheet.types"

export interface CalcResult {
    value: number
    formula: string
}

// ─── Proficiency bonus table (D&D 2024) ──────────────────────────────────────

export const getProficiencyBonus = (level: number, override: number | null): CalcResult => {
    if (override !== null) {
        return { value: override, formula: `Valor manual` }
    }
    const base = Math.ceil(level / 4) + 1
    return { value: base, formula: `Nível ${level} → +${base}` }
}

// ─── Attribute modifier ───────────────────────────────────────────────────────

export const getAttributeModifier = (value: number): CalcResult => {
    const mod = Math.floor((value - 10) / 2)
    const sign = mod >= 0 ? "+" : ""
    return { value: mod, formula: `${value} → floor((${value}-10)/2) = ${sign}${mod}` }
}

// ─── Saving throw ─────────────────────────────────────────────────────────────

export const getSavingThrowBonus = (attributeValue: number, proficient: boolean, profBonus: number): CalcResult => {
    const mod = Math.floor((attributeValue - 10) / 2)
    const total = proficient ? mod + profBonus : mod
    const sign = total >= 0 ? "+" : ""
    const formula = proficient
        ? `mod(${attributeValue}) ${mod >= 0 ? "+" : ""}${mod} + prof(${profBonus}) = ${sign}${total}`
        : `mod(${attributeValue}) ${mod >= 0 ? "+" : ""}${mod}`
    return { value: total, formula }
}

// ─── Skill bonus ──────────────────────────────────────────────────────────────

export const SKILL_ATTRIBUTE_MAP: Record<SkillName, AttributeType> = {
    Acrobacia: "dexterity",
    Arcanismo: "intelligence",
    Atletismo: "strength",
    Atuação: "charisma",
    Enganação: "charisma",
    Furtividade: "dexterity",
    História: "intelligence",
    Intimidação: "charisma",
    Intuição: "wisdom",
    Investigação: "intelligence",
    "Lidar com Animais": "wisdom",
    Medicina: "wisdom",
    Natureza: "intelligence",
    Percepção: "wisdom",
    Persuasão: "charisma",
    Prestidigitação: "dexterity",
    Religião: "intelligence",
    Sobrevivência: "wisdom",
}

export const getSkillBonus = (
    skillName: SkillName,
    attributes: Record<AttributeType, number>,
    skillData: { proficient: boolean; expertise: boolean; override?: number },
    profBonus: number
): CalcResult => {
    if (skillData.override !== undefined) {
        return { value: skillData.override, formula: `Valor manual` }
    }
    const attr = SKILL_ATTRIBUTE_MAP[skillName]
    const mod = Math.floor((attributes[attr] - 10) / 2)
    const bonus = skillData.expertise ? profBonus * 2 : skillData.proficient ? profBonus : 0
    const total = mod + bonus
    const sign = total >= 0 ? "+" : ""
    let formula = `mod ${mod >= 0 ? "+" : ""}${mod}`
    if (skillData.expertise) formula += ` + exp(${profBonus * 2})`
    else if (skillData.proficient) formula += ` + prof(${profBonus})`
    formula += ` = ${sign}${total}`
    return { value: total, formula }
}

// ─── Armor class ──────────────────────────────────────────────────────────────

export interface EquippedArmorData {
    ac?: number | null
    acType?: "base" | "bonus" | null
    armorType?: "leve" | "média" | "pesada" | null
    acBonus?: number | null
}

export const getArmorClass = (
    dexterity: number,
    override: number | null,
    equippedArmor?: EquippedArmorData | null,
    equippedShield?: EquippedArmorData | null,
    manualBonus?: number | null,
): CalcResult => {
    const dexMod = Math.floor((dexterity - 10) / 2)

    let base = 10
    let dexContrib = dexMod

    if (equippedArmor) {
        if (equippedArmor.acType === "base" && equippedArmor.ac != null) {
            base = equippedArmor.ac
        } else if (equippedArmor.acType === "bonus" && equippedArmor.acBonus != null) {
            base = 10 + equippedArmor.acBonus
        }
        if (equippedArmor.armorType === "pesada") {
            dexContrib = 0
        } else if (equippedArmor.armorType === "média") {
            dexContrib = Math.min(dexMod, 2)
        }
    }

    const shieldBonus = equippedShield?.acBonus ?? 0
    const bonus = manualBonus ?? 0
    const calculated = base + dexContrib + shieldBonus + bonus

    if (override !== null) {
        return { value: override, formula: `Valor manual (cálculo: ${base} + DEX(${dexContrib}) + escudo(${shieldBonus}) + bônus(${bonus}) = ${calculated})` }
    }

    const value = calculated
    let formula = `${base}`
    if (dexContrib !== 0) formula += ` + DEX(${dexContrib})`
    if (shieldBonus !== 0) formula += ` + escudo(${shieldBonus})`
    if (bonus !== 0) formula += ` + bônus(${bonus})`
    formula += ` = ${value}`

    return { value, formula }
}

// ─── Initiative ───────────────────────────────────────────────────────────────

export const getInitiative = (dexterity: number, override: number | null): CalcResult => {
    if (override !== null) {
        return { value: override, formula: `Valor manual (cálculo: DEX mod ${Math.floor((dexterity - 10) / 2)})` }
    }
    const dexMod = Math.floor((dexterity - 10) / 2)
    const sign = dexMod >= 0 ? "+" : ""
    return { value: dexMod, formula: `DEX mod(${dexterity}) = ${sign}${dexMod}` }
}

// ─── Passive perception ───────────────────────────────────────────────────────

export const getPassivePerception = (wisdomPerceptionBonus: number, override: number | null): CalcResult => {
    if (override !== null) {
        return { value: override, formula: `Valor manual (cálculo: 10 + Percepção ${wisdomPerceptionBonus})` }
    }
    const value = 10 + wisdomPerceptionBonus
    return { value, formula: `10 + bônus Percepção(${wisdomPerceptionBonus}) = ${value}` }
}

// ─── Spell save DC ────────────────────────────────────────────────────────────

export const getSpellSaveDC = (spellcastingAttrValue: number, profBonus: number, override: number | null): CalcResult => {
    if (override !== null) {
        return { value: override, formula: `Valor manual` }
    }
    const mod = Math.floor((spellcastingAttrValue - 10) / 2)
    const value = 8 + profBonus + mod
    return { value, formula: `8 + prof(${profBonus}) + mod(${mod}) = ${value}` }
}

// ─── Spell attack bonus ───────────────────────────────────────────────────────

export const getSpellAttackBonus = (spellcastingAttrValue: number, profBonus: number, override: number | null): CalcResult => {
    if (override !== null) {
        return { value: override, formula: `Valor manual` }
    }
    const mod = Math.floor((spellcastingAttrValue - 10) / 2)
    const value = profBonus + mod
    const sign = value >= 0 ? "+" : ""
    return { value, formula: `prof(${profBonus}) + mod(${mod}) = ${sign}${value}` }
}
