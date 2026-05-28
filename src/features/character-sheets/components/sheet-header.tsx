"use client"


import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

import { SheetInput } from "./sheet-input"
import { CompactRichInput } from "./compact-rich-input"
import type { UseFormWatch } from "react-hook-form"
import type { CharacterSheet, CharacterItem, PatchSheetBody } from "../types/character-sheet.types"
import { cn } from "@/core/utils"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { GlassImage } from "@/components/ui/glass-image"
import { GlassImageUploader } from "@/components/ui/glass-image-uploader"
import {
  GlassModal,
  GlassModalContent,
  GlassModalDescription,
  GlassModalFooter,
  GlassModalHeader,
  GlassModalTitle,
} from "@/components/ui/glass-modal"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import { colors, diceColors, type DiceType, type EntityType } from "@/lib/config/colors"
import { useClass } from "@/features/classes/api/classes-queries"
import { ClassProgressionTable } from "@/features/classes/components/class-progression-table"
import { useRace } from "@/features/races/api/races-queries"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import { TraitPreview } from "@/features/rules/components/entity-preview-tooltip"
import { fetchTraitById } from "@/features/traits/api/traits-api"
import type { Trait } from "@/features/traits/types/traits.types"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { syncMentionBoundResourceCharges } from "../hooks/use-sheet-mention-sync"
import { CalcTooltip } from "./calc-tooltip"
import {
  appendMentionsToHtml,
  extractMentionsFromHtml,
  getActiveClassMentions,
  getActiveRaceMentions,
  getActiveSubclassMentions,
  resolveSubclassFromClasses,
  type ParsedMention,
} from "../utils/mention-sync"

const HIT_DIE_OPTIONS: DiceType[] = ["d4", "d6", "d8", "d10", "d12"]
const IDENTITY_FIELDS = [
  { label: "Origem", field: "origin", placeholder: "@Sábio", specificEntityMention: "Origem" },
  { label: "Classe", field: "class", placeholder: "@Mago", specificEntityMention: "Classe" },
  { label: "Espécie", field: "race", placeholder: "@Elfo", specificEntityMention: "Raça" },
  { label: "Subclasse", field: "subclass", placeholder: "@Escola de Evocação", specificEntityMention: "Subclasse" },
] as const satisfies ReadonlyArray<{
  label: string
  field: "origin" | "class" | "race" | "subclass"
  placeholder: string
  specificEntityMention: EntityType
}>

interface SheetHeaderProps {
    sheet: CharacterSheet
    form: {
      watch: UseFormWatch<PatchSheetBody>
      setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => void
      patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    items?: CharacterItem[]
    isReadOnly?: boolean
    isOwlbear?: boolean
}

type UseSheetHeaderSectionsProps = SheetHeaderProps
type LevelUpTraitSource = "Classe" | "Subclasse" | "Raça"
type LevelUpTraitPreview = { source: LevelUpTraitSource; trait: Trait }
type LevelUpTraitSeed = { source: LevelUpTraitSource; description: string; fallbackName?: string | null }
type LevelUpResourceChange = { key: string; name: string; currentTotal: number; nextTotal: number }

const DICE_SIDES_BY_TYPE: Record<DiceType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
}

