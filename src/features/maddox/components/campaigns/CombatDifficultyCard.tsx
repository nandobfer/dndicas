"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, type UseFormReturn } from "react-hook-form"
import { Feather, Swords } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Slider } from "@/components/ui/opex/slider"
import { rarityColors } from "@/lib/config/colors"
import { MADDOX_COMBAT_DIFFICULTY_DEFAULT, MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS, MADDOX_COMBAT_DIFFICULTY_LEVELS } from "../../constants"
import type { CreateMaddoxCampaignInput } from "../../campaign-schemas"
import { combatDifficultyColor, combatDifficultyDef } from "./campaign-visuals"

const MARKS = MADDOX_COMBAT_DIFFICULTY_LEVELS.map((level, index) => ({ value: index, label: MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS[level].label }))

/**
 * Dificuldade dos combates (DND-42) em steps com rótulos, no modelo do card de densidade e com as colunas do card de rigor:
 * o que muda nos encontros e o que fica com o Maddox. Só nos graus táticos (quem monta decide); muda a qualquer momento.
 */
export function CombatDifficultyCard({ form, disabled = false }: { form: UseFormReturn<CreateMaddoxCampaignInput>; disabled?: boolean }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Dificuldade dos combates</CardTitle>
                <CardDescription>Como o Maddox balanceia os adversários contra o grupo nos combates táticos: de encontros sempre favoráveis até lutas mortais.</CardDescription>
            </CardHeader>
            <CardContent>
                <Controller
                    control={form.control}
                    name="combatDifficulty"
                    render={({ field }) => {
                        const value = field.value ?? MADDOX_COMBAT_DIFFICULTY_DEFAULT
                        const index = Math.max(0, MADDOX_COMBAT_DIFFICULTY_LEVELS.indexOf(value))
                        const def = combatDifficultyDef(value)
                        const color = combatDifficultyColor(value)
                        return (
                            <div className="space-y-5">
                                <div className="px-7 pb-2">
                                    <Slider
                                        id="maddox-combat-difficulty"
                                        aria-label="Dificuldade dos combates da campanha"
                                        min={0}
                                        max={MADDOX_COMBAT_DIFFICULTY_LEVELS.length - 1}
                                        step={1}
                                        value={index}
                                        onChange={(next) => field.onChange(MADDOX_COMBAT_DIFFICULTY_LEVELS[next] ?? value)}
                                        onBlur={field.onBlur}
                                        formatValue={(step) => combatDifficultyDef(MADDOX_COMBAT_DIFFICULTY_LEVELS[step]).label}
                                        marks={MARKS}
                                        color={color}
                                        disabled={disabled}
                                    />
                                </div>
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div key={value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-3">
                                        <p className="text-sm" data-testid="maddox-combat-difficulty-description">
                                            <span className="font-semibold" style={{ color }}>
                                                {def.label}:
                                            </span>{" "}
                                            <span className="text-white/70">{def.description}</span>
                                        </p>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-lg border p-3" style={{ borderColor: `${color}4d`, backgroundColor: `${color}0d` }}>
                                                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
                                                    <Swords className="h-4 w-4" aria-hidden /> Nos encontros
                                                </p>
                                                <ul className="space-y-1 text-xs text-muted-foreground">
                                                    {def.rules.map((item) => (
                                                        <li key={item}>• {item}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="rounded-lg border p-3" style={{ borderColor: `${rarityColors.common}4d`, backgroundColor: `${rarityColors.common}0d` }}>
                                                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-white/80">
                                                    <Feather className="h-4 w-4" aria-hidden /> Fica com o Maddox
                                                </p>
                                                <ul className="space-y-1 text-xs text-muted-foreground">
                                                    {def.free.map((item) => (
                                                        <li key={item}>• {item}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                                <p className="text-xs text-muted-foreground">
                                    Vale só para os combates táticos (Rigoroso e Fiel ao D&D) e pode mudar a qualquer momento, valendo a partir do próximo combate.
                                </p>
                            </div>
                        )
                    }}
                />
            </CardContent>
        </Card>
    )
}
