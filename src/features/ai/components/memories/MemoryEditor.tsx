"use client"

import { useId } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Save, X } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Textarea } from "@/components/ui/opex/textarea"
import { MEMORY_TEXT_MAX, memoryInputSchema, type MemoryInput } from "../../schemas"

interface MemoryEditorProps {
    label: string
    initial?: string
    onSave: (texto: string) => void
    onCancel: () => void
}

/** Texto livre da memória (mesmo schema da API); a IA formata e resume ao salvar. Copiado do Ciliar. */
export function MemoryEditor({ label, initial = "", onSave, onCancel }: MemoryEditorProps) {
    const id = useId()
    const form = useForm<MemoryInput>({ resolver: zodResolver(memoryInputSchema), mode: "onChange", defaultValues: { texto: initial } })
    const texto = useWatch({ control: form.control, name: "texto" }) ?? ""
    const error = form.formState.errors.texto?.message
    const submit = form.handleSubmit((values) => onSave(values.texto))
    return (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <label htmlFor={id} className="text-sm font-medium">
                {label}
            </label>
            <Textarea
                id={id}
                rows={4}
                autoFocus
                placeholder="Escreva a instrução ou o fato que o agente deve lembrar. A IA revisa o texto e gera o resumo da lista."
                aria-invalid={Boolean(error)}
                {...form.register("texto")}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault()
                        void submit()
                    }
                    if (event.key === "Escape") onCancel()
                }}
            />
            <div className="flex items-center justify-between gap-2 text-xs">
                <span className={error ? "text-destructive" : "text-muted-foreground"}>{error ?? `${texto.length}/${MEMORY_TEXT_MAX}`}</span>
                <div className="flex gap-2">
                    <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={onCancel}>
                        <X className="h-4 w-4" aria-hidden /> Cancelar
                    </Button>
                    <Button type="button" size="sm" className="gap-1" disabled={!form.formState.isValid || texto.trim() === initial.trim()} onClick={() => void submit()}>
                        <Save className="h-4 w-4" aria-hidden /> Salvar
                    </Button>
                </div>
            </div>
        </div>
    )
}
