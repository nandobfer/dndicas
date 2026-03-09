"use client"

import * as React from "react"
import { Plus, X, ChevronDown, Zap, ScrollText } from "lucide-react"
import { Control, FieldErrors, Controller } from "react-hook-form"
import { motion, AnimatePresence } from "framer-motion"
import { GlassEntityChooser } from "@/components/ui/glass-entity-chooser"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"
import { cn } from "@/core/utils"

interface EntityListChooserProps {
    fields: any[]
    append: (value: any) => void
    remove: (index: number) => void
    control: Control<any>
    isSubmitting: boolean
    fieldName: string
    errors: FieldErrors<any>
    entityType?: "Habilidade" | "Regra" | "Talento" | "Magia"
    title?: string
    description?: string
    icon?: React.ReactNode
    showLevel?: boolean
}

/**
 * A generalized component for selecting and listing entities (Rules, Traits, etc.)
 * with an optional Level field and high-fidelity accordion UX.
 */
export function EntityListChooser({
    fields,
    append,
    remove,
    control,
    isSubmitting,
    fieldName,
    errors,
    entityType = "Habilidade",
    title,
    description,
    icon,
    showLevel = false
}: EntityListChooserProps) {
    const [isExpanded, setIsExpanded] = React.useState(false)
    const provider = ENTITY_PROVIDERS.find(p => p.name === entityType)
    
    // Default variations based on entity type
    const defaultTitle = entityType === "Regra" ? "Propriedades" : "Habilidades"
    const displayTitle = title || defaultTitle

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                    {icon || (entityType === "Regra" ? <ScrollText className="h-4 w-4 text-slate-400" /> : <Zap className="h-4 w-4 text-amber-400" />)}
                    {displayTitle}
                </label>
                <button
                    type="button"
                    onClick={() => {
                        append(showLevel ? { level: 1, description: "" } : { description: "" })
                        setIsExpanded(true)
                    }}
                    disabled={isSubmitting}
                    className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        entityType === "Regra" 
                            ? "bg-slate-500/20 text-slate-400 hover:bg-slate-500/30 border-slate-500/30"
                            : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-amber-500/30",
                        "border",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "flex items-center gap-1.5",
                    )}
                >
                    <Plus className="h-3 w-3" />
                    Adicionar {entityType === "Regra" ? "Propriedade" : "Habilidade"}
                </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <button 
                    type="button" 
                    onClick={() => setIsExpanded(!isExpanded)} 
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors group"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white/80">Lista de {displayTitle}</span>
                        <span className="text-[10px] text-white/20 uppercase tracking-widest font-bold ml-2 group-hover:text-white/40 transition-colors">
                            {fields.length} {fields.length === 1 ? (entityType === "Regra" ? "item" : "item") : (entityType === "Regra" ? "itens" : "itens")}
                        </span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-white/20 group-hover:text-white/40 transition-all", isExpanded ? "rotate-180" : "")} />
                </button>

                <AnimatePresence>
                    {isExpanded && (
                        <motion.div 
                            initial={{ height: 0, opacity: 0 }} 
                            animate={{ height: "auto", opacity: 1 }} 
                            exit={{ height: 0, opacity: 0 }} 
                            className="overflow-hidden bg-black/20"
                        >
                            <div className="p-3 space-y-3">
                                {fields.length === 0 ? (
                                    <GlassInlineEmptyState message={`Nenhuma ${entityType.toLowerCase()} adicionada`} />
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {fields.map((field, index) => (
                                            <motion.div
                                                key={field.id}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                className="flex items-end gap-2 p-2 rounded-xl bg-white/5 border border-white/10"
                                            >
                                                {showLevel && (
                                                    <div className="w-16 self-stretch flex flex-col">
                                                        <Controller
                                                            name={`${fieldName}.${index}.level`}
                                                            control={control}
                                                            render={({ field: levelField }) => (
                                                                <div className="space-y-1 flex-1 flex flex-col group/level">
                                                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider block shrink-0">Nível</label>
                                                                    <div className="flex-1 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-all flex items-center justify-center min-h-[38px] focus-within:ring-1 focus-within:ring-white/20">
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            value={levelField.value ?? ""}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value.replace(/\D/g, "")
                                                                                levelField.onChange(val ? parseInt(val) : "")
                                                                            }}
                                                                            className={cn(
                                                                                "bg-transparent border-none outline-none w-full text-center font-bold text-sm h-full",
                                                                                entityType === "Regra" ? "text-slate-400" : "text-amber-400"
                                                                            )}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        />
                                                    </div>
                                                )}
                                                
                                                <div className="flex-1 self-stretch flex flex-col">
                                                    <div className="space-y-1 flex-1 flex flex-col">
                                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider block shrink-0">
                                                            {entityType}
                                                        </label>
                                                        <Controller
                                                            name={`${fieldName}.${index}.description`}
                                                            control={control}
                                                            render={({ field: descField }) => (
                                                                <div className="space-y-1">
                                                                    <GlassEntityChooser
                                                                        value={descField.value ? { label: descField.value.replace(/<[^>]*>/g, ""), id: field.id } : undefined}
                                                                        onChange={(val: any) => {
                                                                            if (val) {
                                                                                descField.onChange(
                                                                                    `<span data-type="mention" data-id="${val.id}" data-entity-type="${val.entityType || entityType}" class="mention">${val.label}</span>`,
                                                                                )
                                                                            } else {
                                                                                descField.onChange("")
                                                                            }
                                                                        }}
                                                                        provider={provider as any}
                                                                        placeholder={`Vincular @${displayTitle.toLowerCase()}...`}
                                                                        disabled={isSubmitting}
                                                                        className={cn(
                                                                            ((errors as any)?.[fieldName.split(".")[0]]?.[index]?.description ||
                                                                                (errors as any)?.[fieldName]?.[index]?.description) &&
                                                                                "border-rose-500/50",
                                                                        )}
                                                                    />
                                                                </div>
                                                            )}
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => remove(index)}
                                                    disabled={isSubmitting}
                                                    className={cn(
                                                        "h-10 px-3 rounded-lg transition-colors border border-white/10 bg-white/5",
                                                        "text-rose-400 hover:bg-rose-500/20",
                                                        "disabled:opacity-50 disabled:cursor-not-allowed",
                                                        "mb-[1px]",
                                                    )}
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
