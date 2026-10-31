"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, type UseFormReturn } from "react-hook-form"
import { Dices, Feather } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Slider } from "@/components/ui/opex/slider"
import { rarityColors } from "@/lib/config/colors"
import { MADDOX_RIGOR_LEVEL_DEFS, MADDOX_RIGOR_LEVELS } from "../../constants"
import type { CreateMaddoxCampaignInput } from "../../campaign-schemas"
import { rigorColor } from "./campaign-visuals"

const MARKS = MADDOX_RIGOR_LEVELS.map((level, index) => ({ value: index, label: MADDOX_RIGOR_LEVEL_DEFS[level].label }))

/**
 * Grau de rigor em steps com rótulos (do puramente narrativo ao fiel ao D&D) — cópia do card de
 * criticidade do agente adversário do Opex, com as cores de raridade do DnDicas. Abaixo do slider, o
 * que o nível escolhido resolve pelas regras e o que fica livre, na narrativa.
 */
export function RigorCard({ form, disabled = false }: { form: UseFormReturn<CreateMaddoxCampaignInput>; disabled?: boolean }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Grau de rigor</CardTitle>
                <CardDescription>Do jogo puramente narrativo, sem dados nem números, até o estritamente fiel às regras do D&D, com o catálogo do DnDicas como fonte de verdade.</CardDescription>
            </CardHeader>
            <CardContent>
                <Controller
                    control={form.control}
                    name="rigor"
                    render={({ field }) => {
                        const index = Math.max(0, MADDOX_RIGOR_LEVELS.indexOf(field.value))
                        const def = MADDOX_RIGOR_LEVEL_DEFS[field.value]
                        const color = rigorColor(field.value)
                        return (
                            <div className="space-y-5">
                                <div className="px-7 pb-2">
                                    <Slider
                                        id="maddox-rigor"
                                        aria-label="Grau de rigor da campanha"
                                        min={0}
                                        max={MADDOX_RIGOR_LEVELS.length - 1}
                                        step={1}
                                        value={index}
                                        onChange={(next) => field.onChange(MADDOX_RIGOR_LEVELS[next] ?? field.value)}
                                        onBlur={field.onBlur}
                                        formatValue={(value) => MADDOX_RIGOR_LEVEL_DEFS[MADDOX_RIGOR_LEVELS[value] ?? "equilibrado"].label}
                                        marks={MARKS}
                                        color={color}
                                        disabled={disabled}
                                    />
                                </div>
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div key={field.value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-3">
                                        <p className="text-sm" data-testid="maddox-rigor-description">
                                            <span className="font-semibold" style={{ color }}>
                                                {def.label}:
                                            </span>{" "}
                                            <span className="text-white/70">{def.description}</span>
                                        </p>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-lg border p-3" style={{ borderColor: `${color}4d`, backgroundColor: `${color}0d` }}>
                                                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
                                                    <Dices className="h-4 w-4" aria-hidden /> Pelas regras do D&D
                                                </p>
                                                <ul className="space-y-1 text-xs text-muted-foreground">
                                                    {def.rules.length === 0 ? <li>• Nenhuma: sem rolagens e sem números</li> : def.rules.map((item) => <li key={item}>• {item}</li>)}
                                                </ul>
                                            </div>
                                            <div className="rounded-lg border p-3" style={{ borderColor: `${rarityColors.common}4d`, backgroundColor: `${rarityColors.common}0d` }}>
                                                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-white/80">
                                                    <Feather className="h-4 w-4" aria-hidden /> Livre, na narrativa
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
                                    Em todos os níveis, o Maddox narra como mestre e decide o que as regras não deixam claro. O rigor só pode mudar antes da entrevista de cenário.
                                </p>
                            </div>
                        )
                    }}
                />
            </CardContent>
        </Card>
    )
}
