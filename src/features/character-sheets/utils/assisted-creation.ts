"use client"

import type { Background } from "@/features/backgrounds/types/backgrounds.types"
import type { AttributeType as CatalogAttributeType, CharacterClass, SkillType } from "@/features/classes/types/classes.types"
import type { Race } from "@/features/races/types/races.types"
import type { AttributeType, CharacterSheetFull, PatchSheetBody, SkillName } from "../types/character-sheet.types"
import { buildMentionHtml } from "./mention-sync"

export const ASSISTED_ATTRIBUTE_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const satisfies AttributeType[]
export type AssistedAttributeKey = (typeof ASSISTED_ATTRIBUTE_KEYS)[number]

export const ASSISTED_SKILLS = [
    "Acrobacia",
    "Arcanismo",
    "Atletismo",
    "Atuação",
    "Enganação",
    "Furtividade",
    "História",
    "Intimidação",
    "Intuição",
    "Investigação",
    "Lidar com Animais",
    "Medicina",
    "Natureza",
    "Percepção",
    "Persuasão",
    "Prestidigitação",
    "Religião",
    "Sobrevivência",
] as const satisfies SkillName[]

export const STANDARD_ARRAY_VALUES = [15, 14, 13, 12, 10, 8] as const
export const POINT_BUY_COSTS: Record<number, number> = {
    8: 0,
    9: 1,
    10: 2,
    11: 3,
    12: 4,
    13: 5,
    14: 7,
    15: 9,
}

export const CATALOG_TO_SHEET_ATTRIBUTE: Record<CatalogAttributeType, AttributeType> = {
    Força: "strength",
    Destreza: "dexterity",
    Constituição: "constitution",
    Inteligência: "intelligence",
    Sabedoria: "wisdom",
    Carisma: "charisma",
}

export function createEmptySkills(): CharacterSheetFull["skills"] {
    return Object.fromEntries(
        ASSISTED_SKILLS.map((skill) => [skill, { proficient: false, expertise: false }])
    ) as CharacterSheetFull["skills"]
}

export function createTemporaryAssistedSheet(userId = "assisted-user"): CharacterSheetFull {
    const now = new Date(0).toISOString()
    return {
        _id: "assisted-temp-sheet",
        slug: "assistente/ficha-temporaria",
        userId,
        username: "assistente",
        name: "",
        class: "",
        classRef: null,
        subclass: "",
        subclassRef: null,
        level: 1,
        experience: "",
        race: "",
        raceRef: null,
        origin: "",
        originRef: null,
        inspiration: false,
        multiclassNotes: "",
        photo: null,
        age: "",
        height: "",
        weight: "",
        eyes: "",
        skin: "",
        hair: "",
        appearance: "",
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        proficiencyBonusOverride: null,
        savingThrows: {
            strength: false,
            dexterity: false,
            constitution: false,
            intelligence: false,
            wisdom: false,
            charisma: false,
        },
        skills: createEmptySkills(),
        movementSpeed: "",
        hpMax: null,
        hpCurrent: null,
        hpTemp: 0,
        hitDiceTotal: "",
        hitDiceUsed: 0,
        deathSavesSuccess: 0,
        deathSavesFailure: 0,
        armorClassOverride: null,
        armorClassBonus: null,
        initiativeOverride: null,
        initiativeProficiency: false,
        passivePerceptionOverride: null,
        spellcastingAttribute: null,
        spellSaveDCOverride: null,
        spellAttackBonusOverride: null,
        spellSlots: {},
        resourceCharges: [],
        coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        personalityTraits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        history: "",
        notes: "",
        classFeatures: "",
        speciesTraits: "",
        featuresNotes: "",
        size: "",
        armorTraining: { light: false, medium: false, heavy: false, shields: false },
        weaponProficiencies: "",
        toolProficiencies: "",
        createdAt: now,
        updatedAt: now,
        items: [],
        spells: [],
        traits: [],
        feats: [],
        attacks: [],
    }
}

export function buildCatalogMentionHtml(id: string, entityType: "Raça" | "Origem" | "Classe", label: string) {
    return `<p>${buildMentionHtml({ id, entityType, label })}</p>`
}

