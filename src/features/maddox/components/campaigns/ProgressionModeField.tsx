"use client"

import { Milestone } from "lucide-react"
import { GlassSelector } from "@/components/ui/glass-selector"
import { MADDOX_PROGRESSION_DEFAULT, MADDOX_PROGRESSION_MODE_DEFS, MADDOX_PROGRESSION_MODES, MADDOX_SHEET_RIGORS, type MaddoxProgressionMode, type MaddoxRigorLevel } from "../../constants"

/**
 * Progressão de nível (DND-56): "Marco" ou "Experiência", só nos graus com ficha. Escolhida na criação; no Editar
 * campanha aparece só para leitura (`readOnly`).
 */
export function ProgressionModeField({ rigor, value, onChange, readOnly = false }: { rigor: MaddoxRigorLevel; value: MaddoxProgressionMode | null | undefined; onChange?: (value: MaddoxProgressionMode) => void; readOnly?: boolean }) {
    if (!MADDOX_SHEET_RIGORS.includes(rigor)) return null
    const current = value ?? MADDOX_PROGRESSION_DEFAULT
    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="progression-mode-field">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
                <Milestone className="h-4 w-4 text-primary" aria-hidden /> Progressão de nível
            </p>
            <p className="text-xs text-white/60">{readOnly ? `${MADDOX_PROGRESSION_MODE_DEFS[current].description} Definida na criação da campanha.` : "Escolhida só agora: depois da criação, não muda mais."}</p>
            {readOnly ? (
                <p className="text-sm font-semibold text-white" data-testid="progression-mode-value">
                    {MADDOX_PROGRESSION_MODE_DEFS[current].label}
                </p>
            ) : (
                <>
                    <GlassSelector<MaddoxProgressionMode> value={current} onChange={(next) => onChange?.(next as MaddoxProgressionMode)} options={MADDOX_PROGRESSION_MODES.map((mode) => ({ value: mode, label: MADDOX_PROGRESSION_MODE_DEFS[mode].label }))} size="sm" />
                    <p className="text-xs text-white/55">{MADDOX_PROGRESSION_MODE_DEFS[current].description}</p>
                </>
            )}
        </div>
    )
}
