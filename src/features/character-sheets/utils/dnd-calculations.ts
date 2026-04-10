import type { AttributeType, SkillName } from "../types/character-sheet.types"

// ─── CalcResult ───────────────────────────────────────────────────────────────

// "stat" colors map to the attribute they represent (strength, dexterity, etc.)
// so CalcTooltip can use the same color scheme as attributeColors in colors.ts.
export type CalcPartColor = AttributeType | "prof" | "bonus" | "base" | "manual"

export interface CalcPart {
    label: string
    value: string | number
    color: CalcPartColor
}

export interface CalcResult {
    value: number
    formula: string
    parts?: CalcPart[]
    result?: string
}

const ATTR_LABEL: Record<AttributeType, string> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

function fmt(n: number): string {
    return (n >= 0 ? "+" : "") + n
}

// ─── Proficiency bonus table (D&D 2024) ──────────────────────────────────────

export const getProficiencyBonus = (level: number, override: number | null): CalcResult => {
    if (override !== null) {
        return { value: override, formula: `Valor manual`, parts: [{ label: "Manual", value: fmt(override), color: "manual" }], result: fmt(override) }
    }
    const base = Math.ceil(level / 4) + 1
    return {
        value: base,
        formula: `Nível ${level} → +${base}`,
        parts: [{ label: `Nível ${level}`, value: `+${base}`, color: "base" }],
        result: `+${base}`,
    }
}

// ─── Attribute modifier ───────────────────────────────────────────────────────

export const getAttributeModifier = (value: number): CalcResult => {
    const mod = Math.floor((value - 10) / 2)
    return {
        value: mod,
        formula: `${value} → floor((${value}-10)/2) = ${fmt(mod)}`,
        parts: [{ label: `Atributo ${value}`, value: fmt(mod), color: "base" }],
        result: fmt(mod),
    }
}

// ─── Saving throw ─────────────────────────────────────────────────────────────

export const getSavingThrowBonus = (attributeValue: number, proficient: boolean, profBonus: number, attrType?: AttributeType): CalcResult => {
    const mod = Math.floor((attributeValue - 10) / 2)
    const total = proficient ? mod + profBonus : mod
    const attrLabel = attrType ? ATTR_LABEL[attrType] : "Atributo"
    const formula = proficient
        ? `mod(${attributeValue}) ${fmt(mod)} + prof(${profBonus}) = ${fmt(total)}`
        : `mod(${attributeValue}) ${fmt(mod)}`
    const parts: CalcPart[] = [{ label: attrLabel, value: fmt(mod), color: attrType ?? "base" }]
    if (proficient) parts.push({ label: "Prof.", value: `+${profBonus}`, color: "prof" })
    return { value: total, formula, parts, result: fmt(total) }
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
        return { value: skillData.override, formula: `Valor manual`, parts: [{ label: "Manual", value: fmt(skillData.override), color: "manual" }], result: fmt(skillData.override) }
    }
    const attr = SKILL_ATTRIBUTE_MAP[skillName]
    const mod = Math.floor((attributes[attr] - 10) / 2)
    const bonus = skillData.expertise ? profBonus * 2 : skillData.proficient ? profBonus : 0
    const total = mod + bonus
    let formula = `mod ${fmt(mod)}`
    if (skillData.expertise) formula += ` + exp(${profBonus * 2})`
    else if (skillData.proficient) formula += ` + prof(${profBonus})`
    formula += ` = ${fmt(total)}`
    const parts: CalcPart[] = [{ label: ATTR_LABEL[attr], value: fmt(mod), color: attr }]
    if (skillData.expertise) parts.push({ label: "Exp.", value: `+${profBonus * 2}`, color: "prof" })
    else if (skillData.proficient) parts.push({ label: "Prof.", value: `+${profBonus}`, color: "prof" })
    return { value: total, formula, parts, result: fmt(total) }
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
    _override: number | null,
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

    const parts: CalcPart[] = [{ label: "Base", value: base, color: "base" }]
    if (dexContrib !== 0) parts.push({ label: "Destreza", value: fmt(dexContrib), color: "dexterity" })
    if (shieldBonus !== 0) parts.push({ label: "Escudo", value: `+${shieldBonus}`, color: "bonus" })
    if (bonus !== 0) parts.push({ label: "Bônus", value: fmt(bonus), color: "bonus" })

    let formula = `${base}`
    if (dexContrib !== 0) formula += ` + DEX(${dexContrib})`
    if (shieldBonus !== 0) formula += ` + escudo(${shieldBonus})`
    if (bonus !== 0) formula += ` + bônus(${bonus})`
    formula += ` = ${calculated}`

    return { value: calculated, formula, parts, result: String(calculated) }
}

