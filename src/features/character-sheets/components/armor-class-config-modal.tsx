"use client"

import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassSwitch } from "@/components/ui/glass-switch"
import { attributeColors } from "@/lib/config/colors"

import type { AttributeType, UnarmoredDefenseConfig } from "../types/character-sheet.types"
import { SheetInput } from "./sheet-input"

type UnarmoredDefenseInput = Partial<UnarmoredDefenseConfig> & { attribute?: AttributeType | null }

interface ArmorClassConfigModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  armorClassBonus: number | null
  unarmoredDefense?: UnarmoredDefenseInput | null
  isReadOnly?: boolean
  onArmorClassBonusChange: (value: number) => void
  onUnarmoredDefenseChange: (value: UnarmoredDefenseConfig) => void
}

const DEFAULT_UNARMORED_DEFENSE: UnarmoredDefenseConfig = { enabled: false, base: 10, attributes: [] }

const SHEET_ATTRIBUTE_COLOR_KEY = {
  strength: "Força",
  dexterity: "Destreza",
  constitution: "Constituição",
  intelligence: "Inteligência",
  wisdom: "Sabedoria",
  charisma: "Carisma",
} as const satisfies Record<AttributeType, keyof typeof attributeColors>

const ATTRIBUTE_OPTIONS = (Object.entries(SHEET_ATTRIBUTE_COLOR_KEY) as Array<[AttributeType, keyof typeof attributeColors]>).map(([value, key]) => {
  const config = attributeColors[key]
  return {
    value,
    label: config.name,
    activeColor: config.hex,
    textColor: config.hex,
  }
})

function normalizeUnarmoredDefense(value?: UnarmoredDefenseInput | null): UnarmoredDefenseConfig {
  const attributes = Array.isArray(value?.attributes)
    ? value.attributes
    : value?.attribute
      ? [value.attribute]
      : []

  return {
    enabled: value?.enabled ?? DEFAULT_UNARMORED_DEFENSE.enabled,
    base: value?.base ?? DEFAULT_UNARMORED_DEFENSE.base,
    attributes,
  }
}

export function ArmorClassConfigModal({
  open,
  onOpenChange,
  armorClassBonus,
  unarmoredDefense,
  isReadOnly = false,
  onArmorClassBonusChange,
  onUnarmoredDefenseChange,
}: ArmorClassConfigModalProps) {
  const normalizedUnarmoredDefense = normalizeUnarmoredDefense(unarmoredDefense)

  const patchUnarmoredDefense = (updates: Partial<UnarmoredDefenseConfig>) => {
    onUnarmoredDefenseChange({ ...normalizedUnarmoredDefense, ...updates })
  }

  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="md" className="w-[min(92vw,520px)]">
        <GlassModalHeader className="pr-8 text-left">
          <GlassModalTitle>Configurar Classe de Armadura</GlassModalTitle>
          <GlassModalDescription>
            Ajuste bônus fixos e regras usadas quando o personagem não estiver usando armadura.
          </GlassModalDescription>
        </GlassModalHeader>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <SheetInput
              compact
              type="number"
              label="Bônus de CA"
              value={armorClassBonus ?? 0}
              onChangeValue={(val) => onArmorClassBonusChange(parseInt(val, 10) || 0)}
              showControls
              inputClassName="text-center text-sm h-8"
              className="items-center"
              readOnlyMode={isReadOnly}
            />
            <p className="mt-2 text-xs text-white/45">Este bônus continua somando à CA em todos os cenários.</p>
          </div>

          <div className="space-y-4 rounded-xl border border-amber-300/15 bg-amber-500/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-amber-100/85">Defesa sem Armadura</p>
                <p className="mt-1 text-xs text-white/52">Aplicada somente quando nenhuma armadura estiver equipada.</p>
              </div>
              <GlassSwitch
                checked={normalizedUnarmoredDefense.enabled}
                onCheckedChange={(checked) => patchUnarmoredDefense({ enabled: checked })}
                disabled={isReadOnly}
                aria-label="Ativar Defesa sem Armadura"
              />
            </div>

            <div className="space-y-3">
              <SheetInput
                compact
                type="number"
                label="CA base"
                min={1}
                max={30}
                value={normalizedUnarmoredDefense.base}
                onChangeValue={(val) => patchUnarmoredDefense({ base: parseInt(val, 10) || 10 })}
                showControls
                inputClassName="text-center text-sm h-8"
                className="items-center"
                readOnlyMode={isReadOnly}
              />
              <div className="space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Atributos bônus</p>
                <GlassSelector<AttributeType>
                  value={normalizedUnarmoredDefense.attributes}
                  onChange={(value) => {
                    patchUnarmoredDefense({ attributes: Array.isArray(value) ? value : [value] })
                  }}
                  options={ATTRIBUTE_OPTIONS}
                  mode="multi"
                  layout="grid"
                  cols={2}
                  smCols={3}
                  fullWidth
                  size="sm"
                  disabled={isReadOnly}
                  layoutId="sheet-unarmored-defense-attributes"
                />
              </div>
            </div>
          </div>
        </div>
      </GlassModalContent>
    </GlassModal>
  )
}
