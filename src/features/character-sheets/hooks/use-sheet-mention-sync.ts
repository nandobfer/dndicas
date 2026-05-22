"use client"

import { useEffect, useMemo, useRef } from "react"
import type { UseFormWatch } from "react-hook-form"
import { fetchBackground } from "@/features/backgrounds/api/backgrounds-api"
import { fetchClass } from "@/features/classes/api/classes-api"
import type { CharacterClass } from "@/features/classes/types/classes.types"
import { fetchFeat } from "@/features/feats/api/feats-api"
import { useItems } from "../api/character-sheets-queries"
import { fetchRace } from "@/features/races/api/races-api"
import { fetchTraitById } from "@/features/traits/api/traits-api"
import { fetchItemById } from "@/features/items/api/items-api"
import type { AttributeType, ArmorTraining, CharacterSheet, CharacterResourceCharge, PatchSheetBody, SkillName } from "../types/character-sheet.types"
import {
    appendMentionsToHtml,
    collectMentionsFromClasses,
    collectMentionsFromRaces,
    collectMentionsFromSubclasses,
    dedupeMentions,
    diffMentions,
    extractFeatMention,
    extractMentionsFromHtml,
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
import { useCharacterCalculations } from "./use-character-calculations"
import { buildBoundResourceCharge, syncResourceChargeRows } from "../utils/resource-charges"

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
    raceIds: string[]
    backgroundFeatMentions: ParsedMention[]
    /** Saving throw attributes contributed by active classes */
    classSavingThrowAttributes: AttributeType[]
    /** Armor proficiency strings contributed by active classes (e.g. "Armaduras Leves") */
    classArmorProficiencies: string[]
    /** Skill proficiency names contributed by active backgrounds */
    backgroundSkillProficiencies: SkillName[]
}

const EMPTY_DERIVED_STATE: DerivedMentionState = {
    classMentions: [],
    subclassMentions: [],
    raceMentions: [],
    raceIds: [],
    backgroundFeatMentions: [],
    classSavingThrowAttributes: [],
    classArmorProficiencies: [],
    backgroundSkillProficiencies: [],
}

