"use client"

import type { ReactNode } from "react"
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form"
import { Label } from "@/components/ui/opex/label"
import { Switch } from "@/components/ui/opex/switch"
import { cn } from "@/lib/utils"

interface ToggleCardProps {
    id: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    label: string
    description: ReactNode
    disabled?: boolean
    /** Textos da situação ao lado do interruptor. Padrão: "Ativo"/"Inativo". */
    onLabel?: string
    offLabel?: string
}

/**
 * Linha compartilhada dos cards de liga/desliga (e das listas de ferramentas): rótulo + descrição à
 * esquerda e o controle à direita. Use quando o controle não é um `Switch` (ex.: checkbox de grupo).
 */
export function ToggleRow({ id, label, description, disabled, right }: { id: string; label: ReactNode; description: ReactNode; disabled?: boolean; right: ReactNode }) {
    return (
        <div className={cn("flex items-center justify-between gap-4 rounded-xl border bg-muted/40 p-3", disabled && "opacity-80")}>
            <div className="min-w-0 space-y-0.5">
                <Label htmlFor={id} className={cn("text-sm font-bold", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
                    {label}
                </Label>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">{right}</div>
        </div>
    )
}

/**
 * Card de liga/desliga (rótulo + descrição à esquerda; situação + Switch à direita) — cópia do
 * card "Status do Usuário" do formulário de usuários do Smart Desk. Use para opções liga/desliga
 * em formulários (ex.: "Produto ativo", "Oferta ativa").
 */
export function ToggleCard({ id, checked, onCheckedChange, label, description, disabled, onLabel = "Ativo", offLabel = "Inativo" }: ToggleCardProps) {
    return (
        <ToggleRow
            id={id}
            label={label}
            description={description}
            disabled={disabled}
            right={
                <>
                    <span data-testid={`${id}-status`} className={cn("text-[10px] font-bold uppercase", checked ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                        {checked ? onLabel : offLabel}
                    </span>
                    <Switch id={id} role="switch" aria-checked={checked} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
                </>
            }
        />
    )
}

interface FormToggleCardProps<T extends FieldValues> extends Pick<ToggleCardProps, "label" | "description" | "disabled" | "onLabel" | "offLabel"> {
    name: Path<T>
    control: Control<T>
    id?: string
}

/** `ToggleCard` ligado ao react-hook-form. */
export function FormToggleCard<T extends FieldValues>({ name, control, id, ...card }: FormToggleCardProps<T>) {
    return (
        <Controller
            name={name}
            control={control}
            render={({ field }) => <ToggleCard id={id ?? name} checked={Boolean(field.value)} onCheckedChange={field.onChange} {...card} />}
        />
    )
}
