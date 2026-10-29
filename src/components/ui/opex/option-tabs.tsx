"use client"

import { useRef, type KeyboardEvent, type ReactNode } from "react"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"
import { cn } from "@/lib/utils"

/**
 * Seletor segmentado para "escolher uma opção de uma lista pequena" (2–4 opções), copiado do
 * seletor CIF/FOB do formulário de item de negociação do Smart Desk (`renderTabSelector`).
 * A cor ativa vem do tema (`primary`), nunca de valores fixos.
 * Acessível como `radiogroup`: setas navegam e selecionam, Home/End vão às pontas.
 */

export interface OptionTabsOption<T extends string> {
    value: T
    label: string
    /** Texto completo (dica e leitor de tela) quando `label` é abreviado. */
    title?: string
    /** Dica rica (tooltip) explicando quando escolher a opção; mostra um ícone de informação no botão. */
    tooltip?: ReactNode
    disabled?: boolean
}

interface OptionTabsProps<T extends string> {
    options: readonly OptionTabsOption<T>[]
    value: T
    onChange: (value: T) => void
    /** Rótulo acessível do grupo (quando não há `<Label>` associado por `aria-labelledby`). */
    "aria-label"?: string
    "aria-labelledby"?: string
    id?: string
    disabled?: boolean
    size?: "xs" | "sm" | "md"
    className?: string
}

export function OptionTabs<T extends string>({
    options,
    value,
    onChange,
    id,
    disabled = false,
    size = "sm",
    className,
    ...aria
}: OptionTabsProps<T>) {
    const refs = useRef<Array<HTMLButtonElement | null>>([])
    const enabled = options.map((option, index) => ({ option, index })).filter(({ option }) => !disabled && !option.disabled)

    const select = (index: number) => {
        const option = options[index]
        if (!option || disabled || option.disabled) return
        onChange(option.value)
        refs.current[index]?.focus()
    }

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (enabled.length === 0) return
        const position = enabled.findIndex((item) => item.index === index)
        let target: number | undefined
        if (event.key === "ArrowRight" || event.key === "ArrowDown") target = enabled[(position + 1) % enabled.length]?.index
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = enabled[(position - 1 + enabled.length) % enabled.length]?.index
        else if (event.key === "Home") target = enabled[0]?.index
        else if (event.key === "End") target = enabled[enabled.length - 1]?.index
        if (target === undefined) return
        event.preventDefault()
        select(target)
    }

    const selectedIndex = options.findIndex((option) => option.value === value)

    return (
        <div
            id={id}
            role="radiogroup"
            aria-label={aria["aria-label"]}
            aria-labelledby={aria["aria-labelledby"]}
            aria-disabled={disabled || undefined}
            className={cn("flex gap-1 rounded-lg bg-muted p-1", disabled && "opacity-60", className)}
        >
            {options.map((option, index) => {
                const isActive = option.value === value
                const isDisabled = disabled || option.disabled
                // Roving tabindex: só a opção marcada (ou a primeira) entra na ordem de tabulação.
                const focusable = selectedIndex >= 0 ? isActive : index === 0
                const button = (
                    <button
                        key={option.value}
                        ref={(node) => {
                            refs.current[index] = node
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        disabled={isDisabled}
                        tabIndex={focusable ? 0 : -1}
                        title={option.title}
                        aria-label={option.title}
                        onClick={() => select(index)}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        className={cn(
                            "flex-1 whitespace-nowrap rounded-md font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                            option.tooltip && "inline-flex items-center justify-center gap-1.5",
                            size === "xs" ? "px-2 py-1 text-[11px]" : size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
                            isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {option.label}
                        {option.tooltip && <Info className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />}
                    </button>
                )
                if (!option.tooltip) return button
                return (
                    <TooltipProvider key={option.value} delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>{button}</TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">{option.tooltip}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )
            })}
        </div>
    )
}
