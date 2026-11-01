import { getAttributeModifier, getProficiencyBonus, getSavingThrowBonus, getSkillBonus, SKILL_ATTRIBUTE_MAP, type CalcPart } from "@/features/character-sheets/utils/dnd-calculations"
import type { AttributeType, CharacterSheet, SkillName } from "@/features/character-sheets/types/character-sheet.types"
import { MADDOX_CHECK_KIND_LABELS, MADDOX_CHECK_MODE_LABELS, type MaddoxCheckKind, type MaddoxCheckMode } from "./constants"

/**
 * Testes pedidos pelo Maddox (Maddox 5) — módulo PURO, usado pelo servidor (rolagem e prompt) e pela tela (prévia).
 * O modificador sai da ficha D&D pelas mesmas contas da ficha (`dnd-calculations`); o servidor recalcula na rolagem.
 */

export const MADDOX_ABILITIES: readonly AttributeType[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]

export const MADDOX_ABILITY_LABELS: Record<AttributeType, string> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

export const MADDOX_ABILITY_ABBR: Record<AttributeType, string> = { strength: "FOR", dexterity: "DES", constitution: "CON", intelligence: "INT", wisdom: "SAB", charisma: "CAR" }

export const MADDOX_SKILLS = Object.keys(SKILL_ATTRIBUTE_MAP) as SkillName[]

/** Campos da ficha usados nos testes e no resumo do narrador. */
export type MaddoxCheckSheet = Pick<CharacterSheet, AttributeType | "level" | "proficiencyBonusOverride" | "savingThrows" | "skills"> &
    Partial<Pick<CharacterSheet, "name" | "class" | "subclass" | "race" | "hpMax" | "hpCurrent" | "hpTemp" | "computedArmorClass">>

export interface MaddoxCheckSpec {
    kind: MaddoxCheckKind
    ability: AttributeType
    skill: SkillName | null
}

export interface MaddoxCheckModifier {
    value: number
    parts: CalcPart[]
}

const attributesOf = (sheet: MaddoxCheckSheet): Record<AttributeType, number> =>
    Object.fromEntries(MADDOX_ABILITIES.map((ability) => [ability, Number.isFinite(sheet[ability]) ? sheet[ability] : 10])) as Record<AttributeType, number>

export const proficiencyOf = (sheet: MaddoxCheckSheet) => getProficiencyBonus(Math.max(1, sheet.level || 1), sheet.proficiencyBonusOverride ?? null).value

/** Atributo do teste: a perícia define o atributo (como na ficha). */
export function checkAbility(kind: MaddoxCheckKind, ability: AttributeType | null, skill: SkillName | null): AttributeType | null {
    if (kind === "skill") return skill ? SKILL_ATTRIBUTE_MAP[skill] : null
    return ability
}

/** Modificador do teste pela ficha; sem ficha = 0 com a parte "Ficha não encontrada". */
export function checkModifier(sheet: MaddoxCheckSheet | null, check: MaddoxCheckSpec): MaddoxCheckModifier {
    if (!sheet) return { value: 0, parts: [{ label: "Ficha não encontrada", value: "+0", color: "manual" }] }
    const attributes = attributesOf(sheet)
    const prof = proficiencyOf(sheet)
    if (check.kind === "skill" && check.skill) {
        const data = sheet.skills?.[check.skill] ?? { proficient: false, expertise: false }
        const result = getSkillBonus(check.skill, attributes, data, prof)
        return { value: result.value, parts: result.parts ?? [] }
    }
    if (check.kind === "save") {
        const result = getSavingThrowBonus(attributes[check.ability], Boolean(sheet.savingThrows?.[check.ability]), prof, check.ability)
        return { value: result.value, parts: result.parts ?? [] }
    }
    const mod = getAttributeModifier(attributes[check.ability]).value
    return { value: mod, parts: [{ label: MADDOX_ABILITY_LABELS[check.ability], value: signed(mod), color: check.ability }] }
}

export const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))

/** "Furtividade (Destreza)", "Resistência de Constituição", "Força". */
export function checkTitle(check: MaddoxCheckSpec): string {
    if (check.kind === "skill" && check.skill) return `${check.skill} (${MADDOX_ABILITY_LABELS[SKILL_ATTRIBUTE_MAP[check.skill]]})`
    if (check.kind === "save") return `Resistência de ${MADDOX_ABILITY_LABELS[check.ability]}`
    return MADDOX_ABILITY_LABELS[check.ability]
}

export const checkKindLabel = (kind: MaddoxCheckKind) => MADDOX_CHECK_KIND_LABELS[kind]
export const checkModeLabel = (mode: MaddoxCheckMode) => MADDOX_CHECK_MODE_LABELS[mode]

/**
 * Sucesso quando o total alcança a CD. Regra da mesa do Maddox: 20 natural no d20 mantido é sempre sucesso e 1 natural
 * sempre falha, qualquer que seja a CD.
 */
export const checkSucceeded = (total: number, dc: number, d20?: number | null) => (d20 === 20 ? true : d20 === 1 ? false : total >= dc)

/** d20 que conta numa rolagem de teste (o mantido na vantagem/desvantagem). */
export const keptD20 = (roll: { selectedD20?: { kept: number } | null; terms: Array<{ results: number[] }> }): number | null => roll.selectedD20?.kept ?? roll.terms[0]?.results[0] ?? null

/** Texto puro de um campo da ficha que guarda HTML de menção (classe, subclasse, raça): só os nomes. */
function plainField(value: string | null | undefined): string {
    return String(value ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
}

/** Resumo da ficha para o prompt do narrador (uma linha por bloco). */
export function sheetSummary(sheet: MaddoxCheckSheet): string {
    const attributes = attributesOf(sheet)
    const prof = proficiencyOf(sheet)
    const [cls, subclass, race] = [plainField(sheet.class), plainField(sheet.subclass), plainField(sheet.race)]
    const identity = [sheet.level ? `Nível ${sheet.level}` : null, [cls, subclass ? `(${subclass})` : null].filter(Boolean).join(" ") || null, race || null].filter(Boolean).join(" · ")
    const hp = sheet.hpMax != null ? `PV ${sheet.hpCurrent ?? sheet.hpMax}/${sheet.hpMax}${sheet.hpTemp ? ` (+${sheet.hpTemp} temporários)` : ""}` : null
    const ac = sheet.computedArmorClass != null ? `CA ${sheet.computedArmorClass}` : null
    const abilities = MADDOX_ABILITIES.map((ability) => `${MADDOX_ABILITY_ABBR[ability]} ${attributes[ability]} (${signed(getAttributeModifier(attributes[ability]).value)})`).join(", ")
    const saves = MADDOX_ABILITIES.filter((ability) => sheet.savingThrows?.[ability]).map((ability) => MADDOX_ABILITY_ABBR[ability])
    const skills = MADDOX_SKILLS.filter((skill) => {
        const data = sheet.skills?.[skill]
        return data && (data.proficient || data.expertise || data.override !== undefined)
    }).map((skill) => `${skill} ${signed(checkModifier(sheet, { kind: "skill", ability: SKILL_ATTRIBUTE_MAP[skill], skill }).value)}`)
    return [
        [identity || null, hp, ac, `Proficiência ${signed(prof)}`].filter(Boolean).join(" · "),
        `Atributos: ${abilities}`,
        `Resistências com proficiência: ${saves.length ? saves.join(", ") : "nenhuma"}`,
        `Perícias treinadas: ${skills.length ? skills.join(", ") : "nenhuma"}`,
    ].join("\n")
}