export function applyRaceToSheet(sheet: CharacterSheetFull, race: Race): CharacterSheetFull {
    return {
        ...sheet,
        race: buildCatalogMentionHtml(race._id, "Raça", race.name),
        raceRef: race._id,
        movementSpeed: race.speed || sheet.movementSpeed,
        size: race.size || sheet.size,
    }
}

export function applyBackgroundToSheet(sheet: CharacterSheetFull, background: Background): CharacterSheetFull {
    const nextSkills = { ...sheet.skills }
    for (const skill of background.skillProficiencies ?? []) {
        if (skill in nextSkills) {
            nextSkills[skill as SkillName] = { ...nextSkills[skill as SkillName], proficient: true }
        }
    }

    return {
        ...sheet,
        origin: buildCatalogMentionHtml(background._id, "Origem", background.name),
        originRef: background._id,
        skills: nextSkills,
    }
}

export function applyClassToSheet(sheet: CharacterSheetFull, characterClass: CharacterClass, selectedSkills: SkillType[]): CharacterSheetFull {
    const nextSavingThrows = { ...sheet.savingThrows }
    for (const attr of characterClass.savingThrows ?? []) {
        const key = CATALOG_TO_SHEET_ATTRIBUTE[attr]
        if (key) nextSavingThrows[key] = true
    }

    const nextSkills = { ...sheet.skills }
    for (const skill of selectedSkills) {
        if (skill in nextSkills) {
            nextSkills[skill as SkillName] = { ...nextSkills[skill as SkillName], proficient: true }
        }
    }

    return {
        ...sheet,
        class: buildCatalogMentionHtml(characterClass._id, "Classe", characterClass.name),
        classRef: characterClass._id,
        hitDiceTotal: characterClass.hitDice || sheet.hitDiceTotal,
        savingThrows: nextSavingThrows,
        skills: nextSkills,
        armorTraining: {
            light: characterClass.armorProficiencies?.includes("Armaduras Leves") ?? sheet.armorTraining.light,
            medium: characterClass.armorProficiencies?.includes("Armaduras Médias") ?? sheet.armorTraining.medium,
            heavy: characterClass.armorProficiencies?.includes("Armaduras Pesadas") ?? sheet.armorTraining.heavy,
            shields: characterClass.armorProficiencies?.includes("Escudos") ?? sheet.armorTraining.shields,
        },
        weaponProficiencies: (characterClass.weaponProficiencies ?? []).join(", "),
        spellcastingAttribute: characterClass.spellcastingAttribute
            ? CATALOG_TO_SHEET_ATTRIBUTE[characterClass.spellcastingAttribute]
            : sheet.spellcastingAttribute,
    }
}

export function getPointBuyCost(scores: Partial<Record<AttributeType, number>>) {
    return ASSISTED_ATTRIBUTE_KEYS.reduce((total, attr) => total + (POINT_BUY_COSTS[scores[attr] ?? 8] ?? Number.POSITIVE_INFINITY), 0)
}

export function isValidPointBuy(scores: Partial<Record<AttributeType, number>>) {
    return ASSISTED_ATTRIBUTE_KEYS.every((attr) => {
        const value = scores[attr]
        return typeof value === "number" && value >= 8 && value <= 15 && Number.isFinite(POINT_BUY_COSTS[value])
    }) && getPointBuyCost(scores) <= 27
}

export function calculateDropLowestScore(results: number[]) {
    if (results.length !== 4) return null
    const sorted = [...results].sort((a, b) => a - b)
    return sorted.slice(1).reduce((total, value) => total + value, 0)
}

export function calculateFinalDiceScore(firstFiveScores: number[]) {
    if (firstFiveScores.length !== 5) return null
    const finalScore = 72 - firstFiveScores.reduce((total, value) => total + value, 0)
    return finalScore >= 3 && finalScore <= 18 ? finalScore : null
}

export function buildAssistedSheetPayload(sheet: CharacterSheetFull): PatchSheetBody {
    const {
        _id,
        slug,
        userId,
        username,
        createdAt,
        updatedAt,
        computedArmorClass,
        items,
        spells,
        traits,
        feats,
        attacks,
        ...payload
    } = sheet

    void _id
    void slug
    void userId
    void username
    void createdAt
    void updatedAt
    void computedArmorClass
    void items
    void spells
    void traits
    void feats
    void attacks

    return payload
}
