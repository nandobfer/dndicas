/**
 * @fileoverview Spell creation and edition modal.
 * Follows the same pattern as trait-form-modal.tsx / rule-form-modal.tsx.
 *
 * Layout:
 *  Row 1: Status switch — full width
 *  Row 2: Name (left) + Source (right)
 *  Row 3: School selector — full row, grid 4 cols, text labels + rarity colors
 *  Row 4: Circle selector — horizontal, full-width, rarity-colored
 *  Row 5: Save Attribute (grid 3-col) | Base Dice | Extra Dice per level
 *  Row 6: Rich text description
 *  Footer: plain buttons (cancel / save)
 *
 * @see specs/004-spells-catalog/spec.md - FR-001, FR-002, FR-028
 */

"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Wand, Link, AlignLeft, Info, Shield, Dices, Zap, Plus, X, MapPin, Target } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"

import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { GlassDiceSelector } from "@/components/ui/glass-dice-selector"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"

import { spellSchoolColors, spellComponentConfig, attributeColors, getLevelRarityVariant, rarityToTailwind, type SpellSchool, type SpellComponent, type AttributeType } from "@/lib/config/colors"

import { createSpellSchema, type CreateSpellSchema } from "../api/validation"
import type { Spell, CreateSpellInput, UpdateSpellInput } from "../types/spells.types"
import { useCreateSpell, useUpdateSpell } from "../api/spells-queries"

// ─── Derived selector options (module-level, static) ────────────────────────

/** School options — text label with rarity colors derived from spellSchoolColors */
const SCHOOL_OPTIONS = (Object.keys(spellSchoolColors) as SpellSchool[]).map((school) => ({
    value: school,
    label: school,
    activeColor: rarityToTailwind[spellSchoolColors[school]].bg,
    textColor: rarityToTailwind[spellSchoolColors[school]].text,
}))

/** Component options — text label with rarity colors derived from spellComponentConfig */
const COMPONENT_OPTIONS = (Object.keys(spellComponentConfig) as SpellComponent[]).map((comp) => ({
    value: comp,
    label: comp,
    activeColor: spellComponentConfig[comp].badge.split(" ")[0],
    textColor: spellComponentConfig[comp].text,
}))

/** Circle options (0–9) with rarity-based colors */
const CIRCLE_OPTIONS = Array.from({ length: 10 }, (_, i) => {
    const rarity = getLevelRarityVariant(i, "circle")
    const c = rarityToTailwind[rarity]
    return {
        value: i,
        label: i === 0 ? "Truque" : `${i}º`,
        activeColor: c.bg,
        textColor: c.text,
    }
})

/** Attribute options — abbreviated label with rarity colors */
const ATTRIBUTE_OPTIONS = (Object.entries(attributeColors) as [string, any][]).map(([key, config]) => ({
    value: key as AttributeType,
    label: config.abbreviation,
    activeColor: config.bgAlpha,
    textColor: config.text,
}))

// ─── Component ───────────────────────────────────────────────────────────────

interface SpellFormModalProps {
    /** Spell to edit (null for creation) */
    spell: Spell | null
    /** Modal open state */
    isOpen: boolean
    /** Modal close handler */
    onClose: () => void
    /** Success callback */
    onSuccess: () => void
}

