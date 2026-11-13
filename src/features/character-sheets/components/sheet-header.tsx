"use client"


import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { Settings } from "lucide-react"

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
import { colors, diceColors, type DiceType, type EntityType } from "@/lib/config/colors"
import { useClass } from "@/features/classes/api/classes-queries"
import { ClassProgressionTable } from "@/features/classes/components/class-progression-table"
import { xpToNextLevel } from "../utils/sheet-rules"
import { useSheetLevelUpStatus } from "../api/character-sheets-queries"
import { LevelUpWizard } from "./level-up/level-up-wizard"
import { LevelUpBanner, useAutoOpenLevelUp } from "./level-up/level-up-banner"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { CalcTooltip } from "./calc-tooltip"
import { ArmorClassConfigModal } from "./armor-class-config-modal"
import {
  getActiveClassMentions,
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

export function buildCharacterPortraitAIPayload(sheet: CharacterSheet, items: CharacterItem[]) {
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
    notes: undefined,
    notePages: undefined,
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
  const [hpAdjustmentValue, setHpAdjustmentValue] = useState("0")
  const classRef = watch("classRef") ?? sheet.classRef
  const subclassRef = watch("subclassRef") ?? sheet.subclassRef
  const classValue = String(watch("class") ?? sheet.class ?? "")
  const activeClassMentionId = getActiveClassMentions(classValue)[0]?.id ?? null
  const subclassParentClassId = classRef ?? activeClassMentionId
  const { data: currentClass } = useClass(subclassParentClassId ?? null)
  const [isProgressionOpen, setIsProgressionOpen] = useState(false)
  const [isArmorClassConfigOpen, setIsArmorClassConfigOpen] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // DND-56: a subida é feita pelo wizard do servidor (`LevelUpWizard`). Em ficha de campanha Maddox com nível, ela só abre
  // com a subida pendente declarada pelo Maddox (marco) ou pela XP, e o campo XP do modo Experiência é só do Maddox.
  const [isLevelUpOpen, setIsLevelUpOpen] = useState(false)
  const levelUpStatus = useSheetLevelUpStatus(sheet._id, !isReadOnly)
  const campaignLevelUp = levelUpStatus.data?.campaign ?? null
  const pendingLevelUp = campaignLevelUp && campaignLevelUp.stepId && !campaignLevelUp.blocked ? campaignLevelUp : null
  const canOpenLevelUp = !isReadOnly && !!currentClass && level < 20 && (!campaignLevelUp || Boolean(pendingLevelUp))
  const levelLocked = Boolean(campaignLevelUp)
  const experienceLocked = campaignLevelUp?.mode === "experiencia"
  const experience = Number(watch("experience") ?? sheet.experience ?? 0) || 0
  const experienceToNext = xpToNextLevel(experience, level)
  useAutoOpenLevelUp(pendingLevelUp?.stepId ?? null, () => setIsLevelUpOpen(true))

  const selectedSubclasses = currentClass?.subclasses
    ?.filter((subclass) => String(subclass._id || "") === String(subclassRef || "")) ?? []

  const selectedSubclassData = selectedSubclasses
    .map((subclass) => ({
      name: subclass.name,
      color: subclass.color ?? colors.rarity.veryRare,
      traits: subclass.traits ?? [],
      progressionData: subclass.progressionTable,
    }))

  const unarmoredDefense = watch("unarmoredDefense") ?? sheet.unarmoredDefense

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

  const exhaustion = watch("exhaustion") ?? sheet.exhaustion ?? 0
  const handleExhaustionToggle = (index: number) => {
    if (isReadOnly) return
    patchField("exhaustion", exhaustion === index ? index - 1 : index)
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
                aspectRatio="portrait"
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
            showControls={!levelLocked}
            inputClassName="text-3xl font-black text-center h-10 px-0"
            className="items-center w-24"
            readOnlyMode={isReadOnly || levelLocked}
          />
        </div>
        <div className="mt-6 flex flex-col items-center z-10">
          <SheetInput
            compact
            type="number"
            label="XP"
            placeholder="0"
            className="w-20"
            inputClassName="text-center"
            min={0}
            value={experience}
            onChangeValue={(val) => patchField("experience", Math.max(0, parseInt(val, 10) || 0))}
            readOnlyMode={isReadOnly || experienceLocked}
          />
          {experienceToNext && (
            <p data-testid="experience-to-next" className="mt-1 text-center text-[9px] leading-tight text-white/45">
              Faltam {experienceToNext.missing.toLocaleString("pt-BR")} XP para o nível {level + 1}
            </p>
          )}
          {experienceLocked && <p className="mt-0.5 text-center text-[9px] leading-tight text-white/35">Controlado pelo Maddox</p>}
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
              setIsLevelUpOpen(true)
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
            <motion.button
              type="button"
              whileHover={!isReadOnly ? { scale: 1.03 } : undefined}
              whileTap={!isReadOnly ? { scale: 0.97 } : undefined}
              disabled={isReadOnly}
              onClick={() => setIsArmorClassConfigOpen(true)}
              aria-label="Configurar Classe de Armadura"
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                unarmoredDefense?.enabled
                  ? "border-amber-300/40 bg-amber-500/15 text-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.16)]"
                  : "border-white/15 bg-white/[0.06] text-white/65 hover:border-white/25 hover:bg-white/[0.1] hover:text-white",
                isReadOnly && "cursor-not-allowed opacity-60"
              )}
            >
              <Settings className="h-3.5 w-3.5" />
            </motion.button>
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

  const armorClassConfigModal = (
    <ArmorClassConfigModal
      open={isArmorClassConfigOpen}
      onOpenChange={setIsArmorClassConfigOpen}
      armorClassBonus={armorClassBonus}
      unarmoredDefense={unarmoredDefense}
      isReadOnly={isReadOnly}
      onArmorClassBonusChange={(value) => patchField("armorClassBonus", value)}
      onUnarmoredDefenseChange={(value) => patchField("unarmoredDefense", value)}
    />
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
                  <div className="mt-3 w-full max-w-[150px] border-t border-white/10 pt-2" data-testid="sheet-exhaustion" title="−2 em todos os testes de d20 por nível; no nível 6, o personagem morre.">
                      <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                              {[1, 2, 3, 4, 5, 6].map((i) => (
                                  <button
                                      key={`e-${i}`}
                                      type="button"
                                      aria-label={`Exaustão nível ${i}`}
                                      aria-pressed={exhaustion >= i}
                                      className={cn(
                                          "w-2.5 h-2.5 rounded-full border transition-all",
                                          !isReadOnly && "cursor-pointer",
                                          exhaustion >= i ? "border-red-300 bg-red-400/80 shadow-[0_0_6px_rgba(248,113,113,0.5)]" : "border-white/30 bg-transparent",
                                      )}
                                      disabled={isReadOnly}
                                      onClick={() => handleExhaustionToggle(i)}
                                  />
                              ))}
                          </div>
                          <span className="text-[8px] font-black uppercase text-white/40">Exaustão {exhaustion}</span>
                      </div>
                  </div>
              </div>
          </GlassCardContent>
      </GlassCard>
  )

  const levelUpModal = (
    <LevelUpWizard sheetId={sheet._id} open={isLevelUpOpen} onOpenChange={setIsLevelUpOpen} characterName={stripHtml(sheet.name) || null} />
  )

  const levelUpBanner = pendingLevelUp && !isReadOnly ? (
    <LevelUpBanner toLevel={pendingLevelUp.toLevel ?? level + 1} onOpen={() => setIsLevelUpOpen(true)} />
  ) : null

  return {
   identityCard,
   levelCard,
    armorClassCard,
    armorClassConfigModal,
    hitPointsCard,
   hitDiceAndDeathSavesCard,
   levelUpModal,
   levelUpBanner,
  }
}

