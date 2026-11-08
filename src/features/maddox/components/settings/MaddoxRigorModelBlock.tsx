"use client"

import { motion } from "framer-motion"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Slider } from "@/components/ui/opex/slider"
import type { AiProviderStatusDto } from "@/lib/ai/providers"
import { MADDOX_RIGOR_LEVEL_DEFS, MADDOX_RIGOR_LEVELS, type MaddoxRigorLevel } from "../../constants"
import { nextFreeRigorIndex } from "../../model-resolution"
import type { MaddoxRigorModelTarget, MaddoxSettings } from "../../schemas"
import { rigorColor } from "../campaigns/campaign-visuals"
import { MaddoxModelFields } from "./MaddoxModelFields"

interface MaddoxRigorModelBlockProps {
    form: UseFormReturn<MaddoxSettings>
    target: MaddoxRigorModelTarget
    index: number
    providers: AiProviderStatusDto[]
    onRemove: () => void
}

/**
 * Bloco de modelo de um nível de rigor (DND-32), nas cores de raridade do nível como o `RigorCard` da criação de
 * campanha: slider só nos 5 níveis (os já usados por outro bloco ficam esmaecidos e são pulados), provedor,
 * modelo, variante e agente, e o botão de remover.
 */
export function MaddoxRigorModelBlock({ form, target, index, providers, onRemove }: MaddoxRigorModelBlockProps) {
    const blocks = useWatch({ control: form.control, name: `rigorModels.${target}` })
    const rigor = blocks?.[index]?.rigor ?? MADDOX_RIGOR_LEVELS[0]
    const used = (blocks ?? []).filter((_, position) => position !== index).map((block) => block.rigor)
    const current = Math.max(0, MADDOX_RIGOR_LEVELS.indexOf(rigor))
    const def = MADDOX_RIGOR_LEVEL_DEFS[rigor]
    const color = rigorColor(rigor)
    const error = form.formState.errors.rigorModels?.[target]?.[index]?.rigor?.message
    const idPrefix = `maddox-${target}-rigor-${index}`
    const marks = MADDOX_RIGOR_LEVELS.map((level, position) => ({ value: position, label: MADDOX_RIGOR_LEVEL_DEFS[level].label, muted: used.includes(level), title: used.includes(level) ? "Já configurado" : undefined }))

    const changeRigor = (next: number) => {
        const position = nextFreeRigorIndex(current, next, used)
        const level: MaddoxRigorLevel | undefined = MADDOX_RIGOR_LEVELS[position]
        if (!level || level === rigor) return
        form.setValue(`rigorModels.${target}.${index}.rigor`, level, { shouldDirty: true, shouldValidate: true })
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            data-testid={`maddox-${target}-rigor-block`}
        >
            <div className="space-y-5 rounded-lg border p-4" style={{ borderColor: `${color}4d`, backgroundColor: `${color}0d` }}>
                <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold" style={{ color }}>
                        Rigor: {def.label}
                    </p>
                    <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label={`Remover configuração do rigor ${def.label}`} onClick={onRemove}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                </div>
                <div className="space-y-1.5">
                    <div className="px-7 pb-2">
                        <Slider
                            id={`${idPrefix}-level`}
                            aria-label="Grau de rigor da configuração"
                            min={0}
                            max={MADDOX_RIGOR_LEVELS.length - 1}
                            step={1}
                            value={current}
                            onChange={changeRigor}
                            formatValue={(value) => MADDOX_RIGOR_LEVEL_DEFS[MADDOX_RIGOR_LEVELS[value] ?? rigor].label}
                            marks={marks}
                            color={color}
                        />
                    </div>
                    {used.length > 0 && <p className="text-xs text-muted-foreground">Níveis esmaecidos já têm configuração própria.</p>}
                    {error && (
                        <p role="alert" className="text-xs text-destructive">
                            {error}
                        </p>
                    )}
                </div>
                <MaddoxModelFields form={form} prefix={`rigorModels.${target}.${index}`} idPrefix={idPrefix} providers={providers} />
            </div>
        </motion.div>
    )
}
