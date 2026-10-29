"use client"

import type { ReactNode } from "react"
import { RotateCcw } from "lucide-react"
import type { FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form"
import { Button } from "@/components/ui/opex/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { FORM_GRID } from "@/components/ui/opex/form-grid"
import { Label } from "@/components/ui/opex/label"
import { Textarea } from "@/components/ui/opex/textarea"

interface InstructionsCardProps<T extends FieldValues & { instructions: string }> {
    form: UseFormReturn<T>
    id: string
    label: string
    description: string
    defaultInstructions: string
    /** Campos extras do card (abaixo das instruções). */
    children?: ReactNode
}

/** Card "Instruções" de um agente: prompt de sistema com "Restaurar padrão" (o formato da resposta é do app). */
export function InstructionsCard<T extends FieldValues & { instructions: string }>({ form, id, label, description, defaultInstructions, children }: InstructionsCardProps<T>) {
    const name = "instructions" as Path<T>
    const error = form.formState.errors.instructions?.message
    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => form.setValue(name, defaultInstructions as PathValue<T, Path<T>>, { shouldDirty: true, shouldValidate: true })}
                >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                </Button>
            </CardHeader>
            <CardContent className={FORM_GRID}>
                <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={id}>{label}</Label>
                    <Textarea id={id} rows={8} {...form.register(name)} />
                    {typeof error === "string" && <p className="text-xs text-destructive">{error}</p>}
                </div>
                {children}
            </CardContent>
        </Card>
    )
}
