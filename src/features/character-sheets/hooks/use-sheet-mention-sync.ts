"use client"

import { useEffect, useRef } from "react"
import type { UseFormWatch } from "react-hook-form"
import { fetchBackground } from "@/features/backgrounds/api/backgrounds-api"
import { fetchClass } from "@/features/classes/api/classes-api"
import type { CharacterClass } from "@/features/classes/types/classes.types"
import { fetchFeat } from "@/features/feats/api/feats-api"
import { fetchRace } from "@/features/races/api/races-api"
import type { CharacterSheet, PatchSheetBody, SkillName } from "../types/character-sheet.types"
import {
    appendMentionsToHtml,
    applySkillProficiencies,
    collectMentionsFromClasses,
    collectMentionsFromRaces,
    collectMentionsFromSubclasses,
    dedupeMentions,
    extractFeatMention,
    getActiveBackgroundMentions,
    getActiveClassMentions,
    getActiveRaceMentions,
    getActiveSubclassMentions,
    mapCatalogAttributeToSheetAttribute,
    mapHitDiceToSheetHitDice,
    mapSpellSlotsForLevel,
    removeMentionsFromHtml,
    resolveSubclassFromClasses,
    type ParsedMention,
    type ResolvedSubclass,
} from "../utils/mention-sync"

interface UseSheetMentionSyncProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        patchFields: (fields: Partial<PatchSheetBody>) => void
    }
    isReadOnly?: boolean
}

interface DerivedMentionState {
    classMentions: ParsedMention[]
    subclassMentions: ParsedMention[]
    raceMentions: ParsedMention[]
    backgroundFeatMentions: ParsedMention[]
}

const EMPTY_DERIVED_STATE: DerivedMentionState = {
    classMentions: [],
    subclassMentions: [],
    raceMentions: [],
    backgroundFeatMentions: [],
}

