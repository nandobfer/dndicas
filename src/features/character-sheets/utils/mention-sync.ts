"use client"

import type { Background } from "@/features/backgrounds/types/backgrounds.types"
import type { CharacterClass, ClassTrait, Subclass } from "@/features/classes/types/classes.types"
import type { Feat } from "@/features/feats/types/feats.types"
import type { Race, RaceTrait } from "@/features/races/types/races.types"
import type { PatchSheetBody, SkillName } from "../types/character-sheet.types"

export interface ParsedMention {
    id: string
    entityType: string
    label: string
}

export interface SpellcastingSource {
    spellcastingAttribute?: string | null
    progressionTable?: CharacterClass["progressionTable"]
}

export interface ResolvedSubclass {
    id: string
    entity: Subclass
    parentClassId: string
}

const EMPTY_HTML_VALUES = new Set(["", "<p></p>"])

export function normalizeHtml(html: string | null | undefined): string {
    const value = String(html ?? "").trim()
    return EMPTY_HTML_VALUES.has(value) ? "" : value
}

export function extractMentionsFromHtml(html: string | null | undefined): ParsedMention[] {
    const normalized = normalizeHtml(html)
    if (!normalized || typeof DOMParser === "undefined") return []

    const parser = new DOMParser()
    const doc = parser.parseFromString(normalized, "text/html")

    return Array.from(doc.body.querySelectorAll('span[data-type="mention"]')).map((node) => ({
        id: node.getAttribute("data-id") || "",
        entityType: node.getAttribute("data-entity-type") || "Regra",
        label: node.getAttribute("data-label") || node.textContent || "",
    })).filter((mention) => mention.id)
}

export function buildMentionHtml(mention: ParsedMention): string {
    const attrs = [
        `data-type="mention"`,
        `data-id="${escapeHtmlAttr(mention.id)}"`,
        `data-entity-type="${escapeHtmlAttr(mention.entityType)}"`,
        `data-label="${escapeHtmlAttr(mention.label)}"`,
        `class="mention"`,
    ].join(" ")

    return `<span ${attrs}>${escapeHtmlText(mention.label)}</span>`
}

export function removeMentionsFromHtml(html: string | null | undefined, mentionsToRemove: ParsedMention[]): string {
    const normalized = normalizeHtml(html)
    if (!normalized || mentionsToRemove.length === 0 || typeof DOMParser === "undefined") return normalized

    const keys = new Set(mentionsToRemove.map(toMentionKey))
    const parser = new DOMParser()
    const doc = parser.parseFromString(normalized, "text/html")

    Array.from(doc.body.querySelectorAll('span[data-type="mention"]')).forEach((node) => {
        const mention = {
            id: node.getAttribute("data-id") || "",
            entityType: node.getAttribute("data-entity-type") || "Regra",
            label: node.getAttribute("data-label") || node.textContent || "",
        }

        if (keys.has(toMentionKey(mention))) {
            node.remove()
        }
    })

    cleanupEmptyBlocks(doc.body)
    return normalizeHtml(doc.body.innerHTML)
}

export function appendMentionsToHtml(html: string | null | undefined, mentionsToAdd: ParsedMention[]): string {
    const normalized = normalizeHtml(html)
    const uniqueMentions = dedupeMentions(mentionsToAdd)
    if (uniqueMentions.length === 0) return normalized

    const existingKeys = new Set(extractMentionsFromHtml(normalized).map(toMentionKey))
    const mentions = uniqueMentions.filter((mention) => !existingKeys.has(toMentionKey(mention)))
    if (mentions.length === 0) return normalized

    const mentionHtml = mentions.map(buildMentionHtml).join(" ")
    if (!normalized) return `<p>${mentionHtml}</p>`

    return `${normalized}<p>${mentionHtml}</p>`
}

export function collectClassTraitMentions(traits: ClassTrait[], level: number): ParsedMention[] {
    return traits
        .filter((trait) => trait.level <= level)
        .flatMap((trait) => extractTraitMentions(trait.description))
}

export function collectRaceTraitMentions(traits: RaceTrait[], level: number): ParsedMention[] {
    return traits
        .filter((trait) => (trait.level ?? 1) <= level)
        .flatMap((trait) => extractTraitMentions(trait.description))
}

export function collectBackgroundTraitMentions(background: Background): ParsedMention[] {
    return (background.traits ?? []).flatMap((trait) => extractTraitMentions(trait.description))
}

export function extractTraitMentions(html: string): ParsedMention[] {
    return extractMentionsFromHtml(html).filter((mention) => mention.entityType === "Habilidade")
}

export function extractFeatMention(feat: Feat | null | undefined): ParsedMention[] {
    if (!feat?._id) return []
    return [{ id: feat._id, entityType: "Talento", label: feat.name }]
}