function stripHtml(html: string | null | undefined): string {
  return String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function getArmorClassBonusValue(item: CharacterItem): number | null {
  if (item.catalogAcType === "bonus" && item.catalogAc != null) {
    return item.catalogAc
  }

  if (item.catalogAcBonus != null) {
    return item.catalogAcBonus
  }

  return null
}

function normalizeCharacterText(value: string | null | undefined): string | null {
  const normalizedValue = stripHtml(value)
  return normalizedValue || null
}

function getAbilityModifier(score: number | null | undefined): number {
  return Math.floor(((score ?? 10) - 10) / 2)
}

function getProficiencyBonus(level: number, override: number | null | undefined): number {
  if (override != null) return override
  return Math.floor((Math.max(1, level) - 1) / 4) + 2
}

function extractTraitPreviewLabels(description: string, fallback?: string | null): string[] {
  const mentions = extractMentionsFromHtml(description)
    .filter((mention) => mention.entityType === "Habilidade")
    .map((mention) => mention.label.trim())
    .filter(Boolean)

  if (mentions.length > 0) {
    return mentions
  }

  const plainText = stripHtml(description)
  if (plainText) {
    return [plainText]
  }

  return fallback ? [fallback] : []
}

function buildLevelUpPreviewTrait({
  name,
  description,
  key,
}: {
  name: string
  description: string
  key: string
}): Trait {
  return {
    _id: key,
    id: key,
    name,
    description,
    charges: undefined,
    source: "Subir de nível",
    status: "active",
    createdAt: "",
    updatedAt: "",
  }
}

function buildTraitPreviewSeeds(
  traits: Array<{ level?: number; description: string; name?: string }>,
  level: number,
  source: LevelUpTraitSource
): LevelUpTraitSeed[] {
  return traits
    .filter((trait) => (trait.level ?? 1) === level)
    .map((trait) => ({
      source,
      description: trait.description,
      fallbackName: trait.name,
    }))
}

function collectTraitMentionsAtLevel(
  traits: Array<{ level?: number; description: string }>,
  level: number
): ParsedMention[] {
  return traits
    .filter((trait) => (trait.level ?? 1) === level)
    .flatMap((trait) => extractMentionsFromHtml(trait.description).filter((mention) => mention.entityType === "Habilidade"))
}

function getResourceChargeKey(row: CharacterSheet["resourceCharges"][number]): string {
  if (row.source) {
    return `${row.source.entityType}:${row.source.entityId}`
  }

  return stripHtml(row.name) || row.id
}

function getResourceChargeLabel(row: CharacterSheet["resourceCharges"][number]): string {
  const mentionedLabel = extractMentionsFromHtml(row.name)[0]?.label?.trim()
  return mentionedLabel || stripHtml(row.name) || "Recurso"
}

function buildResourceChargeChanges(
  currentRows: CharacterSheet["resourceCharges"],
  nextRows: CharacterSheet["resourceCharges"]
): LevelUpResourceChange[] {
  const currentMap = new Map(currentRows.map((row) => [getResourceChargeKey(row), row]))
  const nextMap = new Map(nextRows.map((row) => [getResourceChargeKey(row), row]))
  const keys = new Set([...currentMap.keys(), ...nextMap.keys()])

  return Array.from(keys)
    .map((key) => {
      const currentRow = currentMap.get(key)
      const nextRow = nextMap.get(key)
      return {
        key,
        name: getResourceChargeLabel(nextRow ?? currentRow!),
        currentTotal: currentRow?.total ?? 0,
        nextTotal: nextRow?.total ?? 0,
      }
    })
    .filter((row) => row.currentTotal !== row.nextTotal)
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
}

function buildCharacterPortraitAIPayload(sheet: CharacterSheet, items: CharacterItem[]) {
  const equippedItems = items
    .filter((item) => item.equipped)
    .map((item) => ({
      name: normalizeCharacterText(item.name),
      quantity: item.quantity,
      type: normalizeCharacterText(item.catalogItemType),
    }))
    .filter((item): item is { name: string; quantity: number; type: string | null } => Boolean(item.name))

  return {
    name: normalizeCharacterText(sheet.name),
    class: normalizeCharacterText(sheet.class),
    subclass: normalizeCharacterText(sheet.subclass),
    race: normalizeCharacterText(sheet.race),
    origin: normalizeCharacterText(sheet.origin),
    level: sheet.level,
    size: normalizeCharacterText(sheet.size),
    appearance: normalizeCharacterText(sheet.appearance),
    history: normalizeCharacterText(sheet.history),
    notes: normalizeCharacterText(sheet.notes),
    equippedItems,
  }
}

export function useSheetHeaderSections({ sheet, form, items = [], isReadOnly = false, isOwlbear = false }: UseSheetHeaderSectionsProps) {
  const { watch, setFieldLocally, patchField } = form
  const hitDiceValue = (watch("hitDiceTotal") || "d8") as DiceType
  const level = watch("level") ?? sheet.level ?? 1
  const hpCurrent = watch("hpCurrent") ?? 0
  const hpTemp = watch("hpTemp") ?? 0
  const hpMax = watch("hpMax") ?? 0
  const photo = watch("photo") ?? sheet.photo ?? null
  const classFeatures = watch("classFeatures") ?? sheet.classFeatures ?? ""
  const speciesTraits = watch("speciesTraits") ?? sheet.speciesTraits ?? ""
  const featuresNotes = watch("featuresNotes") ?? sheet.featuresNotes ?? ""
  const watchedResourceCharges = watch("resourceCharges")
  const resourceCharges = useMemo(
    () => watchedResourceCharges ?? sheet.resourceCharges ?? [],
    [sheet.resourceCharges, watchedResourceCharges]
  )
  const constitution = watch("constitution") ?? sheet.constitution ?? 10
  const strength = watch("strength") ?? sheet.strength ?? 10
  const dexterity = watch("dexterity") ?? sheet.dexterity ?? 10
  const intelligence = watch("intelligence") ?? sheet.intelligence ?? 10
  const wisdom = watch("wisdom") ?? sheet.wisdom ?? 10
  const charisma = watch("charisma") ?? sheet.charisma ?? 10
  const proficiencyBonusOverride = watch("proficiencyBonusOverride") ?? sheet.proficiencyBonusOverride ?? null
  const [hpAdjustmentValue, setHpAdjustmentValue] = useState("0")
  const classRef = watch("classRef") ?? sheet.classRef
  const subclassRef = watch("subclassRef") ?? sheet.subclassRef
  const raceRef = watch("raceRef") ?? sheet.raceRef
  const classValue = String(watch("class") ?? sheet.class ?? "")
  const subclassValue = String(watch("subclass") ?? sheet.subclass ?? "")
  const raceValue = String(watch("race") ?? sheet.race ?? "")
  const activeClassMentionId = getActiveClassMentions(classValue)[0]?.id ?? null
  const activeRaceMentionId = getActiveRaceMentions(raceValue)[0]?.id ?? null
  const subclassParentClassId = classRef ?? activeClassMentionId
  const { data: currentClass } = useClass(subclassParentClassId ?? null)
  const { data: currentRace } = useRace(raceRef ?? activeRaceMentionId)
  const [isProgressionOpen, setIsProgressionOpen] = useState(false)
  const [isLevelUpOpen, setIsLevelUpOpen] = useState(false)
  const [levelUpSubclassValue, setLevelUpSubclassValue] = useState(subclassValue)
  const [levelUpFeatValue, setLevelUpFeatValue] = useState("")
  const [rolledHpGain, setRolledHpGain] = useState<number | null>(null)
  const [isHpRollerVisible, setIsHpRollerVisible] = useState(false)
  const [levelUpValidationMessage, setLevelUpValidationMessage] = useState<string | null>(null)
  const [resourceChargeChanges, setResourceChargeChanges] = useState<LevelUpResourceChange[]>([])
  const [traitPreviewItems, setTraitPreviewItems] = useState<LevelUpTraitPreview[]>([])
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const nextLevel = Math.min(level + 1, 20)
  const canOpenLevelUp = !isReadOnly && !!currentClass && level < 20
  const requiresSubclassSelection = nextLevel === 3
  const requiresFeatSelection = nextLevel === 4
  const constitutionModifier = getAbilityModifier(constitution)
  const hitDieForLevelUp = (currentClass?.hitDice ?? hitDiceValue) as DiceType
  const averageHpGain = Math.max(1, Math.ceil((DICE_SIDES_BY_TYPE[hitDieForLevelUp] ?? 8) / 2) + constitutionModifier)
  const hpGainPreview = rolledHpGain ?? averageHpGain
  const nextHpMax = Math.max(1, hpMax + hpGainPreview)

  const levelUpSubclassMentionId = getActiveSubclassMentions(levelUpSubclassValue)[0]?.id ?? null
  const levelUpSelectedSubclass = currentClass && levelUpSubclassMentionId
    ? resolveSubclassFromClasses([currentClass], levelUpSubclassMentionId)
    : null

  const selectedSubclasses = currentClass?.subclasses
    ?.filter((subclass) => String(subclass._id || "") === String(subclassRef || "")) ?? []

  const selectedSubclassData = selectedSubclasses
    .map((subclass) => ({
      name: subclass.name,
      color: subclass.color ?? colors.rarity.veryRare,
      traits: subclass.traits ?? [],
      progressionData: subclass.progressionTable,
    }))

  const equippedBaseArmor = items.find(
    (item) => item.equipped && item.catalogItemType === "armadura" && item.catalogAcType === "base" && item.catalogAc != null
  ) ?? null
  const armorClassBonusSources = items
    .filter((item) => item.equipped)
    .map((item) => ({
      name: stripHtml(item.name) || "Item",
      acBonus: getArmorClassBonusValue(item),
    }))
    .filter((item): item is { name: string; acBonus: number } => item.acBonus != null)
    .map((item) => ({
      name: item.name,
      acBonus: item.acBonus,
    }))

  const currentSheet = { ...sheet, ...Object.fromEntries(
    Object.entries(watch()).filter(([, v]) => v !== undefined)
  ) } as CharacterSheet

  const calc = useCharacterCalculations(currentSheet, {
    equippedArmor: equippedBaseArmor ? {
      name: stripHtml(equippedBaseArmor.name) || "Armadura",
      ac: equippedBaseArmor.catalogAc,
      armorType: equippedBaseArmor.catalogArmorType,
    } : null,
    armorClassBonusSources,
  })

  const armorClassBonus = watch("armorClassBonus") ?? sheet.armorClassBonus ?? null
  const hpHealCap = hpMax > 0 ? hpMax : 0
  const parsedHpAdjustment = parseInt(hpAdjustmentValue, 10)
  const isHpAdjustmentValid = Number.isFinite(parsedHpAdjustment) && parsedHpAdjustment > 0

  const handleDeathSaveToggle = (field: "deathSavesSuccess" | "deathSavesFailure", index: number) => {
    if (isReadOnly) return
    const current = watch(field) || 0
    if (current === index) {
      patchField(field, index - 1)
    } else {
      patchField(field, index)
    }
  }

  const handleProgressionEnter = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    setIsProgressionOpen(true)
  }

  const handleProgressionLeave = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = setTimeout(() => setIsProgressionOpen(false), 120)
  }

  const handleHitPointAdjustment = (mode: "damage" | "heal") => {
    if (isReadOnly || !isHpAdjustmentValid) return

    const nextValue = mode === "damage"
      ? Math.max(0, hpCurrent - parsedHpAdjustment)
      : Math.min(hpHealCap, hpCurrent + parsedHpAdjustment)

    patchField("hpCurrent", nextValue)
    setHpAdjustmentValue("0")
  }

  const handleLevelUpOpenChange = (nextOpen: boolean) => {
    setIsLevelUpOpen(nextOpen)

    if (nextOpen) {
      setLevelUpSubclassValue(subclassValue)
      setLevelUpFeatValue("")
      setRolledHpGain(null)
      setIsHpRollerVisible(false)
      setLevelUpValidationMessage(null)
      setResourceChargeChanges([])
      setTraitPreviewItems([])
      return
    }

    setIsHpRollerVisible(false)
    setLevelUpValidationMessage(null)
  }

  const traitPreviewSeeds = useMemo(
    () => [
      ...buildTraitPreviewSeeds(currentClass?.traits ?? [], nextLevel, "Classe"),
      ...buildTraitPreviewSeeds(levelUpSelectedSubclass?.entity.traits ?? [], nextLevel, "Subclasse"),
      ...buildTraitPreviewSeeds(currentRace?.traits ?? [], nextLevel, "Raça"),
    ],
    [currentClass?.traits, currentRace?.traits, levelUpSelectedSubclass?.entity.traits, nextLevel]
  )

  const nextClassFeatureMentions = [
    ...collectTraitMentionsAtLevel(currentClass?.traits ?? [], nextLevel),
    ...collectTraitMentionsAtLevel(levelUpSelectedSubclass?.entity.traits ?? [], nextLevel),
  ]
  const nextSpeciesTraitMentions = collectTraitMentionsAtLevel(currentRace?.traits ?? [], nextLevel)
  const nextFeatMentions = requiresFeatSelection
    ? extractMentionsFromHtml(levelUpFeatValue).filter((mention) => mention.entityType === "Talento")
    : []

  const nextClassFeaturesPreview = appendMentionsToHtml(classFeatures, nextClassFeatureMentions)
  const nextSpeciesTraitsPreview = appendMentionsToHtml(speciesTraits, nextSpeciesTraitMentions)
  const nextFeaturesNotesPreview = appendMentionsToHtml(featuresNotes, nextFeatMentions)

  useEffect(() => {
    if (!isLevelUpOpen) return

    let isActive = true

    void (async () => {
      const currentRows = await syncMentionBoundResourceCharges({
        classFeatures,
        speciesTraits,
        featuresNotes,
        items,
        currentRows: resourceCharges,
        level,
        proficiencyBonus: getProficiencyBonus(level, proficiencyBonusOverride),
        attributeModifiers: {
          strength: getAbilityModifier(strength),
          dexterity: getAbilityModifier(dexterity),
          constitution: getAbilityModifier(constitution),
          intelligence: getAbilityModifier(intelligence),
          wisdom: getAbilityModifier(wisdom),
          charisma: getAbilityModifier(charisma),
        },
      })

      const nextRows = await syncMentionBoundResourceCharges({
        classFeatures: nextClassFeaturesPreview,
        speciesTraits: nextSpeciesTraitsPreview,
        featuresNotes: nextFeaturesNotesPreview,
        items,
        currentRows: currentRows,
        level: nextLevel,
        proficiencyBonus: getProficiencyBonus(nextLevel, proficiencyBonusOverride),
        attributeModifiers: {
          strength: getAbilityModifier(strength),
          dexterity: getAbilityModifier(dexterity),
          constitution: getAbilityModifier(constitution),
          intelligence: getAbilityModifier(intelligence),
          wisdom: getAbilityModifier(wisdom),
          charisma: getAbilityModifier(charisma),
        },
      })

      if (!isActive) return
      setResourceChargeChanges(buildResourceChargeChanges(currentRows, nextRows))
    })()

    return () => {
      isActive = false
    }
  }, [
    charisma,
    classFeatures,
    constitution,
    dexterity,
    featuresNotes,
    intelligence,
    isLevelUpOpen,
    items,
    level,
    nextClassFeaturesPreview,
    nextFeaturesNotesPreview,
    nextLevel,
    nextSpeciesTraitsPreview,
    proficiencyBonusOverride,
    resourceCharges,
    speciesTraits,
    strength,
    wisdom,
  ])

  useEffect(() => {
    if (!isLevelUpOpen) return

    let isActive = true

    void (async () => {
      const resolvedPreviewItems = (
        await Promise.all(
          traitPreviewSeeds.map(async (seed, seedIndex) => {
            const traitMentions = extractMentionsFromHtml(seed.description).filter((mention) => mention.entityType === "Habilidade")

            if (traitMentions.length === 0) {
              const fallbackName = extractTraitPreviewLabels(seed.description, seed.fallbackName)[0] ?? "Nova trait"
              return [{
                source: seed.source,
                trait: buildLevelUpPreviewTrait({
                  name: fallbackName,
                  description: seed.description,
                  key: `level-up-${seed.source}-${seedIndex}`,
                }),
              }]
            }

            return Promise.all(traitMentions.map(async (mention, mentionIndex) => {
              try {
                const resolvedTrait = await fetchTraitById(mention.id)
                return { source: seed.source, trait: resolvedTrait }
              } catch {
                return {
                  source: seed.source,
                  trait: buildLevelUpPreviewTrait({
                    name: mention.label || seed.fallbackName || "Nova trait",
                    description: seed.description,
                    key: `level-up-${seed.source}-${seedIndex}-${mentionIndex}`,
                  }),
                }
              }
            }))
          })
        )
      ).flat()

      if (!isActive) return
      setTraitPreviewItems(resolvedPreviewItems)
    })()

    return () => {
      isActive = false
    }
  }, [isLevelUpOpen, traitPreviewSeeds])

  const handleConfirmLevelUp = () => {
    if (!canOpenLevelUp) return

    if (requiresSubclassSelection && !levelUpSubclassMentionId) {
      setLevelUpValidationMessage("Escolha uma subclasse para confirmar o nível 3.")
      return
    }

    if (requiresFeatSelection && nextFeatMentions.length === 0) {
      setLevelUpValidationMessage("Escolha um talento para confirmar o nível 4.")
      return
    }

    setLevelUpValidationMessage(null)

    if (requiresSubclassSelection) {
      patchField("subclass", levelUpSubclassValue)
    }

    if (requiresFeatSelection) {
      patchField("featuresNotes", nextFeaturesNotesPreview)
    }

    patchField("hpMax", nextHpMax)
    patchField("level", nextLevel)
    handleLevelUpOpenChange(false)
  }

  const hpCurrentWidth = hpMax > 0
    ? `${Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100))}%`
    : "0%"
  const hpTempWidth = hpMax > 0
    ? `${Math.max(0, Math.min(100, (hpTemp / hpMax) * 100))}%`
    : "0%"
  const shouldShowIdentityImage = !isReadOnly || !!photo

  const identityCard = (
    <GlassCard className="border-white/10 bg-white/[0.02]">
      <GlassCardContent className={cn(
        "grid h-full grid-cols-1 gap-4 p-4",
        shouldShowIdentityImage && "sm:grid-cols-[132px_minmax(0,1fr)]"
      )}>
        {shouldShowIdentityImage && (
          <div className="flex h-full min-h-[176px] flex-col">
            {isReadOnly && photo ? (
              <GlassImage
                src={photo}
                alt={`Imagem de ${watch("name") || sheet.name || "personagem"}`}
                className="h-full min-h-[176px] rounded-lg"
                imageClassName="object-cover mix-blend-normal"
                showOverlay={false}
              />
            ) : !isReadOnly ? (
              <div className="flex h-full min-h-0 flex-col gap-1.5">
                <GlassImageUploader
                  value={photo ?? ""}
                  onChange={(url) => patchField("photo", url)}
                  onRemove={() => patchField("photo", null)}
                  aspectRatio="portrait"
                  disabled={isReadOnly}
                  className="min-h-0 flex-1 [&>div]:h-full"
                  getAIPayload={() => buildCharacterPortraitAIPayload(currentSheet, items)}
                  aiContextLabel="Personagem"
                />
                {photo && (
                  <GlassImage
                    src={photo}
                    alt={`Imagem de ${watch("name") || sheet.name || "personagem"}`}
                    showOverlay={false}
                    imageClassName="object-cover mix-blend-normal"
                    renderTrigger={({ open, label }) => (
                      <button
                        type="button"
                        onClick={open}
                        title={label}
                        className="mt-auto h-7 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
                      >
                        Ver foto
                      </button>
                    )}
                  />
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-4">
          <SheetInput
            label="Nome do Personagem"
            placeholder="NOME DO PERSONAGEM"
            value={watch("name") || ""}
            onChangeValue={(val) => patchField("name", val)}
            className="tracking-tight"
            readOnlyMode={isReadOnly}
          />

          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {IDENTITY_FIELDS.map((item) => (
              <CompactRichInput
                key={item.field}
                label={item.label}
                value={String(watch(item.field) || "")}
                onChange={(val) => setFieldLocally(item.field, val)}
                onBlur={(val) => patchField(item.field, val)}
                placeholder={item.placeholder}
                excludeId={sheet._id}
                disabled={isReadOnly}
                specificEntityMention={item.specificEntityMention}
                mentionParentClassId={item.field === "subclass" ? subclassParentClassId : null}
                openMentionsOnFocus
              />
            ))}
          </div>
        </div>
      </GlassCardContent>
    </GlassCard>
  )

  const levelCard = (
    <GlassCard className="border-white/10 bg-white/[0.02] h-full">
      <GlassCardContent className="px-4 pt-4 pb-0 flex flex-col items-center justify-center relative h-full gap-0">
        <div className="flex flex-col items-center z-10 gap-0">
          <SheetInput
            type="number"
            label="Nível"
            min={1}
            max={20}
            value={level}
            onChangeValue={(val) => patchField("level", parseInt(val) || 1)}
            showControls
            inputClassName="text-3xl font-black text-center h-10 px-0"
            className="items-center w-24"
            readOnlyMode={isReadOnly}
          />
        </div>
        <div className="mt-6 flex flex-col items-center z-10">
          <SheetInput
            compact
            label="XP"
            placeholder="0"
            className="w-20"
            inputClassName="text-center"
            value={watch("experience") || ""}
            onChangeValue={(val) => patchField("experience", val)}
            readOnlyMode={isReadOnly}
          />
        </div>
        {!isReadOnly && (
          <motion.button
            type="button"
            aria-label="Subir de nível"
            data-testid="level-up-button"
            whileHover={canOpenLevelUp ? { scale: 1.02 } : undefined}
            whileTap={canOpenLevelUp ? { scale: 0.98 } : undefined}
            disabled={!canOpenLevelUp}
            onClick={() => {
              if (!canOpenLevelUp) return
              handleLevelUpOpenChange(true)
            }}
            className={cn(
              "mt-5 z-10 inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors",
              canOpenLevelUp
                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.16)] hover:border-emerald-300/50 hover:bg-emerald-500/25"
                : "cursor-not-allowed border-white/10 bg-white/[0.04] text-white/35",
            )}
          >
            Subir de nível
          </motion.button>
        )}
      </GlassCardContent>
    </GlassCard>
  )

  const armorClassCard = (
    <GlassCard className="border-white/10 bg-white/[0.03] h-full">
      <GlassCardContent className="px-4 pt-4 pb-0 flex flex-col items-center justify-center h-full gap-3">
        <div className="relative w-full aspect-[4/5] flex flex-col items-center p-3 border border-white/20 bg-white/5 rounded-b-[45%] rounded-t-sm group transition-colors">
          <label className="text-[8px] font-black uppercase text-center leading-tight text-white/40 z-10">
            Classe de
            <br />
            Armadura
          </label>
          <div className="flex-1 flex items-center justify-center w-full">
            <CalcTooltip formula={calc.armorClass.formula} parts={calc.armorClass.parts} result={calc.armorClass.result}>
              <span className="text-3xl font-black text-white z-10 select-none">
                {calc.armorClass.value}
              </span>
            </CalcTooltip>
          </div>
          <div className="z-10 w-full mt-1">
            <SheetInput
              compact
              type="number"
              label="Bônus"
              value={armorClassBonus ?? 0}
              onChangeValue={(val) => patchField("armorClassBonus", parseInt(val) || 0)}
              showControls
              inputClassName="text-center text-xs h-5"
              className="items-center"
              readOnlyMode={isReadOnly}
            />
          </div>
        </div>
        {currentClass && (
          <GlassPopover open={isProgressionOpen} onOpenChange={setIsProgressionOpen}>
            <GlassPopoverTrigger asChild>
              <button
                type="button"
                onMouseEnter={handleProgressionEnter}
                onMouseLeave={handleProgressionLeave}
                onClick={() => setIsProgressionOpen((prev) => !prev)}
                className="z-10 inline-flex items-center justify-center whitespace-nowrap rounded-md border border-amber-400/30 bg-amber-500/15 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.24em] text-amber-300/85 shadow-[0_0_18px_rgba(245,158,11,0.12)] transition-colors hover:border-amber-300/50 hover:bg-amber-500/25 hover:text-amber-200"
                aria-label="Ver progressão da classe"
                data-testid="class-progression-button"
              >
                progressão
              </button>
            </GlassPopoverTrigger>
            <GlassPopoverContent
              side="bottom"
              align="center"
              sideOffset={isOwlbear ? 6 : 10}
              collisionPadding={12}
              className={cn("w-[min(92vw,900px)] p-0", isOwlbear && "w-[min(92vw,860px)]")}
              onMouseEnter={handleProgressionEnter}
              onMouseLeave={handleProgressionLeave}
            >
              <div
                data-testid={isOwlbear ? "owlbear-class-progression-popover" : undefined}
                className={cn(isOwlbear && "max-h-[min(60vh,460px)] overflow-auto overscroll-contain")}
              >
                <ClassProgressionTable
                  traits={currentClass.traits ?? []}
                  spellcasting={
                    !!(
                      currentClass.spellcasting ||
                      selectedSubclasses.some((subclass) => subclass.spellcasting || subclass.progressionTable?.spellSlots)
                    )
                  }
                  progressionData={currentClass.progressionTable}
                  subclassData={selectedSubclassData}
                  compact
                  forceOpen
                  hideToggle
                  className="border-0 rounded-none bg-transparent"
                />
              </div>
            </GlassPopoverContent>
          </GlassPopover>
        )}
      </GlassCardContent>
    </GlassCard>
  )

  const hitPointsCard = (
    <GlassCard className="border-white/10 bg-white/[0.02] h-full">
      <GlassCardContent className="p-0 flex flex-col h-full">
        <div className="text-center py-1.5 border-b border-white/10 bg-white/[0.03]">
          <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Pontos de Vida</label>
        </div>
        <div className="flex flex-1 flex-col relative">
          <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500/70 to-green-400/40 transition-all duration-300"
              style={{ width: hpCurrentWidth }}
            />
          </div>
          <div className="absolute top-[5px] left-0 right-0 h-0.5 overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ width: hpTempWidth, backgroundColor: colors.rarity.divine }}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 px-3 py-4">
            <div className="flex min-h-[120px] flex-col items-center justify-center">
              <SheetInput
                type="number"
                label="Atual"
                value={hpCurrent}
                onChangeValue={(val) => patchField("hpCurrent", parseInt(val) || 0)}
                showControls
                min={0}
                inputClassName="text-5xl h-20 text-center"
                className="items-center"
                readOnlyMode={isReadOnly}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <SheetInput
                compact
                type="number"
                label="Temp"
                value={hpTemp}
                onChangeValue={(val) => patchField("hpTemp", parseInt(val) || 0)}
                showControls
                inputClassName="text-center text-lg h-8"
                className="bg-white/5 rounded-lg border border-white/5 px-1"
                readOnlyMode={isReadOnly}
              />
              <SheetInput
                compact
                type="number"
                label="Máximo"
                value={hpMax}
                onChangeValue={(val) => patchField("hpMax", parseInt(val) || 0)}
                showControls
                inputClassName="text-center text-lg h-8"
                className="bg-white/5 rounded-lg border border-white/5 px-1"
                readOnlyMode={isReadOnly}
              />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 border-t border-white/10 bg-white/[0.02] px-2 py-1.5"
          >
            <motion.button
              type="button"
              whileHover={!isReadOnly && isHpAdjustmentValid ? { scale: 1.02 } : undefined}
              whileTap={!isReadOnly && isHpAdjustmentValid ? { scale: 0.98 } : undefined}
              disabled={isReadOnly || !isHpAdjustmentValid}
              onClick={() => handleHitPointAdjustment("damage")}
              className={cn(
                "h-8 rounded-lg border px-2.5 text-[11px] font-black uppercase tracking-wide transition-colors",
                isReadOnly || !isHpAdjustmentValid
                  ? "cursor-not-allowed border-red-500/10 bg-red-500/5 text-red-300/40"
                  : "border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20",
              )}
            >
              Tirar
            </motion.button>

            <SheetInput
              compact
              type="number"
              min={0}
              value={hpAdjustmentValue}
              onChange={(event) => setHpAdjustmentValue(event.target.value)}
              onChangeValue={(val) => setHpAdjustmentValue(val)}
              debounceMs={0}
              showControls
              allowEmptyNumber
              className="rounded-lg border border-white/10 bg-white/[0.04] px-1 py-0"
              inputClassName="h-6 px-0.5 text-center text-xs"
              readOnlyMode={isReadOnly}
            />

            <motion.button
              type="button"
              whileHover={!isReadOnly && isHpAdjustmentValid ? { scale: 1.02 } : undefined}
              whileTap={!isReadOnly && isHpAdjustmentValid ? { scale: 0.98 } : undefined}
              disabled={isReadOnly || !isHpAdjustmentValid}
              onClick={() => handleHitPointAdjustment("heal")}
              className={cn(
                "h-8 rounded-lg border px-2.5 text-[11px] font-black uppercase tracking-wide transition-colors",
                isReadOnly || !isHpAdjustmentValid
                  ? "cursor-not-allowed border-green-500/10 bg-green-500/5 text-green-300/40"
                  : "border-green-500/25 bg-green-500/10 text-green-300 hover:bg-green-500/20",
              )}
            >
              Curar
            </motion.button>
          </motion.div>
        </div>
      </GlassCardContent>
    </GlassCard>
  )

  const hitDiceAndDeathSavesCard = (
      <GlassCard className="border-white/10 bg-white/[0.02] min-w-[200px] h-full">
          <GlassCardContent className="p-0 flex flex-col h-full">
              <div className="flex-1 p-3 flex flex-col border-b border-white/10">
                  <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-1">Dado de Vida</label>
                      <GlassSelector<DiceType>
                          value={HIT_DIE_OPTIONS.includes(hitDiceValue) ? hitDiceValue : "d8"}
                          onChange={(val) => patchField("hitDiceTotal", Array.isArray(val) ? val[0] : val)}
                          options={HIT_DIE_OPTIONS.map((die) => ({
                              value: die,
                              label: die,
                              activeColor: colors.rarity[diceColors[die].rarity],
                              textColor: colors.rarity[diceColors[die].rarity]
                          }))}
                          layout="horizontal"
                          fullWidth
                          size="sm"
                          layoutId="sheet-hit-die"
                          disabled={isReadOnly}
                      />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 mt-2 items-center">
                      <SheetInput
                          compact
                          type="number"
                          label="Gasto"
                          value={watch("hitDiceUsed") || 0}
                          onChangeValue={(val) => patchField("hitDiceUsed", parseInt(val) || 0)}
                          showControls
                          min={0}
                          max={watch("level") || 1}
                          inputClassName="text-center text-xs h-6"
                          className="w-full"
                          readOnlyMode={isReadOnly}
                      />
                      <div className="flex flex-col items-center justify-center self-stretch min-w-[28px]">
                          <label className="text-[8px] font-black uppercase text-white/30">Max</label>
                          <span className="text-white/90 text-[10px] font-bold">{watch("level") || 1}</span>
                      </div>
                  </div>
              </div>
              <div className="flex-1 p-3 flex flex-col items-center justify-center">
                  <label className="text-[9px] font-black uppercase tracking-tighter text-white/40 mb-2 leading-none text-center">
                      Salvaguarda Contra Morte
                  </label>
                  <div className="flex flex-col gap-2 w-full max-w-[150px]">
                      <div className="flex items-center justify-between">
                          <div className="flex gap-1.5">
                              {[1, 2, 3].map((i) => (
                                  <button
                                      key={`s-${i}`}
                                      className={cn(
                                          "w-3 h-3 border border-white/30 rotate-45 transition-all rounded-sm",
                                          !isReadOnly && "cursor-pointer",
                                          (watch("deathSavesSuccess") || 0) >= i
                                              ? "bg-white/80 border-white shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                                              : "bg-transparent"
                                      )}
                                      disabled={isReadOnly}
                                      onClick={() => handleDeathSaveToggle("deathSavesSuccess", i)}
                                  />
                              ))}
                          </div>
                          <span className="text-[8px] font-black uppercase text-white/40">Sucessos</span>
                      </div>
                      <div className="flex items-center justify-between">
                          <div className="flex gap-1.5">
                              {[1, 2, 3].map((i) => (
                                  <button
                                      key={`f-${i}`}
                                      className={cn(
                                          "w-3 h-3 border border-white/30 rotate-45 transition-all rounded-sm",
                                          !isReadOnly && "cursor-pointer",
                                          (watch("deathSavesFailure") || 0) >= i
                                              ? "bg-white/80 border-white shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                                              : "bg-transparent"
                                      )}
                                      disabled={isReadOnly}
                                      onClick={() => handleDeathSaveToggle("deathSavesFailure", i)}
                                  />
                              ))}
                          </div>
                          <span className="text-[8px] font-black uppercase text-white/40">Falhas</span>
                      </div>
                  </div>
              </div>
          </GlassCardContent>
      </GlassCard>
  )

  const levelUpModal = (
   <GlassModal open={isLevelUpOpen} onOpenChange={handleLevelUpOpenChange}>
     <GlassModalContent size="full" className="w-[min(94vw,980px)]" bodyClassName="p-0">
       <div data-testid="level-up-modal" className="relative overflow-hidden">
         <div className="border-b border-white/10 bg-gradient-to-br from-emerald-500/12 via-white/[0.03] to-transparent px-6 py-6">
           <GlassModalHeader className="space-y-2 text-left">
             <GlassModalTitle className="text-3xl font-black tracking-tight text-white">
               Nível {level} -&gt; {nextLevel}
             </GlassModalTitle>
             <GlassModalDescription className="text-white/65">
               Confira o que muda antes de aplicar a progressão do personagem.
             </GlassModalDescription>
           </GlassModalHeader>
         </div>

         <div className="space-y-4 px-6 py-5">
           <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/8 p-4">
             <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">PV máximo</p>
                 <div className="mt-1 flex flex-wrap items-center gap-2">
                   <p className="text-2xl font-black text-white">
                     {hpMax} -&gt; {nextHpMax}
                   </p>
                   <span
                     data-testid="level-up-average-badge"
                     className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/65"
                   >
                     média
                   </span>
                 </div>
               </div>
               <div className="flex flex-col items-start gap-2 text-sm text-white/70">
                 <span>
                   Ganho de PV: <span className="font-bold text-white">{hpGainPreview}</span>
                 </span>
                 <div className="flex flex-wrap items-center gap-2">
                   <motion.button
                     type="button"
                     whileHover={{ scale: 1.01, y: -1 }}
                     whileTap={{ scale: 0.99 }}
                     onClick={() => setIsHpRollerVisible((current) => !current)}
                     className={cn(
                       "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black uppercase tracking-[0.22em] transition-colors",
                       isHpRollerVisible
                         ? "border-emerald-300/45 bg-emerald-500/16 text-emerald-50"
                         : "border-white/15 bg-white/[0.06] text-white/78 hover:border-emerald-300/35 hover:bg-emerald-500/12 hover:text-white",
                     )}
                     aria-label="Rolar ganho de pontos de vida"
                   >
                     <span>Rolar vida</span>
                     <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-black/10 px-2 py-1 text-[11px] normal-case tracking-normal">
                       <GlassDiceValue
                         value={{ quantidade: 1, tipo: hitDieForLevelUp }}
                         bonus={constitutionModifier}
                         className="text-inherit"
                       />
                     </span>
                   </motion.button>
                   {rolledHpGain != null && (
                     <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                       Resultado rolado: {rolledHpGain}
                     </span>
                   )}
                 </div>
               </div>
             </div>
             <AnimatePresence initial={false}>
               {isHpRollerVisible && (
                 <motion.div
                   initial={{ opacity: 0, height: 0, y: -8 }}
                   animate={{ opacity: 1, height: "auto", y: 0 }}
                   exit={{ opacity: 0, height: 0, y: -8 }}
                   transition={{ duration: 0.2, ease: "easeOut" }}
                   className="overflow-hidden"
                 >
                   <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
                     <DiceRollerPanel
                       preset={{
                         label: "PV ao subir de nível",
                         terms: [{ dice: hitDieForLevelUp, quantity: 1 }],
                         modifier: constitutionModifier,
                         source: "sheet",
                         sourceRef: { sheetId: sheet._id, fieldId: "level-up-hp" },
                       }}
                       hideConfigurationControls
                       onRollResolved={(result) => {
                         setRolledHpGain(result.total)
                         setIsHpRollerVisible(false)
                       }}
                     />
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>
           </div>

           <div className="space-y-4">
             <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
               <div className="mb-3 flex items-center justify-between gap-2">
                 <h3 className="text-sm font-black uppercase tracking-[0.28em] text-white/55">Novas traits</h3>
                 <span className="text-xs text-white/45">Exatamente no nível {nextLevel}</span>
               </div>
               {traitPreviewItems.length > 0 ? (
                 <div className="grid gap-3 xl:grid-cols-2">
                   {traitPreviewItems.map((traitPreview, index) => (
                     <div
                       key={`${traitPreview.source}-${traitPreview.trait._id}-${index}`}
                       className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                     >
                       <div className="mb-3 text-[10px] font-black uppercase tracking-[0.28em] text-white/45">
                         {traitPreview.source}
                       </div>
                       <TraitPreview
                         trait={traitPreview.trait}
                         showStatus={false}
                         hideStatusChip
                         hideActionIcons
                       />
                     </div>
                   ))}
                 </div>
               ) : (
                 <p className="text-sm text-white/55">Nenhuma trait nova neste nível.</p>
               )}
             </div>

             {resourceChargeChanges.length > 0 && (
               <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                 <h3 className="mb-3 text-sm font-black uppercase tracking-[0.28em] text-white/55">Mudanças de recursos</h3>
                 <div className="space-y-2">
                   {resourceChargeChanges.map((resourceChange) => (
                     <div
                       key={resourceChange.key}
                       className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2"
                     >
                       <span className="text-sm text-white/85">{resourceChange.name}</span>
                       <span className="text-sm font-bold text-white">
                         {resourceChange.currentTotal} -&gt; {resourceChange.nextTotal}
                       </span>
                     </div>
                   ))}
                 </div>
               </div>
             )}

             {(requiresSubclassSelection || requiresFeatSelection) && (
               <div className={cn("grid gap-4", requiresSubclassSelection && requiresFeatSelection && "lg:grid-cols-2")}>
                 {requiresSubclassSelection && (
                   <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                     <h3 className="mb-3 text-sm font-black uppercase tracking-[0.28em] text-white/55">Escolha de subclasse</h3>
                     <CompactRichInput
                       label="Subclasse"
                       value={levelUpSubclassValue}
                       onChange={(value) => {
                         setLevelUpSubclassValue(value)
                         setLevelUpValidationMessage(null)
                       }}
                       placeholder="@Campeão"
                       disabled={false}
                       specificEntityMention="Subclasse"
                       mentionParentClassId={subclassParentClassId}
                       openMentionsOnFocus
                     />
                     <p className="mt-2 text-xs text-white/50">Obrigatório para confirmar o nível 3.</p>
                   </div>
                 )}

                 {requiresFeatSelection && (
                   <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                     <h3 className="mb-3 text-sm font-black uppercase tracking-[0.28em] text-white/55">Escolha de talento</h3>
                     <CompactRichInput
                       label="Talento"
                       value={levelUpFeatValue}
                       onChange={(value) => {
                         setLevelUpFeatValue(value)
                         setLevelUpValidationMessage(null)
                       }}
                       placeholder="@Sortudo"
                       disabled={false}
                       specificEntityMention="Talento"
                       openMentionsOnFocus
                     />
                     <p className="mt-2 text-xs text-white/50">Obrigatório para confirmar o nível 4.</p>
                   </div>
                 )}
               </div>
             )}
           </div>

           {levelUpValidationMessage && (
             <p className="text-sm font-medium text-amber-200">{levelUpValidationMessage}</p>
           )}
         </div>

         <GlassModalFooter className="border-t border-white/10 px-6 py-5">
           <motion.button
             type="button"
             whileHover={{ scale: 1.01, y: -1 }}
             whileTap={{ scale: 0.99 }}
             onClick={handleConfirmLevelUp}
             className="inline-flex h-12 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/18 px-6 text-sm font-black uppercase tracking-[0.28em] text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.18)] transition-colors hover:bg-emerald-500/28"
           >
             Confirmar
           </motion.button>
         </GlassModalFooter>
       </div>
     </GlassModalContent>
   </GlassModal>
  )

  return {
   identityCard,
   levelCard,
   armorClassCard,
   hitPointsCard,
   hitDiceAndDeathSavesCard,
   levelUpModal,
  }
}

export function SheetHeader({ sheet, form, items = [], isReadOnly = false, isOwlbear = false }: SheetHeaderProps) {
  const sections = useSheetHeaderSections({ sheet, form, items, isReadOnly, isOwlbear })

  return (
    <>
      <div className="flex flex-col lg:flex-row items-stretch gap-2 w-full">
        <div className="flex-[4]">{sections.identityCard}</div>
        <div className="flex-none w-full lg:w-36">{sections.levelCard}</div>
        <div className="flex-none w-full lg:w-40">{sections.armorClassCard}</div>
        <div className="flex-[3] h-full">{sections.hitPointsCard}</div>
        <div className="flex-[2]">{sections.hitDiceAndDeathSavesCard}</div>
      </div>
      {sections.levelUpModal}
    </>
  )
}
