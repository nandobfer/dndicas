"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react"
import { Controller, useFieldArray } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { Plus, Trash2, X } from "lucide-react"
import { GlassInput } from "@/components/ui/glass-input"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"
import { cn } from "@/core/utils"

const numericMask = (value: string, allowNegative = false) => {
    const sanitized = value.replace(/[^\d-]/g, "")
    if (!allowNegative) return sanitized.replace(/-/g, "")
    return sanitized.replace(/(?!^)-/g, "")
}

function CompactNumberInput({
    value,
    onChange,
    disabled = false,
    allowNegative = false,
    className,
}: {
    value?: number
    onChange: (value: number | undefined) => void
    disabled?: boolean
    allowNegative?: boolean
    className?: string
}) {
    const parseValue = (next: string) => {
        const masked = numericMask(next, allowNegative)
        if (!masked || masked === "-") return undefined
        const parsed = Number(masked)
        return Number.isFinite(parsed) ? parsed : undefined
    }

    return (
        <div className={cn("flex items-center min-h-[28px]", className)}>
            <button type="button" disabled={disabled} onClick={() => onChange((value ?? 0) - 1)} className={cn("p-1 rounded-full transition-colors text-white/40 flex-shrink-0", !disabled && "hover:bg-white/10 hover:text-white", disabled && "opacity-50 cursor-not-allowed")}>-</button>
            <input
                type="text"
                inputMode="numeric"
                value={value ?? ""}
                disabled={disabled}
                onChange={(event) => onChange(parseValue(event.target.value))}
                className="w-full bg-transparent px-2 py-1 outline-none placeholder:text-white/20 tracking-tight transition-all text-white text-sm font-semibold text-center [appearance:textfield]"
            />
            <button type="button" disabled={disabled} onClick={() => onChange((value ?? 0) + 1)} className={cn("p-1 rounded-full transition-colors text-white/40 flex-shrink-0", !disabled && "hover:bg-white/10 hover:text-white", disabled && "opacity-50 cursor-not-allowed")}>+</button>
        </div>
    )
}

export function NpcParamFormField({
    control,
    register,
    name,
    index,
    attack = false,
    disabled = false,
    onRemove,
    color = "blue",
}: {
    control: any
    register: any
    name: string
    index: number
    attack?: boolean
    disabled?: boolean
    onRemove: () => void
    color?: MonsterFormColor
}) {
    const colors = MONSTER_FORM_COLORS[color]

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn("rounded-xl border bg-black/10 p-3 space-y-3", colors.border)}
        >
            <div className="flex items-end gap-3">
                <GlassInput label="Nome" placeholder="Ex: Mordida" {...register(`${name}.${index}.label`)} disabled={disabled} />
                <button type="button" onClick={onRemove} disabled={disabled} className="h-10 px-3 rounded-lg border border-white/10 bg-white/5 text-white/40 hover:text-rose-400 hover:bg-rose-400/10 transition-colors">
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            <Controller
                name={`${name}.${index}.description`}
                control={control}
                render={({ field }) => <RichTextEditor value={field.value || ""} onChange={field.onChange} placeholder="Descrição..." variant="full" minRows={3} disabled={disabled} />}
            />

            {attack && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Controller
                        name={`${name}.${index}.attackRoll`}
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-1">
                                <label className="text-xs text-white/50">Bônus de ataque</label>
                                <CompactNumberInput value={field.value} onChange={field.onChange} disabled={disabled} allowNegative className="border-b border-white/10" />
                            </div>
                        )}
                    />
                    <GlassInput label="Rolagem de dano" placeholder="1d8 cortante + 4 psíquico" {...register(`${name}.${index}.hitRoll`)} disabled={disabled} />
                </div>
            )}
        </motion.div>
    )
}

export type MonsterFormColor = "blue" | "purple" | "emerald" | "amber" | "red" | "cyan" | "pink" | "slate"

export const MONSTER_FORM_COLORS: Record<MonsterFormColor, { text: string; bg: string; border: string; button: string; borderLeft: string }> = {
    blue: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", button: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-blue-500/20", borderLeft: "border-l-blue-500/20" },
    purple: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", button: "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border-purple-500/20", borderLeft: "border-l-purple-500/20" },
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", button: "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20", borderLeft: "border-l-emerald-500/20" },
    amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", button: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/20", borderLeft: "border-l-amber-500/20" },
    red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", button: "bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20", borderLeft: "border-l-red-500/20" },
    cyan: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", button: "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border-cyan-500/20", borderLeft: "border-l-cyan-500/20" },
    pink: { text: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20", button: "bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 border-pink-500/20", borderLeft: "border-l-pink-500/20" },
    slate: { text: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/20", button: "bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 border-slate-500/20", borderLeft: "border-l-slate-500/20" },
}

export function NpcParamFormList({
    title,
    name,
    control,
    register,
    disabled = false,
    attack = false,
    customValue,
    customValueLabel,
    setValue,
    watch,
    color = "blue",
}: {
    title: string
    name: string
    control: any
    register: any
    disabled?: boolean
    attack?: boolean
    customValue?: string
    customValueLabel?: string
    setValue?: (name: any, value: any, options?: any) => void
    watch?: (name: any) => any
    color?: MonsterFormColor
}) {
    const { fields, append, remove } = useFieldArray({ control, name })
    const colors = MONSTER_FORM_COLORS[color]
    const currentCustomValue = customValue && watch ? watch(customValue) : undefined

    return (
        <div className={cn("space-y-3 pl-4 border-l-2", colors.borderLeft)}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <label className={cn("text-sm font-medium flex items-center gap-2", colors.text)}>{title}</label>
                    {customValue && customValueLabel && setValue && (
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">{customValueLabel}</span>
                            <CompactNumberInput value={currentCustomValue} onChange={(value) => setValue(customValue, value, { shouldDirty: true })} disabled={disabled} className="w-20 border-b border-white/10" />
                            {currentCustomValue !== undefined && (
                                <button type="button" onClick={() => setValue(customValue, undefined, { shouldDirty: true })} className="text-white/30 hover:text-rose-400">
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => append({ label: "", description: "", hitRoll: "", usage: "", recharge: "" })} disabled={disabled} className={cn("px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-colors flex items-center gap-1", colors.button)}>
                        <Plus className="h-3 w-3" />
                        Adicionar
                    </button>
                </div>
            </div>

            <AnimatePresence mode="popLayout">
                {fields.length === 0 ? (
                    <p className="text-[10px] text-white/30 italic">Nenhum item definido</p>
                ) : (
                    <div className="space-y-3">
                        {fields.map((field, index) => (
                            <NpcParamFormField key={field.id} control={control} register={register} name={name} index={index} attack={attack} disabled={disabled} onRemove={() => remove(index)} color={color} />
                        ))}
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