export function useSheetMentionSync({ sheet, form, isReadOnly = false }: UseSheetMentionSyncProps) {
    const { watch, patchFields } = form

    const classValue = watch("class") ?? sheet.class ?? ""
    const subclassValue = watch("subclass") ?? sheet.subclass ?? ""
    const raceValue = watch("race") ?? sheet.race ?? ""
    const originValue = watch("origin") ?? sheet.origin ?? ""
    const level = watch("level") ?? sheet.level ?? 1
    const classFeatures = watch("classFeatures") ?? sheet.classFeatures ?? ""
    const speciesTraits = watch("speciesTraits") ?? sheet.speciesTraits ?? ""
    const featuresNotes = watch("featuresNotes") ?? sheet.featuresNotes ?? ""
    const currentSkills = watch("skills") ?? sheet.skills
    const currentSpellSlots = watch("spellSlots") ?? sheet.spellSlots
    const currentHitDiceTotal = watch("hitDiceTotal") ?? sheet.hitDiceTotal ?? null
    const watchedClassRef = watch("classRef")
    const watchedSubclassRef = watch("subclassRef")
    const watchedRaceRef = watch("raceRef")
    const watchedOriginRef = watch("originRef")
    const watchedSpellcastingAttribute = watch("spellcastingAttribute")
    const currentSpellcastingAttribute = watchedSpellcastingAttribute === undefined
        ? (sheet.spellcastingAttribute ?? null)
        : watchedSpellcastingAttribute

    const previousDerivedRef = useRef<DerivedMentionState>(EMPTY_DERIVED_STATE)
    const requestIdRef = useRef(0)

    useEffect(() => {
        if (isReadOnly) return

        const requestId = ++requestIdRef.current

        void (async () => {
            const classMentions = getActiveClassMentions(classValue)
            const subclassMentions = getActiveSubclassMentions(subclassValue)
            const raceMentions = getActiveRaceMentions(raceValue)
            const backgroundMentions = getActiveBackgroundMentions(originValue)

            const activeClasses = dedupeClasses(await Promise.all(
                classMentions.map(async (mention) => {
                    try {
                        return await fetchClass(mention.id)
                    } catch {
                        return null
                    }
                })
            ))

            let knownClasses = [...activeClasses]
            const activeSubclasses = dedupeResolvedSubclasses(
                subclassMentions
                    .map((mention) => resolveSubclassFromClasses(knownClasses, mention.id))
                    .filter((value): value is ResolvedSubclass => !!value)
            )

            const unresolvedSubclassMentions = subclassMentions.filter(
                (mention) => !activeSubclasses.some((item) => item.id === mention.id)
            )

            if (unresolvedSubclassMentions.length > 0) {
                const additionalClasses = dedupeClasses(await Promise.all(
                    unresolvedSubclassMentions.map(async (mention) => {
                        const parsedId = mention.id.match(/^subclass:([^:]+):(.+)$/)
                        const classId = parsedId?.[1]
                        if (!classId) return null
                        try {
                            return await fetchClass(classId)
                        } catch {
                            return null
                        }
                    })
                ))

                knownClasses = dedupeClasses([...knownClasses, ...additionalClasses])

                const resolvedExtra = unresolvedSubclassMentions
                    .map((mention) => resolveSubclassFromClasses(knownClasses, mention.id))
                    .filter((value): value is ResolvedSubclass => !!value)

                activeSubclasses.push(...resolvedExtra.filter(
                    (candidate) => !activeSubclasses.some((item) => item.id === candidate.id)
                ))
            }

            const activeRaces = dedupeById(await Promise.all(
                raceMentions.map(async (mention) => {
                    try {
                        return await fetchRace(mention.id)
                    } catch {
                        return null
                    }
                })
            ))

            const activeBackgrounds = dedupeById(await Promise.all(
                backgroundMentions.map(async (mention) => {
                    try {
                        return await fetchBackground(mention.id)
                    } catch {
                        return null
                    }
                })
            ))

            const backgroundFeatMentions = dedupeMentions((await Promise.all(
                activeBackgrounds.map(async (background) => {
                    const featIdValue = background.featId as string | { id: string; label?: string } | undefined
                    const featId = typeof featIdValue === "string" ? featIdValue : featIdValue?.id
                    if (!featId) return []
                    try {
                        const feat = await fetchFeat(featId)
                        return extractFeatMention(feat)
                    } catch {
                        return []
                    }
                })
            )).flat())

            if (requestId !== requestIdRef.current) return

            const nextDerived: DerivedMentionState = {
                classMentions: collectMentionsFromClasses(activeClasses, level),
                subclassMentions: collectMentionsFromSubclasses(activeSubclasses, level),
                raceMentions: collectMentionsFromRaces(activeRaces, level),
                backgroundFeatMentions,
            }

            const previousDerived = previousDerivedRef.current

            const nextClassFeatures = appendMentionsToHtml(
                removeMentionsFromHtml(
                    classFeatures,
                    [...previousDerived.classMentions, ...previousDerived.subclassMentions]
                ),
                [...nextDerived.classMentions, ...nextDerived.subclassMentions]
            )

            const nextSpeciesTraits = appendMentionsToHtml(
                removeMentionsFromHtml(speciesTraits, previousDerived.raceMentions),
                nextDerived.raceMentions
            )

            const nextFeaturesNotes = appendMentionsToHtml(
                removeMentionsFromHtml(featuresNotes, previousDerived.backgroundFeatMentions),
                nextDerived.backgroundFeatMentions
            )

            const winningSubclass = activeSubclasses.find(isSpellcastingSubclass)
            const winningClass = activeClasses.find(isSpellcastingClass)
            const winningSpellSource = winningSubclass?.entity ?? winningClass ?? null
            const nextSpellcastingAttribute = mapCatalogAttributeToSheetAttribute(winningSpellSource?.spellcastingAttribute)
            const nextSpellSlots = mapSpellSlotsForLevel(level, winningSpellSource, currentSpellSlots)
            const nextHitDice = mapHitDiceToSheetHitDice(activeClasses[0]?.hitDice)

            const patch: Partial<PatchSheetBody> = {}

            assignIfChanged(patch, "classRef", activeClasses[0]?._id ?? null, watchedClassRef === undefined ? (sheet.classRef ?? null) : watchedClassRef)
            assignIfChanged(
                patch,
                "subclassRef",
                activeSubclasses[0]?.entity._id ? String(activeSubclasses[0].entity._id) : null,
                watchedSubclassRef === undefined ? (sheet.subclassRef ?? null) : watchedSubclassRef
            )
            assignIfChanged(
                patch,
                "raceRef",
                activeRaces[0]?._id ? String(activeRaces[0]._id) : null,
                watchedRaceRef === undefined ? (sheet.raceRef ?? null) : watchedRaceRef
            )
            assignIfChanged(
                patch,
                "originRef",
                activeBackgrounds[0]?._id ? String(activeBackgrounds[0]._id) : null,
                watchedOriginRef === undefined ? (sheet.originRef ?? null) : watchedOriginRef
            )
            assignIfChanged(patch, "classFeatures", nextClassFeatures, classFeatures)
            assignIfChanged(patch, "speciesTraits", nextSpeciesTraits, speciesTraits)
            assignIfChanged(patch, "featuresNotes", nextFeaturesNotes, featuresNotes)
            if (nextHitDice) {
                assignIfChanged(patch, "hitDiceTotal", nextHitDice, currentHitDiceTotal)
            }

            if (activeBackgrounds.length > 0) {
                const backgroundSkills = dedupeSkillNames(activeBackgrounds.flatMap((background) => background.skillProficiencies ?? []))
                const nextSkills = applySkillProficiencies(currentSkills, backgroundSkills)
                assignIfChanged(patch, "skills", nextSkills, currentSkills)
            }

            assignIfChanged(patch, "spellcastingAttribute", nextSpellcastingAttribute, currentSpellcastingAttribute)
            assignIfChanged(patch, "spellSlots", nextSpellSlots, currentSpellSlots)

            previousDerivedRef.current = nextDerived

            if (Object.keys(patch).length > 0) {
                patchFields(patch)
            }
        })()
    }, [
        classFeatures,
        classValue,
        currentSkills,
        currentSpellSlots,
        currentSpellcastingAttribute,
        currentHitDiceTotal,
        featuresNotes,
        isReadOnly,
        level,
        originValue,
        patchFields,
        raceValue,
        sheet.classRef,
        sheet.originRef,
        sheet.raceRef,
        sheet.spellSlots,
        sheet.spellcastingAttribute,
        sheet.subclassRef,
        speciesTraits,
        subclassValue,
        watchedClassRef,
        watchedOriginRef,
        watchedRaceRef,
        watchedSpellcastingAttribute,
        watchedSubclassRef,
    ])
}

