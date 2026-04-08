"use client"

import * as React from "react"
import { BookOpen, Check, Search, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/core/utils"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { glassConfig } from "@/lib/config/glass-config"
import { useSources } from "@/core/hooks/useSources"
import { getBookDisplayName } from "@/core/utils/source-utils"

export interface SourceFilterProps {
    value: string[]
    onChange: (sources: string[]) => void
    entityType: string
    className?: string
}

export function SourceFilter({ value, onChange, entityType, className }: SourceFilterProps) {
    const [isOpen, setIsOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const { sources, isLoading } = useSources(entityType)

    const filtered = React.useMemo(
        () =>
            search.trim().length === 0
                ? sources
                : sources.filter((s) => {
                      const term = search.toLowerCase()
                      return (
                          getBookDisplayName(s).toLowerCase().includes(term) ||
                          s.toLowerCase().includes(term)
                      )
                  }),
        [sources, search]
    )

    const toggle = (source: string) => {
        if (value.includes(source)) {
            onChange(value.filter((s) => s !== source))
        } else {
            onChange([...value, source])
        }
    }

    const clearAll = (e: React.MouseEvent) => {
        e.stopPropagation()
        onChange([])
    }

    const hasValue = value.length > 0

    const displayText =
        value.length === 0
            ? "Todas as fontes"
            : value.length === 1
              ? getBookDisplayName(value[0])
              : `${value.length} fontes`

    return (
        <GlassPopover open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setSearch("") }}>
            <GlassPopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                        "flex items-center gap-2",
                        glassConfig.input.blur,
                        glassConfig.input.background,
                        glassConfig.input.border,
                        "hover:border-white/30 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 active:scale-[0.98]",
                        hasValue ? "text-white" : "text-white/60",
                        className,
                    )}
                >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    <span className="truncate max-w-[160px]">{displayText}</span>
                    <AnimatePresence>
                        {hasValue && (
                            <motion.span
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.15 }}
                                onClick={clearAll}
                                className={cn(
                                    "ml-0.5 flex items-center justify-center w-4 h-4 rounded-full",
                                    "bg-white/20 hover:bg-white/35 transition-colors shrink-0"
                                )}
                            >
                                <X className="h-2.5 w-2.5 text-white" />
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>
            </GlassPopoverTrigger>

            <GlassPopoverContent className="w-72 p-3" align="start">
                <div className="space-y-2">
                    <p className="text-xs font-medium text-white/60 mb-2">Filtrar por fonte</p>

                    {/* Search input */}
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg",
                        glassConfig.input.blur,
                        "bg-white/5 border border-white/10",
                    )}>
                        <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar fonte..."
                            className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none"
                            autoFocus
                        />
                        <AnimatePresence>
                            {search.length > 0 && (
                                <motion.button
                                    type="button"
                                    initial={{ opacity: 0, scale: 0.7 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.7 }}
                                    onClick={() => setSearch("")}
                                    className="text-white/30 hover:text-white/60 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Source list */}
                    <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                        {isLoading ? (
                            <div className="space-y-1.5 py-1">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-8 rounded-lg bg-white/5 animate-pulse" />
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <p className="text-xs text-white/30 text-center py-3">
                                {search ? "Nenhuma fonte encontrada" : "Nenhuma fonte disponível"}
                            </p>
                        ) : (
                            filtered.map((source) => {
                                const isSelected = value.includes(source)

                                return (
                                    <button
                                        key={source}
                                        type="button"
                                        onClick={() => toggle(source)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg",
                                            "border transition-all duration-200 active:scale-[0.98]",
                                            isSelected
                                                ? "bg-amber-400/10 border-amber-400/25 hover:bg-amber-400/15"
                                                : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "flex items-center justify-center w-[18px] h-[18px] rounded-md border transition-all duration-300 shrink-0",
                                                isSelected
                                                    ? "bg-amber-500 border-amber-500 shadow-[0_0_10px] shadow-amber-500/40"
                                                    : "bg-white/5 border-white/20",
                                            )}
                                        >
                                            {isSelected && (
                                                <motion.div
                                                    initial={{ scale: 0, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                >
                                                    <Check className="h-3 w-3 text-white stroke-[3.5]" />
                                                </motion.div>
                                            )}
                                        </div>
                                        <span
                                            className={cn(
                                                "text-xs font-semibold tracking-wide text-left leading-tight truncate",
                                                isSelected ? "text-white" : "text-amber-300/80",
                                            )}
                                        >
                                            {getBookDisplayName(source)}
                                        </span>
                                    </button>
                                )
                            })
                        )}
                    </div>

                    {/* Footer with clear button */}
                    <AnimatePresence>
                        {value.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                            >
                                <button
                                    type="button"
                                    onClick={() => onChange([])}
                                    className="w-full text-xs text-white/40 hover:text-white/70 transition-colors py-1 text-center"
                                >
                                    Limpar seleção ({value.length})
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </GlassPopoverContent>
        </GlassPopover>
    )
}
