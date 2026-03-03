/**
 * @fileoverview Shared components for Class and Subclass forms.
 */

"use client";

import * as React from "react"
import { Controller, Control, UseFormRegister, FieldErrors, UseFormWatch, UseFormSetValue, useFieldArray } from "react-hook-form"
import { Info, BookOpen, Zap, Plus, X, Dices, Wand } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/core/utils"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassImageUploader } from "@/components/ui/glass-image-uploader"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { GlassEntityChooser } from "@/components/ui/glass-entity-chooser"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"
import { attributeColors, type AttributeType } from "@/lib/config/colors"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"
import type { HitDiceType, SpellcastingTier, WeaponProficiency } from "../types/classes.types"
import type { CreateClassSchema } from "../api/validation"
import { SPELLCASTING_TIER_OPTIONS } from "../types/classes.types"

// ── Shared Constants ─────────────────────────────────────────────────────────

const providerHabilidade = ENTITY_PROVIDERS.find(p => p.name === "Habilidade")
const providerRegra = ENTITY_PROVIDERS.find(p => p.name === "Regra")
const providerMagia = ENTITY_PROVIDERS.find(p => p.name === "Magia")

const ATTRIBUTE_OPTIONS = (Object.entries(attributeColors) as [AttributeType, (typeof attributeColors)[AttributeType]][]).map(([key, config]) => ({
    value: key,
    label: key,
    activeColor: config.bgAlpha,
    textColor: config.text,
}))

const SPELLCASTING_OPTIONS: { value: SpellcastingTier; label: string; activeColor: string; textColor: string }[] = [
    { value: "Nenhum", label: "Nenhum", activeColor: "bg-slate-400/20", textColor: "text-slate-400" },
    { value: "Completo", label: "Completo", activeColor: "bg-amber-400/20", textColor: "text-amber-400" },
    { value: "Metade", label: "Metade", activeColor: "bg-purple-400/20", textColor: "text-purple-400" },
    { value: "Terço", label: "Terço", activeColor: "bg-blue-400/20", textColor: "text-blue-400" },
] as const

// ── Components ───────────────────────────────────────────────────────────────

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
    placeholder = "Descreva detalhadamente..."
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
                        <GlassImageUploader
                            value={field.value || ""}
                            onChange={field.onChange}
                            onRemove={() => field.onChange("")}
                            disabled={isSubmitting}
                            className="w-full flex-1"
                        />
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
                {errors[descriptionFieldName] && (
                    <p className="text-xs text-rose-400">{errors[descriptionFieldName]?.message as string}</p>
                )}
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

export function SpellcastingSection({
    control,
    watch,
    setValue,
    isSubmitting,
    spellcastingFieldName,
    attributeFieldName,
    layoutIdPrefix = "base"
}: SpellcastingSectionProps) {
    const spellcasting = watch(spellcastingFieldName)
    
    // We'll use a hidden field to store spells if we had it in the schema, 
    // for now we'll just implement the UI for adding spells
    const { fields: spellFields, append: appendSpell, remove: removeSpell } = useFieldArray({
        control,
        name: `${spellcastingFieldName.split('.')[0]}.spells` as any // Fallback logic for field naming
    })

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Conjuração
                    </label>
                    <Controller
                        name={spellcastingFieldName}
                        control={control}
                        render={({ field }) => (
                            <GlassSelector
                                options={SPELLCASTING_OPTIONS}
                                value={field.value as SpellcastingTier}
                                onChange={(v) => {
                                    field.onChange(v)
                                    if (v === "Nenhum") setValue(attributeFieldName, undefined)
                                }}
                                mode="single"
                                layout="horizontal"
                                fullWidth
                                size="md"
                                disabled={isSubmitting}
                                layoutId={`${layoutIdPrefix}-spellcasting`}
                            />
                        )}
                    />
                </div>

                <AnimatePresence>
                    {spellcasting !== "Nenhum" && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }} 
                            animate={{ opacity: 1, height: "auto" }} 
                            exit={{ opacity: 0, height: 0 }} 
                            className="space-y-3 overflow-hidden"
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

                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                        <Wand className="h-4 w-4 text-blue-400" />
                                        Magias Conhecidas / Preparadas
                                    </label>
                                    <div className="w-48">
                                        <GlassEntityChooser 
                                            provider={providerMagia}
                                            placeholder="Adicionar magia..."
                                            onChange={(val) => {
                                                if (val) {
                                                    appendSpell({ id: val.id, name: val.label })
                                                }
                                            }}
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                    {spellFields.map((field: any, index: number) => (
                                        <motion.div
                                            key={field.id}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="flex items-center gap-2 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium"
                                        >
                                            <span>{field.name}</span>
                                            <button 
                                                type="button"
                                                onClick={() => removeSpell(index)}
                                                className="hover:text-blue-200 transition-colors"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </motion.div>
                                    ))}
                                    {spellFields.length === 0 && (
                                        <span className="text-[11px] text-white/20 italic">Nenhuma magia adicionada</span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
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
                        "flex items-center gap-1.5",
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
                    <div className="space-y-3">
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
                                                        value={descField.value ? { label: descField.value.replace(/<[^>]*>/g, ""), id: field.id } : undefined}
                                                        onChange={(val) => {
                                                            if (val) {
                                                                // If it's a mention-like style, we can format it as a mention span
                                                                // but for simplicity here we'll store the label or a specific mention format
                                                                descField.onChange(`<span data-type="mention" data-id="${val.id}" data-entity-type="${val.entityType}" class="mention">${val.label}</span>`)
                                                            } else {
                                                                descField.onChange("")
                                                            }
                                                        }}
                                                        provider={providerHabilidade}
                                                        placeholder="Vincular @Habilidade..."
                                                        disabled={isSubmitting}
                                                        className={cn(
                                                            ((errors as any)?.[traitsFieldName.split('.')[0]]?.[index]?.description || 
                                                             (errors as any)?.[traitsFieldName]?. [index]?.description) && "border-rose-500/50"
                                                        )}
                                                    />
                                                    {((errors as any)?.[traitsFieldName.split('.')[0]]?.[index]?.description || 
                                                      (errors as any)?.[traitsFieldName]?. [index]?.description) && (
                                                        <p className="text-[10px] text-rose-400 font-medium pl-1">
                                                            {(errors as any)?.[traitsFieldName.split('.')[0]]?.[index]?.description?.message || 
                                                             (errors as any)?.[traitsFieldName]?. [index]?.description?.message}
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
