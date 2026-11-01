"use client"

import { TrendingUp } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/ui/select"
import { MADDOX_LEVEL_MAX, MADDOX_LEVEL_MIN, MADDOX_SHEET_RIGORS, type MaddoxRigorLevel } from "../../constants"

const LEVELS = Array.from({ length: MADDOX_LEVEL_MAX - MADDOX_LEVEL_MIN + 1 }, (_, index) => MADDOX_LEVEL_MIN + index)
const NOT_SET = "none"

/**
 * Nível inicial da mesa (graus com ficha), definido na entrevista de cenário: o dono ajusta antes de a campanha começar.
 * As fichas já criadas mantêm o nível delas.
 */
export function StartingLevelField({ rigor, value, onChange, disabled }: { rigor: MaddoxRigorLevel; value: number | null; onChange: (value: number) => void; disabled?: boolean }) {
    if (!MADDOX_SHEET_RIGORS.includes(rigor)) return null
    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="starting-level-field">
            <p id="maddox-starting-level-label" className="flex items-center gap-2 text-sm font-medium text-white">
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden /> Nível inicial
            </p>
            <p className="text-xs text-white/60">
                {value ? "Todos os personagens começam neste nível. Fichas já criadas mantêm o nível delas." : "Ainda não definido: o Maddox combina o nível na entrevista de cenário (ou com cada jogador)."}
            </p>
            <Select value={value ? String(value) : NOT_SET} onValueChange={(next) => next !== NOT_SET && onChange(Number(next))} disabled={disabled}>
                <SelectTrigger aria-labelledby="maddox-starting-level-label" className="h-10 w-40">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {!value && <SelectItem value={NOT_SET}>Não definido</SelectItem>}
                    {LEVELS.map((level) => (
                        <SelectItem key={level} value={String(level)}>
                            Nível {level}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
