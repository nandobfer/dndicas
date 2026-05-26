"use client"

import { ShieldAlert } from "lucide-react"
import { GlassSelector, type GlassSelectorOption } from "@/components/ui/glass-selector"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { damageTypeColors } from "@/lib/config/colors"
import type { DamageTypeKey } from "@/lib/config/damage-types-hex"
import { cn } from "@/core/utils"

export type DamageDefenseState = "V" | "R" | "I" | undefined
type DamageDefenseChoice = Exclude<DamageDefenseState, undefined>

const SELECTOR_OPTIONS: GlassSelectorOption<DamageDefenseChoice>[] = [
    { value: "V", label: <SimpleGlassTooltip content="Vulnerável"><span>V</span></SimpleGlassTooltip>, activeColor: "bg-amber-500/20", textColor: "text-amber-400" },
    { value: "R", label: <SimpleGlassTooltip content="Resistente"><span>R</span></SimpleGlassTooltip>, activeColor: "bg-blue-500/20", textColor: "text-blue-400" },
    { value: "I", label: <SimpleGlassTooltip content="Imune"><span>I</span></SimpleGlassTooltip>, activeColor: "bg-red-500/20", textColor: "text-red-400" },
]

export function MonsterDefenseSelector({ value, onChange }: { value: Partial<Record<DamageTypeKey, DamageDefenseState>>; onChange: (value: Partial<Record<DamageTypeKey, DamageDefenseState>>) => void }) {
    const entries = Object.entries(damageTypeColors) as [DamageTypeKey, (typeof damageTypeColors)[DamageTypeKey]][]
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Defesas por Tipo de Dano
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {entries.map(([key, config]) => (
                    <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: config.hex }} />
                            <span className="text-xs font-bold capitalize" style={{ color: config.hex }}>{config.keys[0]}</span>
                        </div>
                        <GlassSelector<DamageDefenseChoice>
                            value={value[key]}
                            onChange={(next) => {
                                const selected = Array.isArray(next) ? next[0] : next
                                onChange({ ...value, [key]: selected === value[key] ? undefined : selected })
                            }}
                            options={SELECTOR_OPTIONS}
                            size="sm"
                            fullWidth
                            layoutId={`monster-defense-${key}`}
                            className={cn("w-full")}
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