// ─── Initiative ───────────────────────────────────────────────────────────────

export const getInitiative = (dexterity: number, override: number | null): CalcResult => {
    const dexMod = Math.floor((dexterity - 10) / 2)
    if (override !== null) {
        return {
            value: override,
            formula: `Valor manual (cálculo: DEX mod ${dexMod})`,
            parts: [{ label: "Manual", value: fmt(override), color: "manual" }],
            result: fmt(override),
        }
    }
    return {
        value: dexMod,
        formula: `DEX mod(${dexterity}) = ${fmt(dexMod)}`,
        parts: [{ label: "Destreza", value: fmt(dexMod), color: "dexterity" }],
        result: fmt(dexMod),
    }
}

// ─── Passive perception ───────────────────────────────────────────────────────

export const getPassivePerception = (wisdomPerceptionBonus: number, override: number | null): CalcResult => {
    if (override !== null) {
        return {
            value: override,
            formula: `Valor manual (cálculo: 10 + Percepção ${wisdomPerceptionBonus})`,
            parts: [{ label: "Manual", value: override, color: "manual" }],
            result: String(override),
        }
    }
    const value = 10 + wisdomPerceptionBonus
    return {
        value,
        formula: `10 + bônus Percepção(${wisdomPerceptionBonus}) = ${value}`,
        parts: [
            { label: "Base", value: 10, color: "base" },
            { label: "Percepção", value: fmt(wisdomPerceptionBonus), color: "wisdom" },
        ],
        result: String(value),
    }
}

// ─── Spell save DC ────────────────────────────────────────────────────────────

export const getSpellSaveDC = (spellcastingAttrValue: number, profBonus: number, override: number | null, attrType?: AttributeType): CalcResult => {
    if (override !== null) {
        return { value: override, formula: `Valor manual`, parts: [{ label: "Manual", value: override, color: "manual" }], result: String(override) }
    }
    const mod = Math.floor((spellcastingAttrValue - 10) / 2)
    const value = 8 + profBonus + mod
    const attrLabel = attrType ? ATTR_LABEL[attrType] : "Conjuração"
    return {
        value,
        formula: `8 + prof(${profBonus}) + mod(${mod}) = ${value}`,
        parts: [
            { label: "Base", value: 8, color: "base" },
            { label: "Prof.", value: `+${profBonus}`, color: "prof" },
            { label: attrLabel, value: fmt(mod), color: attrType ?? "base" },
        ],
        result: String(value),
    }
}

// ─── Spell attack bonus ───────────────────────────────────────────────────────

export const getSpellAttackBonus = (spellcastingAttrValue: number, profBonus: number, override: number | null, attrType?: AttributeType): CalcResult => {
    if (override !== null) {
        return { value: override, formula: `Valor manual`, parts: [{ label: "Manual", value: fmt(override), color: "manual" }], result: fmt(override) }
    }
    const mod = Math.floor((spellcastingAttrValue - 10) / 2)
    const value = profBonus + mod
    const attrLabel = attrType ? ATTR_LABEL[attrType] : "Conjuração"
    return {
        value,
        formula: `prof(${profBonus}) + mod(${mod}) = ${fmt(value)}`,
        parts: [
            { label: "Prof.", value: `+${profBonus}`, color: "prof" },
            { label: attrLabel, value: fmt(mod), color: attrType ?? "base" },
        ],
        result: fmt(value),
    }
}
