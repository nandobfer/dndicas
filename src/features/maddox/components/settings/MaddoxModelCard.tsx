"use client"

import { AnimatePresence } from "framer-motion"
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import type { AiProviderStatusDto } from "@/lib/ai/providers"
import { firstFreeRigor } from "../../model-resolution"
import type { MaddoxSettings } from "../../schemas"
import { MaddoxModelFields } from "./MaddoxModelFields"
import { MaddoxRigorModelBlock } from "./MaddoxRigorModelBlock"

interface MaddoxModelCardProps {
    form: UseFormReturn<MaddoxSettings>
    target: "main" | "interviewer"
    providers: AiProviderStatusDto[]
    title: string
    description: string
}

/**
 * Provedor (todos os de texto conectados, inclusive o OpenCode), modelo, variante, agente do OpenCode
 * e, no Maddox, a amostragem. Mesmo visual do cartão de modelo do Agente Opex. A seleção é o padrão dos
 * níveis de rigor; "Por rigor" acrescenta um bloco com modelo próprio para um nível (DND-32).
 */
export function MaddoxModelCard({ form, target, providers, title, description }: MaddoxModelCardProps) {
    const blocks = useFieldArray({ control: form.control, name: `rigorModels.${target}` })
    const values = useWatch({ control: form.control, name: `rigorModels.${target}` })
    const free = firstFreeRigor((values ?? []).map((block) => block.rigor))

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={!free}
                    title={free ? "Modelo próprio para um nível de rigor" : "Todos os níveis já têm configuração própria"}
                    onClick={() => free && blocks.append({ rigor: free, provider: null, model: null, agent: null, variant: null })}
                >
                    <Plus className="h-4 w-4" aria-hidden /> Por rigor
                </Button>
            </CardHeader>
            <CardContent className="space-y-5">
                <MaddoxModelFields form={form} prefix={target} idPrefix={`maddox-${target}`} providers={providers} allowSameAsMain={target === "interviewer"} withSampling={target === "main"} showDisconnectedNotice={target === "main"} />
                <AnimatePresence initial={false}>
                    {blocks.fields.map((field, index) => (
                        <MaddoxRigorModelBlock key={field.id} form={form} target={target} index={index} providers={providers} onRemove={() => blocks.remove(index)} />
                    ))}
                </AnimatePresence>
                {blocks.fields.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                        {target === "main" ? "Níveis sem configuração própria usam a seleção acima." : "Níveis sem configuração própria usam a seleção acima; em \"Mesmo do Maddox\", o modelo do Maddox para o mesmo rigor."}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
