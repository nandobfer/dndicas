"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Label } from "@/components/ui/opex/label"
import type { PublicFieldDef } from "@/lib/integrations/catalog"
import { cn } from "@/lib/utils"

interface SegmentedFieldProps {
    field: PublicFieldDef
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}

/**
 * Campo `segmented`: opções em botões lado a lado (grupo de rádio acessível). O destaque da
 * opção ativa entra com fade/escala — sem `layoutId`, que já deixou esta página em branco.
 */
export function SegmentedField({ field, value, onChange, disabled }: SegmentedFieldProps) {
    const labelId = `field-${field.key}-label`
    const current = value || String(field.defaultValue ?? "")

    return (
        <div className="space-y-1.5">
            <Label id={labelId}>
                {field.label}
                {field.required && <span className="text-destructive"> *</span>}
            </Label>
            <div role="radiogroup" aria-labelledby={labelId} className="inline-flex h-10 w-full rounded-md border bg-muted/40 p-1">
                {(field.options ?? []).map((option) => {
                    const selected = option.value === current
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled}
                            onClick={() => !selected && onChange(option.value)}
                            className={cn(
                                "relative flex-1 rounded-sm px-3 text-sm font-medium transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <AnimatePresence initial={false}>
                                {selected && (
                                    <motion.span
                                        key="active"
                                        aria-hidden
                                        className="absolute inset-0 rounded-sm bg-background shadow-sm"
                                        initial={{ opacity: 0, scale: 0.94 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.94 }}
                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                    />
                                )}
                            </AnimatePresence>
                            <span className="relative">{option.label}</span>
                        </button>
                    )
                })}
            </div>
            {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        </div>
    )
}
