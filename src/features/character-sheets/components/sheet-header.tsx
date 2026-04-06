"use client"



import { Search, Shield, Heart, Dice5, Skull, Zap } from "lucide-react"
import { SheetInput } from "./sheet-input"
import { LongRestButton } from "./long-rest-button"
import type { PatchSheetBody, CharacterSheet } from "../types/character-sheet.types"
import { usePatchSheet } from "../api/character-sheets-queries"
import { cn } from "@/core/utils"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"

interface SheetHeaderProps {
    sheet: CharacterSheet
    form: any // Using specific hook return type instead of UseFormReturn
}

export function SheetHeader({ sheet, form }: SheetHeaderProps) {
  const { watch, patchField } = form
  const { isPending: isLoading } = usePatchSheet(sheet?._id)
  const { armorClass } = useCharacterCalculations(sheet)

  const handleDeathSaveToggle = (field: "deathSavesSuccess" | "deathSavesFailure", index: number) => {
    const current = watch(field) || 0
    if (current === index) {
      patchField(field, index - 1)
    } else {
      patchField(field, index)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-2 w-full">
      {/* 1. NOME E IDENTIDADE */}
      <GlassCard className="flex-[4] border-white/10 bg-white/[0.02]">
        <GlassCardContent className="p-4 flex flex-col gap-4 h-full">
          {/* Nome do Personagem */}
          <SheetInput
            label="Nome do Personagem"
            placeholder="NOME DO PERSONAGEM"
            value={watch("name") || ""}
            onChangeValue={(val) => patchField("name", val)}
            debounceMs={1000}
            className="tracking-tight"
          />

          {/* Grid de Identidade */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {[
              { label: "Antecedente", field: "origin" },
              { label: "Classe", field: "class" },
              { label: "Espécie", field: "race" },
              { label: "Subclasse", field: "subclass" },
            ].map((item) => (
              <SheetInput
                key={item.field}
                compact
                label={item.label}
                value={watch(item.field as any) || ""}
                onChangeValue={(val) => patchField(item.field as any, val)}
                debounceMs={1000}
              />
            ))}
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* 2. NÍVEL E XP */}
      <GlassCard className="flex-none w-32 border-white/10 bg-white/[0.02]">
        <GlassCardContent className="p-4 flex flex-col items-center justify-center relative h-full gap-0">
          <div className="absolute inset-4 border border-white/10 rounded-full pointer-events-none" />
          <div className="flex flex-col items-center z-10 gap-0">
            <SheetInput
              type="number"
              label="Nível"
              value={watch("level") || 1}
              onChangeValue={(val) => patchField("level", parseInt(val) || 1)}
              showControls
              inputClassName="text-3xl font-black text-center h-10 px-0"
              className="items-center w-24"
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
              debounceMs={1000}
            />
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* 3. CLASSE DE ARMADURA */}
      <GlassCard className="flex-none w-28 border-white/10 bg-white/[0.03]">
        <GlassCardContent className="p-4 flex flex-col items-center justify-center h-full">
          <div className="relative w-full aspect-[4/5] flex flex-col items-center justify-between p-3 border border-white/20 bg-white/5 rounded-b-[45%] rounded-t-sm group transition-colors">
            <label className="text-[8px] font-black uppercase text-center leading-tight text-white/40 z-10">
              Classe de
              <br />
              Armadura
            </label>
            <div className="text-3xl font-black text-white z-10">{armorClass.value}</div>
            <button type="button" onClick={() => patchField("hasShield", !watch("hasShield"))} className="flex flex-col items-center w-full z-10 group/shield">
              <label className={cn("text-[8px] font-black uppercase transition-colors", watch("hasShield") ? "text-white" : "text-white/40 group-hover/shield:text-white/60")}>
                Escudo
              </label>
              <div
                className={cn(
                  "w-2.5 h-2.5 rotate-45 border transition-all mt-1",
                  watch("hasShield") ? "bg-white border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "bg-white/5 border-white/20 group-hover/shield:border-white/40",
                )}
              />
            </button>
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* 4. PONTOS DE VIDA */}
      <GlassCard className="flex-[3] border-white/10 bg-white/[0.02]">
        <GlassCardContent className="p-0 flex flex-col h-full">
          <div className="text-center py-1.5 border-b border-white/10 bg-white/[0.03]">
            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Pontos de Vida</label>
          </div>
          <div className="flex h-full items-stretch">
            <div className="flex-[2] flex flex-col p-4 items-center justify-center relative">
              <SheetInput
                type="number"
                label="Atual"
                value={watch("hpCurrent") || 0}
                onChangeValue={(val) => patchField("hpCurrent", parseInt(val) || 0)}
                showControls
                inputClassName="text-5xl h-20 text-center"
                className="items-center"
                debounceMs={1000}
              />
            </div>
            <div className="w-[1px] bg-white/10 self-stretch my-4" />
            <div className="flex-1 flex flex-col p-2 gap-2">
              <SheetInput
                compact
                type="number"
                label="Temp"
                value={watch("hpTemp") || 0}
                onChangeValue={(val) => patchField("hpTemp", parseInt(val) || 0)}
                showControls
                inputClassName="text-center text-lg h-8"
                className="bg-white/5 rounded-lg border border-white/5 px-1"
                debounceMs={1000}
              />
              <SheetInput
                compact
                type="number"
                label="Máximo"
                value={watch("hpMax") || 0}
                onChangeValue={(val) => patchField("hpMax", parseInt(val) || 0)}
                showControls
                inputClassName="text-center text-lg h-8"
                className="bg-white/5 rounded-lg border border-white/5 px-1"
                debounceMs={1000}
              />
            </div>
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* 5. DADOS E SALVAGUARDA */}
      <GlassCard className="flex-[2] border-white/10 bg-white/[0.02] min-w-[200px]">
        <GlassCardContent className="p-0 flex flex-col h-full">
          <div className="flex-1 p-3 flex flex-col border-b border-white/10">
            <SheetInput
              compact
              label="Dados de Vida (Total)"
              value={watch("hitDiceTotal") || "d8"}
              onChangeValue={(val) => patchField("hitDiceTotal", val)}
              inputClassName="text-center text-xl py-1 bg-white/5 rounded-lg border border-white/5"
              debounceMs={1000}
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <SheetInput
                compact
                type="number"
                label="Gasto"
                value={watch("hitDiceUsed") || 0}
                onChangeValue={(val) => patchField("hitDiceUsed", parseInt(val) || 0)}
                showControls
                inputClassName="text-center text-xs h-6"
                debounceMs={1000}
              />
              <div className="flex flex-col items-end pt-1 pr-1">
                <label className="text-[8px] font-black uppercase text-white/30">Max</label>
                <span className="text-white/40 text-[10px] font-bold">Total</span>
              </div>
            </div>
          </div>
          <div className="flex-1 p-3 flex flex-col items-center justify-center">
            <label className="text-[9px] font-black uppercase tracking-tighter text-white/40 mb-2 leading-none text-center">Salvaguarda Contra Morte</label>
            <div className="flex flex-col gap-2 w-full max-w-[150px]">
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((i) => (
                    <button
                      key={`s-${i}`}
                      className={cn(
                        "w-3 h-3 border border-white/30 rotate-45 transition-all rounded-sm",
                        (watch("deathSavesSuccess") || 0) >= i ? "bg-white/80 border-white shadow-[0_0_8px_rgba(255,255,255,0.3)]" : "bg-transparent",
                      )}
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
                        (watch("deathSavesFailure") || 0) >= i ? "bg-white/80 border-white shadow-[0_0_8px_rgba(255,255,255,0.3)]" : "bg-transparent",
                      )}
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
    </div>
  )
}