export function SpellFormModal({ spell, isOpen, onClose, onSuccess }: SpellFormModalProps) {
    const isEditMode = !!spell
    const createMutation = useCreateSpell()
    const updateMutation = useUpdateSpell()
    const isSubmitting = createMutation.isPending || updateMutation.isPending

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        control,
        reset,
        formState: { errors },
    } = useForm<CreateSpellSchema>({
        resolver: zodResolver(createSpellSchema) as any,
        defaultValues: {
            name: spell?.name ?? "",
            description: spell?.description ?? "",
            circle: spell?.circle ?? 0,
            school: (spell?.school as SpellSchool) ?? "Evocação",
            component: (spell?.component as SpellComponent[]) ?? [],
            range: spell?.range || undefined,
            area: spell?.area || undefined,
            saveAttribute: spell?.saveAttribute,
            baseDice: spell?.baseDice,
            extraDicePerLevel: spell?.extraDicePerLevel,
            source: spell?.source ?? "",
            status: (spell?.status as "active" | "inactive") ?? "active",
        },
    })

    const rangeValue = watch("range")
    const areaValue = watch("area")

    // Reset form when modal opens or spell changes
    React.useEffect(() => {
        if (isOpen) {
            reset({
                name: spell?.name ?? "",
                description: spell?.description ?? "",
                circle: spell?.circle ?? 0,
                school: (spell?.school as SpellSchool) ?? "Evocação",
                component: (spell?.component as SpellComponent[]) ?? [],
                range: spell?.range || undefined,
                area: spell?.area || undefined,
                saveAttribute: spell?.saveAttribute,
                baseDice: spell?.baseDice,
                extraDicePerLevel: spell?.extraDicePerLevel,
                source: spell?.source ?? "",
                status: (spell?.status as "active" | "inactive") ?? "active",
            })
        }
    }, [spell, isOpen, reset])

    const onSubmit = async (values: CreateSpellSchema) => {
        try {
            if (isEditMode && spell) {
                await updateMutation.mutateAsync({
                    id: spell._id,
                    data: values as UpdateSpellInput,
                })
            } else {
                await createMutation.mutateAsync(values as CreateSpellInput)
            }
            toast.success(spell ? "Magia atualizada com sucesso!" : "Magia criada com sucesso!")
            onSuccess()
            onClose()
        } catch (error) {
            console.error("[SpellFormModal] Error:", error)
            toast.error(error instanceof Error ? error.message : "Erro ao salvar magia")
        }
    }

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="xl">
                <GlassModalHeader>
                    <GlassModalTitle>{isEditMode ? `Editar ${spell!.name}` : "Nova Magia"}</GlassModalTitle>
                    <GlassModalDescription>{isEditMode ? "Atualize as informações da magia" : "Crie um novo registro no catálogo de magias"}</GlassModalDescription>
                </GlassModalHeader>

                <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6 mt-4">
                    {/* Row 1: Status switch — full width */}
                    <GlassStatusSwitch
                        entityLabel="Status da Magia"
                        description="Magias inativas não aparecem nas buscas públicas"
                        checked={watch("status") === "active"}
                        onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")}
                        disabled={isSubmitting}
                    />

                    {/* Row 2: Name + Source */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <GlassInput id="name" label="Nome da Magia" placeholder="Ex: Bola de Fogo" icon={<Wand />} required error={errors.name?.message} {...register("name")} />
                        <GlassInput id="source" label="Fonte" placeholder="Ex: PHB pg. 230" icon={<Link />} error={errors.source?.message} {...register("source")} />
                    </div>

                    {/* Row: Components — multi-select */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                            <Zap className="h-4 w-4" />
                            Componentes da Magia
                        </label>
                        <Controller
                            name="component"
                            control={control}
                            render={({ field }) => (
                                <GlassSelector<SpellComponent>
                                    options={COMPONENT_OPTIONS}
                                    value={field.value as SpellComponent[]}
                                    onChange={(val) => field.onChange(val)}
                                    mode="multi"
                                    layout="horizontal"
                                    size="md"
                                    fullWidth
                                    layoutId="spell-components-selector"
                                />
                            )}
                        />
                        {errors.component && (
                            <p className="text-xs text-rose-400 flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                {errors.component.message}
                            </p>
                        )}
                    </div>

                    {/* Row 3: School — full row, grid 4 cols, text labels + rarity colors */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">
                            Escola de Magia <span className="text-rose-400">*</span>
                        </label>
                        <Controller
                            name="school"
                            control={control}
                            render={({ field }) => (
                                <GlassSelector<SpellSchool>
                                    options={SCHOOL_OPTIONS}
                                    value={field.value as SpellSchool}
                                    onChange={(val) => field.onChange(Array.isArray(val) ? val[0] : val)}
                                    layout="grid"
                                    cols={4}
                                    size="md"
                                    fullWidth
                                    layoutId="spell-school-selector"
                                />
                            )}
                        />
                        {errors.school && (
                            <p className="text-xs text-rose-400 flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                {errors.school.message}
                            </p>
                        )}
                    </div>

                    {/* Row 4: Circle selector — horizontal, full-width, rarity colors */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">
                            Círculo da Magia <span className="text-rose-400">*</span>
                        </label>
                        <Controller
                            name="circle"
                            control={control}
                            render={({ field }) => (
                                <GlassSelector<number>
                                    options={CIRCLE_OPTIONS}
                                    value={field.value}
                                    onChange={(val) => field.onChange(Array.isArray(val) ? val[0] : val)}
                                    layout="horizontal"
                                    fullWidth
                                    layoutId="spell-circle-selector"
                                />
                            )}
                        />
                        {errors.circle && (
                            <p className="text-xs text-rose-400 flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                {errors.circle.message}
                            </p>
                        )}
                    </div>

                    {/* Row 5.1: Save Attribute */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <Shield className="h-4 w-4 text-amber-400" />
                                Teste de Resistência
                            </label>
                            {!watch("saveAttribute") && (
                                <button
                                    type="button"
                                    onClick={() => setValue("saveAttribute", "Destreza")}
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
                                    Adicionar Teste
                                </button>
                            )}
                        </div>
                        <AnimatePresence mode="popLayout">
                            {!watch("saveAttribute") ? (
                                <GlassInlineEmptyState message="Nenhum teste de resistência definido" />
                            ) : (
                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <Controller
                                            name="saveAttribute"
                                            control={control}
                                            render={({ field }) => (
                                                <GlassSelector<AttributeType>
                                                    options={ATTRIBUTE_OPTIONS}
                                                    value={field.value as AttributeType}
                                                    onChange={(val) => field.onChange(Array.isArray(val) ? val[0] : val)}
                                                    layout="grid"
                                                    cols={6}
                                                    size="md"
                                                    fullWidth
                                                    layoutId="spell-attr-selector"
                                                />
                                            )}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setValue("saveAttribute", undefined)}
                                        disabled={isSubmitting}
                                        className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors border border-rose-500/20"
                                        title="Remover teste"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Row 5.2: Base Dice */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <Dices className="h-4 w-4 text-blue-400" />
                                Dado Base
                            </label>
                            {!watch("baseDice") && (
                                <button
                                    type="button"
                                    onClick={() => setValue("baseDice", { quantidade: 1, tipo: "d8" })}
                                    disabled={isSubmitting}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                        "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
                                        "border border-blue-500/30",
                                        "disabled:opacity-50 disabled:cursor-not-allowed",
                                        "flex items-center gap-1.5",
                                    )}
                                >
                                    <Plus className="h-3 w-3" />
                                    Adicionar Dado Base
                                </button>
                            )}
                        </div>
                        <AnimatePresence mode="popLayout">
                            {!watch("baseDice") ? (
                                <GlassInlineEmptyState message="Esta magia não possui dano/cura base" />
                            ) : (
                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <Controller
                                            name="baseDice"
                                            control={control}
                                            render={({ field }) => <GlassDiceSelector value={field.value || undefined} onChange={field.onChange} layoutId="base-dice-selector" />}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setValue("baseDice", undefined)}
                                        disabled={isSubmitting}
                                        className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors border border-rose-500/20"
                                        title="Remover dado base"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Row 5.3: Extra Dice per Level */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <Zap className="h-4 w-4 text-purple-400" />
                                Dado por Nível Extra
                            </label>
                            {!watch("extraDicePerLevel") && (
                                <button
                                    type="button"
                                    onClick={() => setValue("extraDicePerLevel", { quantidade: 1, tipo: "d8" })}
                                    disabled={isSubmitting}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                        "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30",
                                        "border border-purple-500/30",
                                        "disabled:opacity-50 disabled:cursor-not-allowed",
                                        "flex items-center gap-1.5",
                                    )}
                                >
                                    <Plus className="h-3 w-3" />
                                    Adicionar Progressão
                                </button>
                            )}
                        </div>
                        <AnimatePresence mode="popLayout">
                            {!watch("extraDicePerLevel") ? (
                                <GlassInlineEmptyState message="Esta magia não escala com o nível" />
                            ) : (
                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <Controller
                                            name="extraDicePerLevel"
                                            control={control}
                                            render={({ field }) => <GlassDiceSelector value={field.value || undefined} onChange={field.onChange} layoutId="extra-dice-selector" />}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setValue("extraDicePerLevel", undefined)}
                                        disabled={isSubmitting}
                                        className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors border border-rose-500/20"
                                        title="Remover progressão"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Row 5.4: Range and Area */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-emerald-400" />
                                    Alcance
                                </label>
                                {rangeValue === undefined && (
                                    <button
                                        type="button"
                                        onClick={() => setValue("range", "")}
                                        disabled={isSubmitting}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                            "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
                                            "border border-emerald-500/30",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                            "flex items-center gap-1.5",
                                        )}
                                    >
                                        <Plus className="h-3 w-3" />
                                        Adicionar Alcance
                                    </button>
                                )}
                            </div>
                            <AnimatePresence mode="popLayout">
                                {rangeValue === undefined ? (
                                    <GlassInlineEmptyState message="Sem alcance definido" />
                                ) : (
                                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <GlassInput id="range" placeholder="Ex: 18 metros" error={errors.range?.message} {...register("range")} className="mb-0" icon={<MapPin />} />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setValue("range", undefined)}
                                            disabled={isSubmitting}
                                            className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors border border-rose-500/20"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Area */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <Target className="h-4 w-4 text-amber-400" />
                                    Área
                                </label>
                                {areaValue === undefined && (
                                    <button
                                        type="button"
                                        onClick={() => setValue("area", "")}
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
                                        Adicionar Área
                                    </button>
                                )}
                            </div>
                            <AnimatePresence mode="popLayout">
                                {areaValue === undefined ? (
                                    <GlassInlineEmptyState message="Sem área de efeito" />
                                ) : (
                                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <GlassInput id="area" placeholder="Ex: Cone de 4,5m" error={errors.area?.message} {...register("area")} className="mb-0" icon={<Target />} />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setValue("area", undefined)}
                                            disabled={isSubmitting}
                                            className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors border border-rose-500/20"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Row 6: Description */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                            <AlignLeft className="h-4 w-4" />
                            Descrição <span className="text-rose-400">*</span>
                        </label>
                        <Controller
                            name="description"
                            control={control}
                            render={({ field }) => (
                                <RichTextEditor
                                    value={field.value || ""}
                                    onChange={field.onChange}
                                    placeholder="Descreva os efeitos da magia... (Suporta imagens S3 e formatação)"
                                    className={errors.description ? "border-rose-500/50" : ""}
                                    disabled={isSubmitting}
                                    excludeId={spell?._id}
                                />
                            )}
                        />
                        {errors.description && (
                            <p className="text-xs text-rose-400 animate-slide-down flex items-center gap-1 mt-1">
                                <Info className="h-3 w-3" />
                                {errors.description.message}
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                "text-white/60 hover:text-white hover:bg-white/10",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                            )}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                "bg-blue-500 text-white hover:bg-blue-600",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                "flex items-center gap-2",
                            )}
                        >
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isEditMode ? "Salvar Alterações" : "Criar Magia"}
                        </button>
                    </div>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