/** Maps Portuguese armor proficiency strings to ArmorTraining keys */
const ARMOR_PROF_KEY: Partial<Record<string, keyof ArmorTraining>> = {
    "Armaduras Leves": "light",
    "Armaduras Médias": "medium",
    "Armaduras Pesadas": "heavy",
    "Escudos": "shields",
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
    const watchedResourceCharges = watch("resourceCharges")
    const resourceCharges = useMemo(
        () => watchedResourceCharges ?? sheet.resourceCharges ?? [],
        [sheet.resourceCharges, watchedResourceCharges]
    )
    const currentSkills = watch("skills") ?? sheet.skills
    const currentSavingThrows = watch("savingThrows") ?? sheet.savingThrows
    const currentSpellSlots = watch("spellSlots") ?? sheet.spellSlots
    const currentHitDiceTotal = watch("hitDiceTotal") ?? sheet.hitDiceTotal ?? null
    const currentMovementSpeed = watch("movementSpeed") ?? sheet.movementSpeed ?? ""
    const currentSize = watch("size") ?? sheet.size ?? ""
    const watchedClassRef = watch("classRef")
    const watchedSubclassRef = watch("subclassRef")
    const watchedRaceRef = watch("raceRef")
    const watchedOriginRef = watch("originRef")
    const watchedSpellcastingAttribute = watch("spellcastingAttribute")
    const currentSpellcastingAttribute = watchedSpellcastingAttribute === undefined
        ? (sheet.spellcastingAttribute ?? null)
        : watchedSpellcastingAttribute
    const currentArmorTraining = watch("armorTraining") ?? sheet.armorTraining
    const currentWeaponProficiencies = watch("weaponProficiencies") ?? sheet.weaponProficiencies ?? ""
    const strength = watch("strength") ?? sheet.strength
    const dexterity = watch("dexterity") ?? sheet.dexterity
    const constitution = watch("constitution") ?? sheet.constitution
    const intelligence = watch("intelligence") ?? sheet.intelligence
    const wisdom = watch("wisdom") ?? sheet.wisdom
    const charisma = watch("charisma") ?? sheet.charisma
    const proficiencyBonusOverride = watch("proficiencyBonusOverride") ?? sheet.proficiencyBonusOverride ?? null
    const { data: items = [] } = useItems(sheet._id)
    const calc = useCharacterCalculations({
        ...sheet,
        level,
        strength,
        dexterity,
        constitution,
        intelligence,
        wisdom,
        charisma,
        proficiencyBonusOverride,
        savingThrows: currentSavingThrows,
        skills: currentSkills,
        spellSlots: currentSpellSlots,
        classFeatures,
        speciesTraits,
        featuresNotes,
        resourceCharges,
        armorTraining: currentArmorTraining,
        weaponProficiencies: currentWeaponProficiencies,
        movementSpeed: currentMovementSpeed,
        size: currentSize,
        spellcastingAttribute: currentSpellcastingAttribute,
    })

    const previousDerivedRef = useRef<DerivedMentionState>(EMPTY_DERIVED_STATE)
    const requestIdRef = useRef(0)
    const hasInitializedRef = useRef(false)
    const previousTriggerRef = useRef("")

    // Use refs for values that are read inside the effect but should NOT re-trigger it.
    const patchFieldsRef = useRef(patchFields)
    const armorTrainingRef = useRef(currentArmorTraining)
    const weaponProfsRef = useRef(currentWeaponProficiencies)
    const currentSavingThrowsRef = useRef(currentSavingThrows)
    const currentSkillsRef = useRef(currentSkills)

    // Ownership tracking: only remove what THIS sync session set to true.
    const syncContributedSavingThrowsRef = useRef<Set<AttributeType>>(new Set())
    const syncContributedArmorRef = useRef<Set<keyof ArmorTraining>>(new Set())
    const syncContributedSkillsRef = useRef<Set<SkillName>>(new Set())

    useEffect(() => {
        patchFieldsRef.current = patchFields
    }, [patchFields])

    useEffect(() => {
        armorTrainingRef.current = currentArmorTraining
    }, [currentArmorTraining])

    useEffect(() => {
        weaponProfsRef.current = currentWeaponProficiencies
    }, [currentWeaponProficiencies])

    useEffect(() => {
        currentSavingThrowsRef.current = currentSavingThrows
    }, [currentSavingThrows])

    useEffect(() => {
        currentSkillsRef.current = currentSkills
    }, [currentSkills])

    useEffect(() => {
        if (isReadOnly) return

        // Build triggerKey from mention IDs only — not full HTML —
        // so the expensive async resolution only runs when actual mentions change.
        const classIds = getActiveClassMentions(classValue).map(m => m.id).sort().join(",")
        const subclassIds = getActiveSubclassMentions(subclassValue).map(m => m.id).sort().join(",")
        const raceIds = getActiveRaceMentions(raceValue).map(m => m.id).sort().join(",")
        const bgIds = getActiveBackgroundMentions(originValue).map(m => m.id).sort().join(",")
        const itemIds = items
            .flatMap((item) => extractMentionsFromHtml(item.name).filter((mention) => mention.entityType === "Item"))
            .map((mention) => mention.id)
            .sort()
            .join(",")
        const classFeatureResourceIds = extractMentionsFromHtml(classFeatures)
            .filter((mention) => mention.entityType === "Habilidade")
            .map((mention) => mention.id)
            .sort()
            .join(",")
        const speciesTraitResourceIds = extractMentionsFromHtml(speciesTraits)
            .filter((mention) => mention.entityType === "Habilidade")
            .map((mention) => mention.id)
            .sort()
            .join(",")
        const featResourceIds = extractMentionsFromHtml(featuresNotes)
            .filter((mention) => mention.entityType === "Talento")
            .map((mention) => mention.id)
            .sort()
            .join(",")
        const statKey = [level, proficiencyBonusOverride ?? "", strength, dexterity, constitution, intelligence, wisdom, charisma].join(",")
        const triggerKey = [
            classIds,
            subclassIds,
            raceIds,
            bgIds,
            itemIds,
            classFeatureResourceIds,
            speciesTraitResourceIds,
            featResourceIds,
            statKey,
        ].join("||")

        if (hasInitializedRef.current && previousTriggerRef.current === triggerKey) {
            return
        }

        const requestId = ++requestIdRef.current

        void (async () => {
            const resolved = await resolveSheetSyncState(classValue, subclassValue, raceValue, originValue, level)

            if (requestId !== requestIdRef.current) return

            const nextDerived = resolved.derived
            const previousDerived = hasInitializedRef.current ? previousDerivedRef.current : EMPTY_DERIVED_STATE

            const classFeatureDiff = diffMentions(
                [...previousDerived.classMentions, ...previousDerived.subclassMentions],
                [...nextDerived.classMentions, ...nextDerived.subclassMentions]
            )
            const speciesTraitDiff = diffMentions(previousDerived.raceMentions, nextDerived.raceMentions)
            const featDiff = diffMentions(previousDerived.backgroundFeatMentions, nextDerived.backgroundFeatMentions)

            // Diff race IDs to detect newly added races
            const previousRaceIds = new Set(previousDerived.raceIds)
            const addedRaceIds = nextDerived.raceIds.filter((id) => !previousRaceIds.has(id))

            const nextClassFeatures = appendMentionsToHtml(
                removeMentionsFromHtml(classFeatures, classFeatureDiff.removed),
                classFeatureDiff.added
            )
            const nextSpeciesTraits = appendMentionsToHtml(
                removeMentionsFromHtml(speciesTraits, speciesTraitDiff.removed),
                speciesTraitDiff.added
            )
            const nextFeaturesNotes = appendMentionsToHtml(
                removeMentionsFromHtml(featuresNotes, featDiff.removed),
                featDiff.added
            )

            const winningSubclass = resolved.activeSubclasses.find(isSpellcastingSubclass)
            const winningClass = resolved.activeClasses.find(isSpellcastingClass)
            const winningSpellSource = winningSubclass?.entity ?? winningClass ?? null
            const nextSpellcastingAttribute = mapCatalogAttributeToSheetAttribute(winningSpellSource?.spellcastingAttribute)
            const nextSpellSlots = mapSpellSlotsForLevel(level, winningSpellSource, currentSpellSlots)
            const nextHitDice = mapHitDiceToSheetHitDice(resolved.activeClasses[0]?.hitDice)
            const nextResourceCharges = await syncMentionBoundResourceCharges({
                classFeatures: nextClassFeatures,
                speciesTraits: nextSpeciesTraits,
                featuresNotes: nextFeaturesNotes,
                items,
                currentRows: resourceCharges,
                level,
                proficiencyBonus: calc.profBonus.value,
                attributeModifiers: {
                    strength: calc.attrMods.strength.value,
                    dexterity: calc.attrMods.dexterity.value,
                    constitution: calc.attrMods.constitution.value,
                    intelligence: calc.attrMods.intelligence.value,
                    wisdom: calc.attrMods.wisdom.value,
                    charisma: calc.attrMods.charisma.value,
                },
            })

            const patch: Partial<PatchSheetBody> = {}

            assignIfChanged(patch, "classRef", resolved.activeClasses[0]?._id ?? null, watchedClassRef === undefined ? (sheet.classRef ?? null) : watchedClassRef)
            assignIfChanged(
                patch,
                "subclassRef",
                resolved.activeSubclasses[0]?.entity._id ? String(resolved.activeSubclasses[0].entity._id) : null,
                watchedSubclassRef === undefined ? (sheet.subclassRef ?? null) : watchedSubclassRef
            )
            assignIfChanged(
                patch,
                "raceRef",
                resolved.activeRaces[0]?._id ? String(resolved.activeRaces[0]._id) : null,
                watchedRaceRef === undefined ? (sheet.raceRef ?? null) : watchedRaceRef
            )
            assignIfChanged(
                patch,
                "originRef",
                resolved.activeBackgrounds[0]?._id ? String(resolved.activeBackgrounds[0]._id) : null,
                watchedOriginRef === undefined ? (sheet.originRef ?? null) : watchedOriginRef
            )
            assignIfChanged(patch, "classFeatures", nextClassFeatures, classFeatures)
            assignIfChanged(patch, "speciesTraits", nextSpeciesTraits, speciesTraits)
            assignIfChanged(patch, "featuresNotes", nextFeaturesNotes, featuresNotes)
            if (nextHitDice) {
                assignIfChanged(patch, "hitDiceTotal", nextHitDice, currentHitDiceTotal)
            }

            // ── Saving throws (class-contributed, ownership-aware) ──────────────
            const prevSavingThrowAttrs = new Set(previousDerived.classSavingThrowAttributes)
            const nextSavingThrowAttrs = new Set(nextDerived.classSavingThrowAttributes)

            const addedSavingThrowAttrs = nextDerived.classSavingThrowAttributes.filter(a => !prevSavingThrowAttrs.has(a))
            const removedSavingThrowAttrs = previousDerived.classSavingThrowAttributes.filter(a => !nextSavingThrowAttrs.has(a))

            const nextSavingThrows = { ...(currentSavingThrowsRef.current ?? {}) } as Record<AttributeType, boolean>
            let savingThrowsChanged = false

            for (const attr of addedSavingThrowAttrs) {
                if (!nextSavingThrows[attr]) {
                    nextSavingThrows[attr] = true
                    syncContributedSavingThrowsRef.current.add(attr)
                    savingThrowsChanged = true
                }
            }
            for (const attr of removedSavingThrowAttrs) {
                if (syncContributedSavingThrowsRef.current.has(attr)) {
                    nextSavingThrows[attr] = false
                    savingThrowsChanged = true
                }
                syncContributedSavingThrowsRef.current.delete(attr)
            }
            if (savingThrowsChanged) {
                assignIfChanged(patch, "savingThrows", nextSavingThrows as PatchSheetBody["savingThrows"], currentSavingThrowsRef.current)
            }

            assignIfChanged(patch, "spellcastingAttribute", nextSpellcastingAttribute, currentSpellcastingAttribute)
            assignIfChanged(patch, "spellSlots", nextSpellSlots, currentSpellSlots)
            assignIfChanged(patch, "resourceCharges", nextResourceCharges, resourceCharges)

            // ── Armor training (class-contributed, ownership-aware) ─────────────
            const prevArmorProfs = new Set(previousDerived.classArmorProficiencies)
            const nextArmorProfs = new Set(nextDerived.classArmorProficiencies)

            const addedArmorProfs = nextDerived.classArmorProficiencies.filter(p => !prevArmorProfs.has(p))
            const removedArmorProfs = previousDerived.classArmorProficiencies.filter(p => !nextArmorProfs.has(p))

            const armorTraining = armorTrainingRef.current
            const nextArmorTraining = { ...armorTraining } as ArmorTraining
            let armorChanged = false

            for (const prof of addedArmorProfs) {
                const key = ARMOR_PROF_KEY[prof]
                if (key && !nextArmorTraining[key]) {
                    nextArmorTraining[key] = true
                    syncContributedArmorRef.current.add(key)
                    armorChanged = true
                }
            }
            for (const prof of removedArmorProfs) {
                const key = ARMOR_PROF_KEY[prof]
                if (key && syncContributedArmorRef.current.has(key)) {
                    nextArmorTraining[key] = false
                    armorChanged = true
                }
                if (key) syncContributedArmorRef.current.delete(key)
            }
            if (armorChanged) {
                assignIfChanged(patch, "armorTraining", nextArmorTraining, armorTraining)
            }

            // ── Weapon proficiencies — only add when the field is currently empty ──
            const weaponProfs = weaponProfsRef.current
            if (!weaponProfs.trim()) {
                const classWeaponProfs = resolved.activeClasses.flatMap((c) => c.weaponProficiencies ?? [])
                if (classWeaponProfs.length > 0) {
                    assignIfChanged(patch, "weaponProficiencies", classWeaponProfs.join(", "), weaponProfs)
                }
            }

            // ── Background skill proficiencies (ownership-aware) ────────────────
            const prevBgSkills = new Set(previousDerived.backgroundSkillProficiencies)
            const nextBgSkills = new Set(nextDerived.backgroundSkillProficiencies)

            const addedBgSkills = nextDerived.backgroundSkillProficiencies.filter(s => !prevBgSkills.has(s))
            const removedBgSkills = previousDerived.backgroundSkillProficiencies.filter(s => !nextBgSkills.has(s))

            const nextSkills = { ...(currentSkillsRef.current ?? {}) } as Record<SkillName, { proficient: boolean; expertise: boolean }>
            let skillsChanged = false

            for (const skill of addedBgSkills) {
                if (!nextSkills[skill]?.proficient) {
                    nextSkills[skill] = { ...(nextSkills[skill] ?? { proficient: false, expertise: false }), proficient: true }
                    syncContributedSkillsRef.current.add(skill)
                    skillsChanged = true
                }
            }
            for (const skill of removedBgSkills) {
                if (syncContributedSkillsRef.current.has(skill)) {
                    nextSkills[skill] = { ...(nextSkills[skill] ?? { proficient: false, expertise: false }), proficient: false }
                    skillsChanged = true
                }
                syncContributedSkillsRef.current.delete(skill)
            }
            if (skillsChanged) {
                assignIfChanged(patch, "skills", nextSkills as PatchSheetBody["skills"], currentSkillsRef.current)
            }

            // ── Populate movementSpeed and size from newly added races ───────────
            if (addedRaceIds.length > 0) {
                const addedRace = resolved.activeRaces.find((r) => addedRaceIds.includes(String(r._id)))
                if (addedRace) {
                    if (addedRace.speed) {
                        assignIfChanged(patch, "movementSpeed", addedRace.speed, currentMovementSpeed as PatchSheetBody["movementSpeed"])
                    }
                    if (addedRace.size) {
                        assignIfChanged(patch, "size", addedRace.size, currentSize as PatchSheetBody["size"])
                    }
                }
            }

            previousDerivedRef.current = nextDerived
            previousTriggerRef.current = triggerKey
            hasInitializedRef.current = true

            if (Object.keys(patch).length > 0) {
                // Include source identity fields so server always receives source + derived together.
                patch.class = classValue
                patch.subclass = subclassValue
                patch.race = raceValue
                patch.origin = originValue
                patchFieldsRef.current(patch)
            }
        })()
    }, [
        classFeatures,
        classValue,
        calc.attrMods.charisma.value,
        calc.attrMods.constitution.value,
        calc.attrMods.dexterity.value,
        calc.attrMods.intelligence.value,
        calc.attrMods.strength.value,
        calc.attrMods.wisdom.value,
        calc.profBonus.value,
        charisma,
        constitution,
        currentMovementSpeed,
        currentSize,
        currentSkills,
        currentSavingThrows,
        currentSpellSlots,
        currentSpellcastingAttribute,
        currentHitDiceTotal,
        currentArmorTraining,
        currentWeaponProficiencies,
        dexterity,
        featuresNotes,
        intelligence,
        isReadOnly,
        items,
        level,
        originValue,
        proficiencyBonusOverride,
        raceValue,
        sheet.classRef,
        sheet.movementSpeed,
        sheet.originRef,
        sheet.raceRef,
        sheet.size,
        sheet.spellSlots,
        sheet.spellcastingAttribute,
        sheet.subclassRef,
        strength,
        speciesTraits,
        subclassValue,
        wisdom,
        resourceCharges,
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

function dedupeStrings(items: string[]): string[] {
    return Array.from(new Set(items))
}

function dedupeSkillNames(skills: string[]): SkillName[] {
    return Array.from(new Set(skills)) as SkillName[]
}

async function resolveSheetSyncState(
    classValue: string,
    subclassValue: string,
    raceValue: string,
    originValue: string,
    level: number
) {
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

    const classSavingThrowAttributes = dedupeStrings(
        activeClasses.flatMap((c) =>
            (c.savingThrows ?? [])
                .map(mapCatalogAttributeToSheetAttribute)
                .filter((a): a is AttributeType => !!a)
        )
    ) as AttributeType[]

    const classArmorProficiencies = dedupeStrings(
        activeClasses
            .flatMap((c) => c.armorProficiencies ?? [])
            .filter((p) => p !== "Nenhuma")
    )

    const backgroundSkillProficiencies = dedupeSkillNames(
        activeBackgrounds.flatMap((b) => b.skillProficiencies ?? [])
    )

    return {
        activeClasses,
        activeSubclasses,
        activeRaces,
        activeBackgrounds,
        derived: {
            classMentions: collectMentionsFromClasses(activeClasses, level),
            subclassMentions: collectMentionsFromSubclasses(activeSubclasses, level),
            raceMentions: collectMentionsFromRaces(activeRaces, level),
            raceIds: activeRaces.map((r) => String(r._id)),
            backgroundFeatMentions,
            classSavingThrowAttributes,
            classArmorProficiencies,
            backgroundSkillProficiencies,
        } satisfies DerivedMentionState,
    }
}

async function syncMentionBoundResourceCharges({
    classFeatures,
    speciesTraits,
    featuresNotes,
    items,
    currentRows,
    level,
    proficiencyBonus,
    attributeModifiers,
}: {
    classFeatures: string
    speciesTraits: string
    featuresNotes: string
    items: Array<{ name: string }>
    currentRows: CharacterResourceCharge[]
    level: number
    proficiencyBonus: number
    attributeModifiers: Record<AttributeType, number>
}) {
    const traitMentions = [
        ...extractMentionsFromHtml(classFeatures)
            .filter((mention) => mention.entityType === "Habilidade")
            .map((mention) => ({ mention, kind: "class-feature" as const })),
        ...extractMentionsFromHtml(speciesTraits)
            .filter((mention) => mention.entityType === "Habilidade")
            .map((mention) => ({ mention, kind: "species-trait" as const })),
    ]
    const featMentions = extractMentionsFromHtml(featuresNotes)
        .filter((mention) => mention.entityType === "Talento")
        .map((mention) => ({ mention, kind: "feat" as const }))
    const itemMentions = items.flatMap((item) =>
        extractMentionsFromHtml(item.name)
            .filter((mention) => mention.entityType === "Item")
            .map((mention) => ({ mention, kind: "item" as const }))
    )

    const desiredRows = (await Promise.all([
        ...traitMentions.map(async ({ mention, kind }) => {
            try {
                const trait = await fetchTraitById(mention.id)
                return buildBoundResourceCharge({
                    entityId: mention.id,
                    entityType: "Habilidade",
                    kind,
                    nameHtml: mentionToHtml(mention),
                    charges: trait.charges,
                }, { level, proficiencyBonus, attributeModifiers })
            } catch {
                return null
            }
        }),
        ...featMentions.map(async ({ mention, kind }) => {
            try {
                const feat = await fetchFeat(mention.id)
                return buildBoundResourceCharge({
                    entityId: mention.id,
                    entityType: "Talento",
                    kind,
                    nameHtml: mentionToHtml(mention),
                    charges: feat.charges,
                }, { level, proficiencyBonus, attributeModifiers })
            } catch {
                return null
            }
        }),
        ...itemMentions.map(async ({ mention, kind }) => {
            try {
                const item = await fetchItemById(mention.id)
                return buildBoundResourceCharge({
                    entityId: mention.id,
                    entityType: "Item",
                    kind,
                    nameHtml: mentionToHtml(mention),
                    charges: item.charges,
                }, { level, proficiencyBonus, attributeModifiers })
            } catch {
                return null
            }
        }),
    ])).filter((row): row is CharacterResourceCharge => !!row)

    return syncResourceChargeRows(currentRows, desiredRows)
}

function mentionToHtml(mention: ParsedMention) {
    return `<p><span data-type="mention" data-id="${escapeAttr(mention.id)}" data-entity-type="${escapeAttr(mention.entityType)}" data-label="${escapeAttr(mention.label)}" class="mention">${escapeText(mention.label)}</span></p>`
}

function escapeAttr(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
}

function escapeText(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
}
