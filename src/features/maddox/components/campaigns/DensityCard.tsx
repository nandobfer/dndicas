"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, type UseFormReturn } from "react-hook-form"
import { AlignLeft, Sparkles } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Slider } from "@/components/ui/opex/slider"
import { rarityColors } from "@/lib/config/colors"
import { MADDOX_DEFAULT_DENSITY, MADDOX_DENSITY_LEVEL_DEFS, MADDOX_DENSITY_LEVELS } from "../../constants"
import type { CreateMaddoxCampaignInput } from "../../campaign-schemas"
import { densityColor, densityDef } from "./campaign-visuals"

const MARKS = MADDOX_DENSITY_LEVELS.map((level, index) => ({ value: index, label: MADDOX_DENSITY_LEVEL_DEFS[level].label }))

/**
 * Densidade das narrações (DND-22) em steps com rótulos, no mesmo modelo do card de rigor: cores de raridade, a descrição
 * do nível escolhido e, abaixo, o tamanho orientado de cada narração e o que muda. Pode mudar a qualquer momento.
 */
export function DensityCard({ form, disabled = false }: { form: UseFormReturn<CreateMaddoxCampaignInput>; disabled?: boolean }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Densidade das narrações</CardTitle>
                <CardDescription>Quanto texto o Maddox escreve a cada narração: de cenas curtas e diretas até narrações longas, como um capítulo de livro.</CardDescription>
            </CardHeader>
            <CardContent>
                <Controller
                    control={form.control}
                    name="density"
                    render={({ field }) => {
                        const value = field.value ?? MADDOX_DEFAULT_DENSITY
                        const index = Math.max(0, MADDOX_DENSITY_LEVELS.indexOf(value))
                        const def = densityDef(value)
                        const color = densityColor(value)
                        return (
                            <div className="space-y-5">
                                <div className="px-7 pb-2">
                                    <Slider
                                        id="maddox-density"
                                        aria-label="Densidade das narrações da campanha"
                                        min={0}
                                        max={MADDOX_DENSITY_LEVELS.length - 1}
                                        step={1}
                                        value={index}
                                        onChange={(next) => field.onChange(MADDOX_DENSITY_LEVELS[next] ?? value)}
                                        onBlur={field.onBlur}
                                        formatValue={(step) => densityDef(MADDOX_DENSITY_LEVELS[step]).label}
                                        marks={MARKS}
                                        color={color}
                                        disabled={disabled}
                                    />
                                </div>
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div key={value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-3">
                                        <p className="text-sm" data-testid="maddox-density-description">
                                            <span className="font-semibold" style={{ color }}>
                                                {def.label}:
                                            </span>{" "}
                                            <span className="text-white/70">{def.description}</span>
                                        </p>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-lg border p-3" style={{ borderColor: `${color}4d`, backgroundColor: `${color}0d` }}>
                                                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
                                                    <AlignLeft className="h-4 w-4" aria-hidden /> Tamanho por narração
                                                </p>
                                                <ul className="space-y-1 text-xs text-muted-foreground">
                                                    <li data-testid="maddox-density-size">• {def.size}</li>
                                                </ul>
                                            </div>
                                            <div className="rounded-lg border p-3" style={{ borderColor: `${rarityColors.common}4d`, backgroundColor: `${rarityColors.common}0d` }}>
                                                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-white/80">
                                                    <Sparkles className="h-4 w-4" aria-hidden /> O que muda
                                                </p>
                                                <ul className="space-y-1 text-xs text-muted-foreground">
                                                    {def.focus.map((item) => (
                                                        <li key={item}>• {item}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                                <p className="text-xs text-muted-foreground">
                                    Vale só para as narrações do Maddox (as respostas às perguntas continuam curtas) e pode mudar a qualquer momento, valendo a partir da próxima narração.
                                </p>
                            </div>
                        )
                    }}
                />
            </CardContent>
        </Card>
    )
}
