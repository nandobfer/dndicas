"use client"


import { useRef, useState } from "react"
import { motion } from "framer-motion"

import { SheetInput } from "./sheet-input"
import { CompactRichInput } from "./compact-rich-input"
import type { UseFormWatch } from "react-hook-form"
import type { CharacterSheet, CharacterItem, PatchSheetBody } from "../types/character-sheet.types"
import { cn } from "@/core/utils"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { colors, diceColors, type DiceType, type EntityType } from "@/lib/config/colors"
import { Table2 } from "lucide-react"
import { useClass } from "@/features/classes/api/classes-queries"
import { ClassProgressionTable } from "@/features/classes/components/class-progression-table"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { CalcTooltip } from "./calc-tooltip"

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
}

type UseSheetHeaderSectionsProps = SheetHeaderProps

export function useSheetHeaderSections({ sheet, form, items = [], isReadOnly = false }: UseSheetHeaderSectionsProps) {
  const { watch, setFieldLocally, patchField } = form
  const hitDiceValue = (watch("hitDiceTotal") || "d8") as DiceType
  const hpCurrent = watch("hpCurrent") ?? 0
  const hpTemp = watch("hpTemp") ?? 0
  const hpMax = watch("hpMax") ?? 0
  const [hpAdjustmentValue, setHpAdjustmentValue] = useState("0")
  const classRef = watch("classRef") ?? sheet.classRef
  const subclassRef = watch("subclassRef") ?? sheet.subclassRef
  const { data: currentClass } = useClass(classRef ?? null)
  const [isProgressionOpen, setIsProgressionOpen] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const selectedSubclasses = currentClass?.subclasses
    ?.filter((subclass) => String(subclass._id || "") === String(subclassRef || "")) ?? []

  const selectedSubclassData = selectedSubclasses
    .map((subclass) => ({
      name: subclass.name,
      color: subclass.color ?? colors.rarity.veryRare,
      traits: subclass.traits ?? [],
      progressionData: subclass.progressionTable,
    }))

  // Equipped armor/shield for AC calculation
  const equippedArmor = items.find(
    (item) => item.equipped && (item.catalogItemType === "armadura")
  ) ?? null
  const equippedShield = items.find(
    (item) => item.equipped && item.catalogItemType === "escudo"
  ) ?? null

  const currentSheet = { ...sheet, ...Object.fromEntries(
    Object.entries(watch()).filter(([, v]) => v !== undefined)
  ) } as CharacterSheet

  const calc = useCharacterCalculations(currentSheet, {
    equippedArmor: equippedArmor ? {
      ac: equippedArmor.catalogAc,
      acType: equippedArmor.catalogAcType,
      armorType: equippedArmor.catalogArmorType,
      acBonus: equippedArmor.catalogAcBonus,
    } : null,
    equippedShield: equippedShield ? {
      acBonus: equippedShield.catalogAcBonus,
    } : null,
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

  const hpCurrentWidth = hpMax > 0
    ? `${Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100))}%`
    : "0%"
  const hpTempWidth = hpMax > 0
    ? `${Math.max(0, Math.min(100, (hpTemp / hpMax) * 100))}%`
    : "0%"

  const identityCard = (
    <GlassCard className="border-white/10 bg-white/[0.02]">
      <GlassCardContent className="p-4 flex flex-col gap-4 h-full">
        <SheetInput
          label="Nome do Personagem"
          placeholder="NOME DO PERSONAGEM"
          value={watch("name") || ""}
          onChangeValue={(val) => patchField("name", val)}
          className="tracking-tight"
          readOnlyMode={isReadOnly}
        />

        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
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
            />
          ))}
        </div>
      </GlassCardContent>
    </GlassCard>
  )

  const levelCard = (
      <GlassCard className="border-white/10 bg-white/[0.02] h-full">
          <GlassCardContent className="p-4 flex flex-col items-center justify-center relative h-full gap-0">
              <div className="flex flex-col items-center z-10 gap-0">
                  <SheetInput
                      type="number"
                      label="Nível"
                      min={1}
                      max={20}
                      value={watch("level") || 1}
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
              {currentClass && (
                  <GlassPopover open={isProgressionOpen} onOpenChange={setIsProgressionOpen}>
                      <GlassPopoverTrigger asChild>
                          <button
                              type="button"
                              onMouseEnter={handleProgressionEnter}
                              onMouseLeave={handleProgressionLeave}
                              onClick={() => setIsProgressionOpen((prev) => !prev)}
                              className="mt-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full border border-amber-400/20 bg-amber-500/10 text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/15 transition-colors"
                              aria-label="Ver progressão da classe"
                          >
                              <Table2 className="w-3.5 h-3.5" />
                          </button>
                      </GlassPopoverTrigger>
                      <GlassPopoverContent
                          side="bottom"
                          align="center"
                          sideOffset={10}
                          className="w-[min(92vw,900px)] p-0"
                          onMouseEnter={handleProgressionEnter}
                          onMouseLeave={handleProgressionLeave}
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
                      </GlassPopoverContent>
                  </GlassPopover>
              )}
          </GlassCardContent>
      </GlassCard>
  )

  const armorClassCard = (
    <GlassCard className="border-white/10 bg-white/[0.03] h-full">
      <GlassCardContent className="p-4 flex flex-col items-center justify-center h-full">
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
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 px-3 pt-3 pb-1">
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

  return {
    identityCard,
    levelCard,
    armorClassCard,
    hitPointsCard,
    hitDiceAndDeathSavesCard,
  }
}

export function SheetHeader({ sheet, form, items = [], isReadOnly = false }: SheetHeaderProps) {
  const sections = useSheetHeaderSections({ sheet, form, items, isReadOnly })

  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-2 w-full">
      <div className="flex-[4]">{sections.identityCard}</div>
      <div className="flex-none w-full lg:w-36">{sections.levelCard}</div>
      <div className="flex-none w-full lg:w-40">{sections.armorClassCard}</div>
      <div className="flex-[3] h-full">{sections.hitPointsCard}</div>
      <div className="flex-[2]">{sections.hitDiceAndDeathSavesCard}</div>
    </div>
  )
}
