/**
 * @fileoverview Shared components for Class and Subclass forms.
 */

"use client";

import * as React from "react"
import { Controller, Control, FieldErrors, UseFormWatch, UseFormSetValue, useFieldArray } from "react-hook-form"
import { Info, BookOpen, Zap, Plus, X, Wand, ChevronDown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/core/utils"
import { GlassImageUploader } from "@/components/ui/glass-image-uploader"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassSwitch } from "@/components/ui/glass-switch"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { GlassEntityChooser } from "@/components/ui/glass-entity-chooser"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"
import { attributeColors, type AttributeType } from "@/lib/config/colors"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"

// ── Shared Constants ─────────────────────────────────────────────────────────

const providerHabilidade = ENTITY_PROVIDERS.find((p) => p.name === "Habilidade")
const providerMagia = ENTITY_PROVIDERS.find((p) => p.name === "Magia")

const ATTRIBUTE_OPTIONS = (Object.entries(attributeColors) as [AttributeType, (typeof attributeColors)[AttributeType]][]).map(([key, config]) => ({
    value: key,
    label: key,
    activeColor: config.bgAlpha,
    textColor: config.text,
}))

// ── Components ───────────────────────────────────────────────────────────────

function SpellCircleAccordion({ circle, spells, onRemove }: { circle: number; spells: any[]; onRemove: (index: number) => void }) {
    const [isExpanded, setIsExpanded] = React.useState(true)

    return (
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold border",
                            circle === 0 ? "bg-slate-500/20 border-slate-500/30 text-slate-400" : "bg-blue-500/20 border-blue-500/30 text-blue-400",
                        )}
                    >
                        {circle === 0 ? "T" : circle}
                    </div>
                    <span className="text-sm font-medium text-white/80">{circle === 0 ? "Truques" : `${circle}º Círculo`}</span>
                    <span className="text-[10px] text-white/20 uppercase tracking-widest font-bold ml-2 group-hover:text-white/40 transition-colors">
                        {spells.length} {spells.length === 1 ? "magia" : "magias"}
                    </span>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-white/20 group-hover:text-white/40 transition-all", isExpanded ? "rotate-180" : "")} />
            </button>
            <AnimatePresence>
                {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-black/20">
                        <div className="p-2 flex flex-wrap gap-2">
                            {spells.map((spell) => (
                                <motion.div
                                    key={spell.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-all group/item"
                                >
                                    <span className="text-xs font-medium text-white/70 group-hover/item:text-white transition-colors">{spell.name}</span>
                                    <button type="button" onClick={() => onRemove(spell.originalIndex)} className="text-white/10 hover:text-rose-400 transition-colors">
                                        <X className="w-3 h-3" />
                                    </button>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

interface ImageAndDescriptionSectionProps {
    control: Control<any>
    isSubmitting: boolean
    errors: FieldErrors<any>
    imageFieldName: string
    descriptionFieldName: string
    entityId?: string
    placeholder?: string
}

export function ImageAndDescriptionSection({
    control,
    isSubmitting,
    errors,
    imageFieldName,
    descriptionFieldName,
    entityId,
    placeholder = "Descreva detalhadamente...",
}: ImageAndDescriptionSectionProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] gap-6">
            <div className="space-y-2 flex flex-col">
                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Arte
                </label>
                <Controller
                    name={imageFieldName}
                    control={control}
                    render={({ field }) => (
                        <GlassImageUploader value={field.value || ""} onChange={field.onChange} onRemove={() => field.onChange("")} disabled={isSubmitting} className="w-full flex-1" />
                    )}
                />
            </div>
            <div className="space-y-2 flex flex-col">
                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Descrição
                    <span className="text-rose-400">*</span>
                </label>
                <div className="flex-1 min-h-[250px]">
                    <Controller
                        name={descriptionFieldName}
                        control={control}
                        render={({ field }) => (
                            <RichTextEditor
                                value={field.value || ""}
                                onChange={field.onChange}
                                placeholder={placeholder}
                                className={cn("h-full min-h-[250px]", errors[descriptionFieldName] ? "border-rose-500/50" : "")}
                                disabled={isSubmitting}
                                excludeId={entityId}
                            />
                        )}
                    />
                </div>
                {errors[descriptionFieldName] && <p className="text-xs text-rose-400">{errors[descriptionFieldName]?.message as string}</p>}
            </div>
        </div>
    )
}

interface SpellcastingSectionProps {
    control: Control<any>
    watch: UseFormWatch<any>
    setValue: UseFormSetValue<any>
    isSubmitting: boolean
    spellcastingFieldName: string
    attributeFieldName: string
    layoutIdPrefix?: string
}

export function SpellcastingSection({ control, watch, setValue, isSubmitting, spellcastingFieldName, attributeFieldName, layoutIdPrefix = "base" }: SpellcastingSectionProps) {
    const spellcasting = watch(spellcastingFieldName)

    // Ensure we have a valid initial state for comparison
    const isSpellcaster = spellcasting === true

    // We'll use a hidden field to store spells if we had it in the schema,
    // for now we'll just implement the UI for adding spells
    const {
        fields: spellFields,
        append: appendSpell,
        remove: removeSpell,
    } = useFieldArray({
        control,
        name: spellcastingFieldName.includes(".") ? `${spellcastingFieldName.split(".")[0]}.${spellcastingFieldName.split(".")[1]}.spells` : "spells",
    })

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <Controller
                        name={spellcastingFieldName}
                        control={control}
                        render={({ field }) => (
                            <GlassSwitch
                                label="Habilitar Conjuração"
                                description="Ative para adicionar magias e definir o atributo de conjuração desta classe"
                                checked={field.value === true}
                                onCheckedChange={(checked) => {
                                    field.onChange(checked)
                                    if (!checked) {
                                        setValue(attributeFieldName, undefined, { shouldDirty: true, shouldValidate: true })
                                        // Também precisamos limpar as magias
                                        const parts = spellcastingFieldName.split(".")
                                        const spellsPath = parts.length > 1 ? `subclasses.${parts[1]}.spells` : "spells"
                                        setValue(spellsPath as any, [], { shouldDirty: true, shouldValidate: true })
                                    }
                                }}
                                disabled={isSubmitting}
                            />
                        )}
                    />
                </div>

                <AnimatePresence mode="wait">
                    {isSpellcaster ? (
                        <motion.div
                            key={`${layoutIdPrefix}-spellcasting-fields`}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-4 pt-2 overflow-hidden"
                        >
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-amber-400" />
                                    Atributo de Conjuração
                                </label>
                                <Controller
                                    name={attributeFieldName}
                                    control={control}
                                    render={({ field }) => (
                                        <GlassSelector
                                            options={ATTRIBUTE_OPTIONS}
                                            value={field.value as AttributeType | undefined}
                                            onChange={(v) => field.onChange(v)}
                                            mode="single"
                                            layout="horizontal"
                                            fullWidth
                                            size="md"
                                            disabled={isSubmitting}
                                            layoutId={`${layoutIdPrefix}-spellcasting-attr`}
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <div className="flex items-center justify-between group/title">
                                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                        <Wand className="h-4 w-4 text-blue-400 group-hover/title:rotate-12 transition-transform" />
                                        Magias
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Adicionamos um item vazio com circle undefined/null para a linha de escolha
                                            appendSpell({ id: "", name: "", circle: -1, isPending: true })
                                        }}
                                        disabled={isSubmitting}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
                                            "border border-blue-500/30",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                            "flex items-center gap-1.5 active:scale-95",
                                        )}
                                    >
                                        <Plus className="h-3 w-3" />
                                        Adicionar Magia
                                    </button>
                                </div>

                                {/* Area de Escolha (Linha igual a TraitsSection) */}
                                {(() => {
                                    const pendingFields = spellFields.map((f, i) => ({ ...f, index: i })).filter((f: any) => f.isPending)
                                    if (pendingFields.length === 0) return null

                                    return (
                                        <div className="space-y-2">
                                            {pendingFields.map((field: any) => (
                                                <motion.div
                                                    key={field.id}
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20"
                                                >
                                                    <div className="flex-1">
                                                        <GlassEntityChooser
                                                            provider={providerMagia}
                                                            placeholder="Escolha a magia para adicionar..."
                                                            onChange={(val) => {
                                                                if (val) {
                                                                    const circle = val.circle !== undefined ? val.circle : 0
                                                                    // Atualizamos o item pendente para ser uma magia real
                                                                    removeSpell(field.index)
                                                                    appendSpell({
                                                                        id: val.id,
                                                                        _id: val.id, // Ensure both are present for compatibility
                                                                        name: val.label,
                                                                        circle,
                                                                    })
                                                                }
                                                            }}
                                                            disabled={isSubmitting}
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSpell(field.index)}
                                                        className="h-10 px-3 rounded-lg border border-white/10 bg-white/5 text-rose-400 hover:bg-rose-500/20 transition-colors"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )
                                })()}

                                <div className="space-y-2">
                                    {(() => {
                                        // Agrupamos as magias JA VINCULADAS (não pendentes) por círculo
                                        const groupedSpells: Record<number, any[]> = {}
                                        let totalSpells = 0

                                        spellFields.forEach((field: any, index: number) => {
                                            if (field.isPending) return
                                            totalSpells++
                                            const circle = field.circle || 0
                                            if (!groupedSpells[circle]) groupedSpells[circle] = []
                                            groupedSpells[circle].push({ ...field, originalIndex: index })
                                        })

                                        // Ordenamos os círculos
                                        const sortedCircles = Object.keys(groupedSpells)
                                            .map(Number)
                                            .sort((a, b) => a - b)

                                        if (totalSpells === 0 && spellFields.filter((f: any) => f.isPending).length === 0) {
                                            return <GlassInlineEmptyState message="Nenhuma magia vinculada" />
                                        }

                                        return sortedCircles.map((circle) => <SpellCircleAccordion key={circle} circle={circle} spells={groupedSpells[circle]} onRemove={(idx) => removeSpell(idx)} />)
                                    })()}
                                </div>
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>
        </div>
    )
}

interface TraitsSectionProps {
    fields: any[]
    append: (value: any) => void
    remove: (index: number) => void
    control: Control<any>
    isSubmitting: boolean
    traitsFieldName: string
    errors: FieldErrors<any>
}

export function TraitsSection({
    fields,
    append,
    remove,
    control,
    isSubmitting,
    traitsFieldName,
    errors
}: TraitsSectionProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Habilidades
                </label>
                <button
                    type="button"
                    onClick={() => append({ level: 1, description: "" })}
                    disabled={isSubmitting}
                    className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
                        "border border-amber-500/30",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "flex items-center gap-1.5"
                    )}
                >
                    <Plus className="h-3 w-3" />
                    Adicionar Habilidade
                </button>
            </div>

            <AnimatePresence mode="popLayout">
                {fields.length === 0 ? (
                    <GlassInlineEmptyState message="Nenhuma habilidade adicionada" />
                ) : (
                    <div className="flex flex-col-reverse gap-3">
                        {fields.map((field, index) => (
                            <motion.div
                                key={field.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="flex items-end gap-2 p-3 rounded-xl bg-white/5 border border-white/10"
                            >
                                <div className="w-20 self-stretch flex flex-col">
                                    <Controller
                                        name={`${traitsFieldName}.${index}.level`}
                                        control={control}
                                        render={({ field: levelField }) => (
                                            <div className="space-y-1.5 flex-1 flex flex-col group/level">
                                                <label className="text-sm font-medium text-white/80 block shrink-0">Nível</label>
                                                <div className="flex-1 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-all flex items-center justify-center min-h-[38px] focus-within:ring-2 focus-within:ring-blue-500/50 focus-within:border-blue-500/50">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={levelField.value}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, "")
                                                            levelField.onChange(val ? parseInt(val) : "")
                                                        }}
                                                        className="bg-transparent border-none outline-none w-full text-center font-bold text-amber-400 text-sm h-full"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    />
                                </div>
                                <div className="flex-1 self-stretch flex flex-col">
                                    <div className="space-y-1.5 flex-1 flex flex-col">
                                        <label className="text-sm font-medium text-white/80 block shrink-0">Habilidade (Traço ou Regra)</label>
                                        <Controller
                                            name={`${traitsFieldName}.${index}.description`}
                                            control={control}
                                            render={({ field: descField }) => (
                                                <div className="space-y-1">
                                                    <GlassEntityChooser
                                                        value={
                                                            descField.value
                                                                ? { label: descField.value.replace(/<[^>]*>/g, ""), id: field.id }
                                                                : undefined
                                                        }
                                                        onChange={(val) => {
                                                            if (val) {
                                                                // If it's a mention-like style, we can format it as a mention span
                                                                // but for simplicity here we'll store the label or a specific mention format
                                                                descField.onChange(
                                                                    `<span data-type="mention" data-id="${val.id}" data-entity-type="${val.entityType}" class="mention">${val.label}</span>`
                                                                )
                                                            } else {
                                                                descField.onChange("")
                                                            }
                                                        }}
                                                        provider={providerHabilidade}
                                                        placeholder="Vincular @Habilidade..."
                                                        disabled={isSubmitting}
                                                        className={cn(
                                                            ((errors as any)?.[traitsFieldName.split(".")[0]]?.[index]?.description ||
                                                                (errors as any)?.[traitsFieldName]?.[index]?.description) &&
                                                                "border-rose-500/50"
                                                        )}
                                                    />
                                                    {((errors as any)?.[traitsFieldName.split(".")[0]]?.[index]?.description ||
                                                        (errors as any)?.[traitsFieldName]?.[index]?.description) && (
                                                        <p className="text-[10px] text-rose-400 font-medium pl-1">
                                                            {(errors as any)?.[traitsFieldName.split(".")[0]]?.[index]?.description?.message ||
                                                                (errors as any)?.[traitsFieldName]?.[index]?.description?.message}
                                                        </p>
                                                    )}
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
                                        "mb-[1px]"
                                    )}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </motion.div>
                        ))}
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