function assignIfChanged<K extends keyof PatchSheetBody>(
    target: Partial<PatchSheetBody>,
    key: K,
    nextValue: PatchSheetBody[K],
    currentValue: PatchSheetBody[K]
) {
    if (!isEqual(nextValue, currentValue)) {
        target[key] = nextValue
    }
}

function isEqual(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right)
}

function dedupeClasses(items: Array<CharacterClass | null>): CharacterClass[] {
    const map = new Map<string, CharacterClass>()
    for (const item of items) {
        if (!item?._id) continue
        map.set(String(item._id), item)
    }
    return Array.from(map.values())
}

function dedupeById<T extends { _id?: string | null }>(items: Array<T | null>): T[] {
    const map = new Map<string, T>()
    for (const item of items) {
        if (!item?._id) continue
        map.set(String(item._id), item)
    }
    return Array.from(map.values())
}

function dedupeResolvedSubclasses(items: ResolvedSubclass[]): ResolvedSubclass[] {
    const map = new Map<string, ResolvedSubclass>()
    for (const item of items) {
        map.set(item.id, item)
    }
    return Array.from(map.values())
}

function isSpellcastingClass(characterClass: CharacterClass) {
    return !!(characterClass.spellcasting || characterClass.spellcastingAttribute || characterClass.progressionTable?.spellSlots)
}

function isSpellcastingSubclass(subclass: ResolvedSubclass) {
    return !!(subclass.entity.spellcasting || subclass.entity.spellcastingAttribute || subclass.entity.progressionTable?.spellSlots)
}

function dedupeSkillNames(skills: string[]): SkillName[] {
    return Array.from(new Set(skills)) as SkillName[]
}
