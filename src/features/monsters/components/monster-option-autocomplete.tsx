"use client"

import * as React from "react"
import { Check, Search, X, ChevronDown } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { glassConfig } from "@/lib/config/glass-config"
import { cn } from "@/core/utils"

export interface MonsterAutocompleteOption<T extends string> {
    value: T
    label: string
    icon?: React.ReactNode
}

export function MonsterOptionAutocomplete<T extends string>({
    value,
    onChange,
    options,
    placeholder,
    title,
    mode = "multi",
    className,
    accentClass = "red",
}: {
    value: T[] | T | undefined
    onChange: (value: T[] | T | undefined) => void
    options: MonsterAutocompleteOption<T>[]
    placeholder: string
    title: string
    mode?: "single" | "multi"
    className?: string
    accentClass?: "red" | "amber" | "blue" | "emerald" | "purple"
}) {
    const [isOpen, setIsOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const selectedValues = React.useMemo(() => (Array.isArray(value) ? value : value ? [value] : []), [value])

    const color = {
        red: "bg-red-400/10 border-red-400/25 text-red-300/90",
        amber: "bg-amber-400/10 border-amber-400/25 text-amber-300/90",
        blue: "bg-blue-400/10 border-blue-400/25 text-blue-300/90",
        emerald: "bg-emerald-400/10 border-emerald-400/25 text-emerald-300/90",
        purple: "bg-purple-400/10 border-purple-400/25 text-purple-300/90",
    }[accentClass]

    const filtered = React.useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return options
        return options.filter((option) => option.label.toLowerCase().includes(term) || option.value.toLowerCase().includes(term))
    }, [options, search])

    const toggle = (next: T) => {
        if (mode === "single") {
            onChange(next)
            setIsOpen(false)
            setSearch("")
            return
        }

        if (selectedValues.includes(next)) {
            onChange(selectedValues.filter((item) => item !== next))
        } else {
            onChange([...selectedValues, next])
        }
    }

    const clearAll = (event: React.MouseEvent) => {
        event.stopPropagation()
        onChange(mode === "single" ? undefined : [])
    }

    const displayText =
        selectedValues.length === 0
            ? placeholder
            : selectedValues.length === 1
              ? options.find((option) => option.value === selectedValues[0])?.label || placeholder
              : `${selectedValues.length} selecionados`

    return (
        <GlassPopover open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setSearch("") }}>
            <GlassPopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                        "flex items-center gap-2 w-full min-w-0",
                        glassConfig.input.blur,
                        glassConfig.input.background,
                        glassConfig.input.border,
                        "hover:border-white/30 hover:bg-white/10",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 active:scale-[0.98]",
                        selectedValues.length > 0 ? "text-white" : "text-white/60",
                        className,
                    )}
                >
                    <span className="truncate flex-1 text-left">{displayText}</span>
                    <AnimatePresence>
                        {selectedValues.length > 0 && (
                            <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} onClick={clearAll} className="flex items-center justify-center w-4 h-4 rounded-full bg-white/20 hover:bg-white/35">
                                <X className="h-2.5 w-2.5 text-white" />
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <ChevronDown className="h-3.5 w-3.5 text-white/35" />
                </button>
            </GlassPopoverTrigger>
            <GlassPopoverContent className="w-72 p-3" align="start">
                <div className="space-y-2">
                    <p className="text-xs font-medium text-white/60 mb-2">{title}</p>
                    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg", glassConfig.input.blur, "bg-white/5 border border-white/10")}>
                        <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none" autoFocus />
                        {search && <button type="button" onClick={() => setSearch("")} className="text-white/30 hover:text-white/60"><X className="h-3 w-3" /></button>}
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                        {filtered.length === 0 ? (
                            <p className="text-xs text-white/30 text-center py-3">Nenhuma opção encontrada</p>
                        ) : (
                            filtered.map((option) => {
                                const selected = selectedValues.includes(option.value)
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => toggle(option.value)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-200 active:scale-[0.98]",
                                            selected ? color : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
                                        )}
                                    >
                                        <div className={cn("flex items-center justify-center w-[18px] h-[18px] rounded-md border transition-all duration-300 shrink-0", selected ? "bg-white/20 border-white/30" : "bg-white/5 border-white/20")}>
                                            {selected && <Check className="h-3 w-3 text-white stroke-[3.5]" />}
                                        </div>
                                        <span className="text-xs font-semibold tracking-wide text-left leading-tight truncate">{option.label}</span>
                                    </button>
                                )
                            })
                        )}
                    </div>
                    {selectedValues.length > 0 && (
                        <button type="button" onClick={() => onChange(mode === "single" ? undefined : [])} className="w-full text-xs text-white/40 hover:text-white/70 transition-colors py-1 text-center">
                            Limpar seleção ({selectedValues.length})
                        </button>
                    )}
                </div>
            </GlassPopoverContent>
        </GlassPopover>
    )
}