export function mapSpellSlotsForLevel(
    level: number,
    source?: SpellcastingSource | null,
    currentSlots?: Record<string, { total: number; used: number }>
): PatchSheetBody["spellSlots"] {
    const levelData = source?.progressionTable?.spellSlots?.[level]
    const mapped: Record<string, { total: number; used: number }> = {}

    for (let slotLevel = 1; slotLevel <= 9; slotLevel += 1) {
        const key = String(slotLevel)
        const total = levelData?.slots?.[slotLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9] ?? 0
        const used = Math.min(currentSlots?.[key]?.used ?? 0, total)
        mapped[key] = { total, used }
    }

    return mapped
}

export function applySkillProficiencies(
    currentSkills: PatchSheetBody["skills"] | undefined,
    skillsToMark: SkillName[]
): PatchSheetBody["skills"] {
    const nextSkills = {
        ...(currentSkills ?? {}),
    } as Record<string, { proficient: boolean; expertise: boolean; override?: number }>

    for (const skill of skillsToMark) {
        const current = nextSkills[skill] ?? { proficient: false, expertise: false }
        nextSkills[skill] = { ...current, proficient: true }
    }

    return nextSkills as PatchSheetBody["skills"]
}

export function parseSubclassSearchId(id: string): { parentClassId: string; subclassId: string } | null {
    const match = /^subclass:([^:]+):(.+)$/.exec(id)
    if (!match) return null
    return { parentClassId: match[1], subclassId: match[2] }
}

export function dedupeMentions(mentions: ParsedMention[]): ParsedMention[] {
    const seen = new Set<string>()
    const result: ParsedMention[] = []

    for (const mention of mentions) {
        const key = toMentionKey(mention)
        if (seen.has(key)) continue
        seen.add(key)
        result.push(mention)
    }

    return result
}

export function toMentionKey(mention: Pick<ParsedMention, "id" | "entityType">): string {
    return `${mention.entityType}:${mention.id}`
}

function cleanupEmptyBlocks(root: HTMLElement) {
    Array.from(root.querySelectorAll("p,div,li")).forEach((element) => {
        const text = element.textContent?.replace(/\u00a0/g, " ").trim() ?? ""
        const hasMention = !!element.querySelector('span[data-type="mention"]')
        if (!text && !hasMention && element.childNodes.length === 0) {
            element.remove()
        }
    })
}

function escapeHtmlAttr(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
}

function escapeHtmlText(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
}

export function getActiveClassMentions(html: string | null | undefined): ParsedMention[] {
    return extractMentionsFromHtml(html).filter((mention) => mention.entityType === "Classe")
}

export function getActiveSubclassMentions(html: string | null | undefined): ParsedMention[] {
    return extractMentionsFromHtml(html).filter((mention) => mention.entityType === "Subclasse")
}

export function getActiveRaceMentions(html: string | null | undefined): ParsedMention[] {
    return extractMentionsFromHtml(html).filter((mention) => mention.entityType === "Raça")
}

export function getActiveBackgroundMentions(html: string | null | undefined): ParsedMention[] {
    return extractMentionsFromHtml(html).filter((mention) => mention.entityType === "Origem")
}

export function resolveSubclassFromClasses(classes: CharacterClass[], mentionId: string): ResolvedSubclass | null {
    const parsed = parseSubclassSearchId(mentionId)
    if (parsed) {
        const characterClass = classes.find((item) => item._id === parsed.parentClassId)
        const subclass = characterClass?.subclasses.find((item) => String(item._id || item.name) === parsed.subclassId)
        if (characterClass && subclass) {
            return { id: mentionId, entity: subclass, parentClassId: characterClass._id }
        }
    }

    for (const characterClass of classes) {
        const subclass = characterClass.subclasses.find((item) => String(item._id || item.name) === mentionId)
        if (subclass) {
            return { id: mentionId, entity: subclass, parentClassId: characterClass._id }
        }
    }

    return null
}

export function collectMentionsFromClasses(classes: CharacterClass[], level: number): ParsedMention[] {
    return dedupeMentions(classes.flatMap((characterClass) => collectClassTraitMentions(characterClass.traits ?? [], level)))
}

export function collectMentionsFromSubclasses(subclasses: ResolvedSubclass[], level: number): ParsedMention[] {
    return dedupeMentions(subclasses.flatMap((subclass) => collectClassTraitMentions(subclass.entity.traits ?? [], level)))
}

export function collectMentionsFromRaces(races: Race[], level: number): ParsedMention[] {
    return dedupeMentions(races.flatMap((race) => collectRaceTraitMentions(race.traits ?? [], level)))
}