export function SheetHeader({ sheet, form, items = [], isReadOnly = false, isOwlbear = false }: SheetHeaderProps) {
  const sections = useSheetHeaderSections({ sheet, form, items, isReadOnly, isOwlbear })

  if (isOwlbear) {
    return (
      <>
        {sections.levelUpBanner}
        <div className="space-y-2">
          <div>{sections.identityCard}</div>
          <div className="flex items-stretch gap-2 w-full">
            <div className="flex-none w-36">{sections.levelCard}</div>
            <div className="flex-none w-40">{sections.armorClassCard}</div>
            <div className="flex-[3] h-full">{sections.hitPointsCard}</div>
            <div className="flex-[2]">{sections.hitDiceAndDeathSavesCard}</div>
          </div>
        </div>
        {sections.levelUpModal}
        {sections.armorClassConfigModal}
      </>
    )
  }

  return (
    <>
      {sections.levelUpBanner}
      <div className="flex flex-col lg:flex-row items-stretch gap-2 w-full">
        <div className="flex-[4]">{sections.identityCard}</div>
        <div className="flex-none w-full lg:w-36">{sections.levelCard}</div>
        <div className="flex-none w-full lg:w-40">{sections.armorClassCard}</div>
        <div className="flex-[3] h-full">{sections.hitPointsCard}</div>
        <div className="flex-[2]">{sections.hitDiceAndDeathSavesCard}</div>
      </div>
      {sections.levelUpModal}
      {sections.armorClassConfigModal}
    </>
  )
}
