/**
 * @fileoverview Race creation and edition modal.
 * Follows the visual pattern and structure of BackgroundFormModal.
 */

"use client";

import * as React from "react"
import { useForm, Controller, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion, AnimatePresence } from "framer-motion"
import { Fingerprint, BookOpen, X, Loader2, Info, Sparkles, ScrollText, GraduationCap, Link, Move, Zap, Wand, Plus, Users, Pencil, Check, Languages } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"
import { Control } from "react-hook-form"

import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassConfirmClosing } from "@/components/ui/glass-confirm-closing"
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { GlassColorPicker } from "@/components/ui/glass-color-picker"
import { ImageAndDescriptionSection, TraitsSection, SpellsSection } from "@/features/classes/components/shared-form-components"

import { sizeColors, rarityColors } from "@/lib/config/colors"
import { 
    Race, 
    CreateRaceInput, 
    UpdateRaceInput,
    SizeCategory,
    RaceVariation 
} from "../types/races.types"
import { createRaceSchema, CreateRaceSchema } from "../api/validation"
import { useCreateRace, useUpdateRace } from "../api/races-queries"

// ── Shared Constants ─────────────────────────────────────────────────────────

const VARIATION_COLORS = [
    rarityColors.uncommon,
    rarityColors.rare,
    rarityColors.veryRare,
    rarityColors.legendary,
    rarityColors.artifact,
    rarityColors.common,
]

// ─── Variation Traits Wrapper ──────────────────────────────────────────────────

function VariationTraitsWrapper({ control, activeTab, isSubmitting, errors }: { control: any; activeTab: number; isSubmitting: boolean; errors: any }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: `variations.${activeTab}.traits` as any,
    })

    return <TraitsSection fields={fields} append={append} remove={remove} control={control} isSubmitting={isSubmitting} traitsFieldName={`variations.${activeTab}.traits`} errors={errors} />
}

// ─── Variation Tab Item ───────────────────────────────────────────────────────

interface VariationTabItemProps {
    variation: RaceVariation
    index: number
    isRenaming: boolean
    renameValue: string
    onStartRename: (index: number, name: string) => void
    onRenameChange: (value: string) => void
    onConfirmRename: (index: number) => void
    onCancelRename: () => void
    onDelete: (index: number) => void
    disabled?: boolean
}

function VariationTabItem({ variation, index, isRenaming, renameValue, onStartRename, onRenameChange, onConfirmRename, onCancelRename, onDelete, disabled = false, onColorChange }: VariationTabItemProps & { onColorChange?: (index: number, color: string) => void }) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 group h-12"
            style={{ borderColor: variation.color ? `${variation.color}40` : undefined }}
        >
            {isRenaming ? (
                <>
                    <input
                        autoFocus
                        className="flex-1 min-w-0 bg-transparent text-sm text-white outline-none border-b border-white/30 pb-0.5"
                        value={renameValue}
                        onChange={(e) => onRenameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") onConfirmRename(index)
                            if (e.key === "Escape") onCancelRename()
                        }}
                    />
                    <button type="button" onClick={() => onConfirmRename(index)} className="text-emerald-400 hover:text-emerald-300 transition-colors">
                        <Check className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={onCancelRename} className="text-white/40 hover:text-white/60 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </>
            ) : (
                <>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-sm text-white/80 truncate">{variation.name}</span>
                        {variation.source && (
                            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-bold text-white/40 uppercase tracking-tight truncate">{variation.source}</span>
                        )}
                    </div>

                    {!disabled && (
                        <div className="flex items-center gap-1.5">
                            {onColorChange && (
                                <div className="scale-75 origin-right">
                                    <GlassColorPicker 
                                        value={variation.color}
                                        onChange={(color) => onColorChange(index, color)}
                                        disabled={disabled}
                                    />
                                </div>
                            )}
                            <button type="button" onClick={() => onStartRename(index, variation.name)} className="text-white/30 hover:text-white/60 transition-colors opacity-0 group-hover:opacity-100">
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => onDelete(index)} className="text-white/30 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </>
            )}
        </motion.div>
    )
}

const SIZE_OPTIONS = [
    { 
        value: "Pequeno", 
        label: "Pequeno", 
        activeColor: sizeColors.Pequeno.bgAlpha, 
        textColor: sizeColors.Pequeno.text 
    },
    { 
        value: "Médio", 
        label: "Médio", 
        activeColor: sizeColors.Médio.bgAlpha, 
        textColor: sizeColors.Médio.text 
    },
    { 
        value: "Grande", 
        label: "Grande", 
        activeColor: sizeColors.Grande.bgAlpha, 
        textColor: sizeColors.Grande.text 
    },
]

// ─── Shared Form Fields Component ───────────────────────────────────────────

interface RaceFormFieldsProps {
    control: any;
    register: any;
    errors: any;
    isSubmitting: boolean;
    isVariation?: boolean;
    index?: number;
    entityId?: string;
    placeholder?: string;
    // For traits field array
    traitFields?: any[];
    appendTrait?: any;
    removeTrait?: any;
    watch?: any;
    setValue?: any;
}

const RaceFormFields = ({
    control,
    register,
    errors,
    isSubmitting,
    isVariation = false,
    index,
    entityId,
    placeholder,
    traitFields,
    appendTrait,
    removeTrait,
    watch,
    setValue
}: RaceFormFieldsProps) => {
    const prefix = isVariation ? `variations.${index}.` : "";
    
    return (
        <div className="space-y-6">
            {/* Row 1: Status switch (Base only) */}
            {!isVariation && watch && setValue && (
                <GlassStatusSwitch
                    entityLabel="Raça"
                    description="Define se esta raça estará disponível para seleção de personagens"
                    checked={watch("status") === "active"}
                    onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")}
                    disabled={isSubmitting}
                />
            )}

            {/* Row 2: Name & Source (Base only) */}
            {!isVariation && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <GlassInput 
                        id="name" 
                        label="Nome da Raça" 
                        placeholder="Ex: Elfo" 
                        icon={<GraduationCap className="h-4 w-4" />} 
                        required 
                        error={errors.name?.message} 
                        {...register("name")} 
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <GlassInput
                            id="source"
                            label="Fonte"
                            placeholder="Ex: LDJ pág. "
                            icon={<Link className="h-4 w-4" />}
                            error={errors.source?.message}
                            {...register("source")}
                        />
                        <GlassInput
                            id="originalName"
                            label="Nome em Inglês"
                            placeholder="Ex: Elf"
                            icon={<Languages className="h-4 w-4" />}
                            error={errors.originalName?.message}
                            {...register("originalName")}
                        />
                    </div>
                </div>
            )}

            {/* Row 3: Physical Traits (Size & Speed) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 items-center">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <Move className="h-4 w-4 text-blue-400" />
                        Tamanho {isVariation && "(Variação)"}
                    </label>
                    <Controller
                        name={`${prefix}size` as any}
                        control={control}
                        render={({ field }) => (
                            <GlassSelector
                                options={SIZE_CATEGORY_OPTIONS}
                                value={field.value}
                                onChange={(val) => field.onChange(val as SizeCategory)}
                                mode="single"
                                layout="horizontal"
                                fullWidth
                                disabled={isSubmitting}
                                layoutId={isVariation ? `race-variation-${index}-size-selector` : "race-size-selector"}
                            />
                        )}
                    />
                    {isVariation ? (
                        errors.variations?.[index!]?.size && (
                            <p className="text-xs text-red-400 mt-1">{errors.variations[index!].size.message}</p>
                        )
                    ) : (
                        errors.size && <p className="text-xs text-red-400 mt-1">{errors.size.message}</p>
                    )}
                </div>

                <GlassInput 
                    id={`${prefix}speed`} 
                    label={`Deslocamento ${isVariation ? "(Variação)" : ""}`}
                    placeholder="Ex: 9 metros" 
                    icon={<Zap className="h-4 w-4 text-amber-400" />} 
                    required={!isVariation}
                    error={isVariation ? errors.variations?.[index!]?.speed?.message : errors.speed?.message} 
                    {...register(`${prefix}speed` as any)} 
                />
            </div>

            {/* Row 3.1: Color Picker for Variation */}
            {isVariation && (
                <div className="grid grid-cols-1 md:grid-cols-1 gap-6 pb-2 border-b border-white/5">
                    <Controller
                        name={`${prefix}color` as any}
                        control={control}
                        render={({ field }) => (
                            <GlassColorPicker
                                label="Cor da Variação"
                                value={field.value}
                                onChange={field.onChange}
                                disabled={isSubmitting}
                            />
                        )}
                    />
                </div>
            )}

            {/* Row 4: Art & Description */}
            <ImageAndDescriptionSection
                control={control}
                isSubmitting={isSubmitting}
                errors={errors}
                imageFieldName={`${prefix}image` as any}
                descriptionFieldName={`${prefix}description` as any}
                entityId={entityId}
                placeholder={placeholder || (isVariation ? "Descreva os detalhes desta variação..." : "Descreva os detalhes desta raça...")}
            />

            {/* Row 5: Traits */}
            {isVariation ? (
                <VariationTraitsWrapper control={control} activeTab={index!} isSubmitting={isSubmitting} errors={errors} />
            ) : (
                <TraitsSection
                    fields={traitFields!}
                    append={appendTrait!}
                    remove={removeTrait!}
                    control={control}
                    isSubmitting={isSubmitting}
                    traitsFieldName="traits"
                    errors={errors}
                />
            )}

            {/* Row 6: Spells */}
            <SpellsSection
                control={control}
                isSubmitting={isSubmitting}
                spellsFieldName={`${prefix}spells` as any}
                errors={errors}
            />
        </div>
    );
};

const SIZE_CATEGORY_OPTIONS = (Object.keys(sizeColors) as SizeCategory[]).map((size) => ({
    value: size,
    label: size,
    activeColor: sizeColors[size].bgAlpha,
    textColor: sizeColors[size].text,
}))

// ── Props ───────────────────────────────────────────────────────────────────

export interface RaceFormModalProps {
    race: Race | null
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function RaceFormModal({ race, isOpen, onClose, onSuccess }: RaceFormModalProps) {
    const isEditMode = !!race
    const createRaceMutation = useCreateRace()
    const updateMutation = useUpdateRace()
    const isSubmitting = createRaceMutation.isPending || updateMutation.isPending
    const [showConfirmClose, setShowConfirmClose] = React.useState(false)

    // Tabs
    const [activeTab, setActiveTab] = React.useState<"base" | number>("base")

    // Variation add field
    const [newVariationName, setNewVariationName] = React.useState("")
    const [newVariationSource, setNewVariationSource] = React.useState("")
    const [newVariationColor, setNewVariationColor] = React.useState<string>(VARIATION_COLORS[0])
    const [renamingIndex, setRenamingIndex] = React.useState<number | null>(null)
    const [renameValue, setRenameValue] = React.useState("")

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        control,
        reset,
        formState: { errors, isDirty }
    } = useForm<CreateRaceSchema>({
        resolver: zodResolver(createRaceSchema) as any,
        defaultValues: {
            name: race?.name ?? "",
            originalName: race?.originalName ?? "",
            description: race?.description ?? "",
            source: race?.source ?? "LDJ pág. ",
            status: race?.status ?? "active",
            image: race?.image ?? "",
            size: race?.size ?? "Médio",
            speed: race?.speed ?? "9 metros",
            traits: race?.traits ?? [],
            spells: race?.spells ?? [],
            variations: race?.variations ?? []
        }
    })

    const {
        fields: traitFields,
        append: appendTrait,
        remove: removeTrait,
    } = useFieldArray({
        control,
        name: "traits",
    })

    // Reset when modal opens/closes or race changes
    React.useEffect(() => {
        if (isOpen) {
            setShowConfirmClose(false)
            setActiveTab("base")
            setNewVariationName("")
            setNewVariationSource("")
            setRenamingIndex(null)
            reset({
                name: race?.name ?? "",
                originalName: race?.originalName ?? "",
                description: race?.description ?? "",
                source: race?.source ?? "LDJ pág. ",
                status: race?.status ?? "active",
                image: race?.image ?? "",
                size: race?.size ?? "Médio",
                speed: race?.speed ?? "9 metros",
                traits: race?.traits ?? [],
                spells: race?.spells ?? [],
                variations: race?.variations ?? []
            })
        }
    }, [isOpen, race, reset])

    const variations = watch("variations") || []

    // ── Variation management ──────────────────────────────────────────────────

    const handleAddVariation = () => {
        const nameTrimmed = newVariationName.trim()
        if (!nameTrimmed) return

        const sourceTrimmed = newVariationSource.trim()
        
        const newVariation: CreateRaceSchema["variations"][number] = {
            name: nameTrimmed,
            source: sourceTrimmed || undefined,
            color: newVariationColor,
            traits: [],
            spells: [],
            description: "",
            image: "",
            size: watch("size"),
            speed: watch("speed")
        }

        setValue("variations", [...variations, newVariation])
        setNewVariationName("")
        setNewVariationSource("")
        setNewVariationColor(VARIATION_COLORS[(variations.length + 1) % VARIATION_COLORS.length])

        // Auto-navigate to the new variation tab
        const newIndex = variations.length
        setActiveTab(newIndex)

        setTimeout(() => {
            const modalContent = document.querySelector('[role="dialog"]')
            if (modalContent) {
                modalContent.scrollTo({ top: 0, behavior: "smooth" })
            }
        }, 300)
    }

    const handleDeleteVariation = (index: number) => {
        const updated = variations.filter((_, i) => i !== index)
        setValue("variations", updated)
        if (activeTab === index) setActiveTab("base")
    }

    const handleStartRename = (index: number, name: string) => {
        setRenamingIndex(index)
        setRenameValue(name)
    }

    const handleConfirmRename = (index: number) => {
        const trimmed = renameValue.trim()
        if (!trimmed) return
        const updated = variations.map((s, i) => (i === index ? { ...s, name: trimmed } : s))
        setValue("variations", updated)
        setRenamingIndex(null)
    }

    const handleCancelRename = () => setRenamingIndex(null)

    const handleUpdateVariationColor = (index: number, color: string) => {
        const updated = variations.map((v, i) => (i === index ? { ...v, color } : v))
        setValue("variations", updated)
    }

    const handleCloseAttempt = () => {
        if (isDirty) {
            setShowConfirmClose(true)
        } else {
            onClose()
        }
    }

    // ── Submit ───────────────────────────────────────────────────────────────

    const onSubmit = async (data: CreateRaceSchema) => {
        // Limpeza dos dados
        const cleanSpells = (spells: any[]) =>
            (spells || [])
                .filter((s: any) => s.id || s._id)
                .map((s: any) => ({
                    id: s.id || s._id,
                    name: s.name,
                    circle: s.circle,
                    level: s.level || 1
                }))

        const cleanData = {
            ...data,
            originalName: data.originalName?.trim() || undefined,
            traits: (data.traits || [])
                .filter(t => t.description && t.description.trim() !== ""),
            spells: cleanSpells(data.spells),
            variations: (data.variations || []).map(v => ({
                ...v,
                traits: (v.traits || []).filter(t => t.description && t.description.trim() !== ""),
                spells: cleanSpells(v.spells)
            }))
        }

        try {
            if (isEditMode && race) {
                const id = race._id
                await updateMutation.mutateAsync({ id, data: cleanData as UpdateRaceInput })
                toast.success("Raça atualizada com sucesso!")
            } else {
                await createRaceMutation.mutateAsync(cleanData as CreateRaceInput)
                toast.success("Raça criada com sucesso!")
            }
            setShowConfirmClose(false)
            onSuccess()
            onClose()
        } catch (error) {
            console.error("[RaceFormModal] Error submitting:", error)
            toast.error("Ocorreu um erro ao salvar a raça.")
        }
    }

    // Debugging form validation errors
    React.useEffect(() => {
        if (Object.keys(errors).length > 0) {
            console.warn("[RaceFormModal] Validation Errors:", errors)
            // Show a toast only if the user tried to submit (isSubmitting or similar check)
            // But for now, just logging is enough to identify invisible errors
        }
    }, [errors])

    return (
        <>
            <GlassModal open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
                <GlassModalContent size="xl" className="max-w-full md:max-w-[70vw]">
                    <GlassModalHeader>
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30">
                                <Fingerprint className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                                <GlassModalTitle className="text-2xl font-bold tracking-tight">
                                    {isEditMode ? `Editar Raça: ${race?.name}` : "Nova Raça"}
                                </GlassModalTitle>
                                <GlassModalDescription className="text-white/40">
                                    {isEditMode 
                                        ? "Atualize os detalhes físicos e traços raciais." 
                                        : "Defina uma nova raça com seus atributos e cultura."}
                                </GlassModalDescription>
                            </div>
                        </div>
                    </GlassModalHeader>

                    {/* Tab bar */}
                    <div className="flex items-center gap-1 mt-4 p-1 rounded-lg bg-white/5 border border-white/10 overflow-x-auto">
                        <button
                            key="base-tab"
                            type="button"
                            onClick={() => setActiveTab("base")}
                            className={cn(
                                "relative flex-shrink-0 px-4 py-1.5 rounded-md text-sm font-medium transition-all focus:outline-none",
                                activeTab === "base" ? "text-white shadow-sm bg-white/15" : "text-white/50 hover:text-white/70",
                            )}
                        >
                            Base
                        </button>
                        {variations.map((v, i) => (
                            <button
                                key={`variation-tab-${i}`}
                                type="button"
                                onClick={() => setActiveTab(i)}
                                className={cn(
                                    "relative flex-shrink-0 px-4 py-1.5 rounded-md text-sm font-medium transition-all focus:outline-none",
                                    activeTab === i ? "text-white shadow-sm" : "text-white/50 hover:text-white/70",
                                )}
                                style={
                                    activeTab === i
                                        ? {
                                              backgroundColor: v.color ? `${v.color}33` : "rgba(255, 255, 255, 0.15)",
                                              color: v.color ? v.color : "white",
                                          }
                                        : undefined
                                }
                            >
                                {v.name}
                            </button>
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        {activeTab === "base" && (
                            <motion.form
                                key="base"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                                onSubmit={handleSubmit(onSubmit as any)}
                                className="space-y-6 mt-4"
                            >
                                <RaceFormFields 
                                    control={control}
                                    register={register}
                                    errors={errors}
                                    isSubmitting={isSubmitting}
                                    entityId={race?._id}
                                    traitFields={traitFields}
                                    appendTrait={appendTrait}
                                    removeTrait={removeTrait}
                                    watch={watch}
                                    setValue={setValue}
                                />

                                {/* Row 8: Variations management */}
                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                        <Users className="h-4 w-4" />
                                        Variações (Sub-raças)
                                    </label>

                                    {!isEditMode ? (
                                        <div className="px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white/40 italic">Salve a raça primeiro para adicionar variações.</div>
                                    ) : (
                                        <>
                                            {/* Add variation */}
                                            <div className="flex flex-col sm:flex-row gap-2 items-end">
                                                <div className="flex-1 w-full space-y-1.5">
                                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Nome da Variação</label>
                                                    <input
                                                        type="text"
                                                        value={newVariationName}
                                                        onChange={(e) => setNewVariationName(e.target.value)}
                                                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddVariation())}
                                                        placeholder="Ex: Elfo da Floresta..."
                                                        disabled={isSubmitting}
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors disabled:opacity-50"
                                                    />
                                                </div>
                                                <div className="sm:w-1/3 w-full space-y-1.5">
                                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Fonte</label>
                                                    <input
                                                        type="text"
                                                        value={newVariationSource}
                                                        onChange={(e) => setNewVariationSource(e.target.value)}
                                                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddVariation())}
                                                        placeholder="Ex: PHB..."
                                                        disabled={isSubmitting}
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors disabled:opacity-50"
                                                    />
                                                </div>

                                                <div className="shrink-0 space-y-1.5">
                                                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1 select-none">Cor</label>
                                                    <div className="h-10 flex items-center">
                                                        <GlassColorPicker 
                                                            value={newVariationColor}
                                                            onChange={setNewVariationColor}
                                                            disabled={isSubmitting}
                                                        />
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={handleAddVariation}
                                                    disabled={isSubmitting || !newVariationName.trim()}
                                                    className={cn(
                                                        "flex items-center justify-center px-3 h-10 rounded-lg transition-colors shrink-0",
                                                        "bg-white/10 hover:bg-white/15 text-white/60 hover:text-white",
                                                        "disabled:opacity-30 disabled:cursor-not-allowed",
                                                    )}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            </div>

                                            {/* Variation list */}
                                            {variations.length === 0 ? (
                                                <GlassInlineEmptyState message="Nenhuma variação adicionada. Variações aparecem como abas acima." />
                                            ) : (
                                                <div className="space-y-2">
                                                    <AnimatePresence>
                                                        {variations.map((v, i) => (
                                                            <VariationTabItem
                                                                key={`var-item-${i}`}
                                                                variation={v}
                                                                index={i}
                                                                isRenaming={renamingIndex === i}
                                                                renameValue={renameValue}
                                                                onColorChange={handleUpdateVariationColor}
                                                                onStartRename={handleStartRename}
                                                                onRenameChange={setRenameValue}
                                                                onConfirmRename={handleConfirmRename}
                                                                onCancelRename={handleCancelRename}
                                                                onDelete={handleDeleteVariation}
                                                                disabled={isSubmitting}
                                                            />
                                                        ))}
                                                    </AnimatePresence>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-white/10">
                                    <button
                                        type="button"
                                        onClick={handleCloseAttempt}
                                        disabled={isSubmitting}
                                        className="px-6 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white/80 hover:bg-white/5 transition-all disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {isSubmitting ? "Salvando..." : isEditMode ? "Salvar Alterações" : "Criar Raça"}
                                    </button>
                                </div>
                            </motion.form>
                        )}

                        {/* Variation tab content */}
                        {typeof activeTab === "number" && (
                            <motion.form
                                key={`variation-${activeTab}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                                onSubmit={handleSubmit(onSubmit as any)}
                                className="mt-4 space-y-6"
                            >
                                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 bg-white/5"
                                            style={{ borderColor: variations[activeTab]?.color ? `${variations[activeTab]?.color}40` : undefined }}
                                        >
                                            <Users className="h-5 w-5" style={{ color: variations[activeTab]?.color }} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white leading-none">{variations[activeTab]?.name}</h3>
                                            <p className="text-xs text-white/40 mt-1 uppercase tracking-widest font-medium">Configuração de Variação</p>
                                        </div>
                                    </div>
                                    {variations[activeTab]?.source && (
                                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 uppercase">
                                            <Link className="h-3 w-3" />
                                            {variations[activeTab]?.source}
                                        </div>
                                    )}
                                </div>

                                {/* Form Fields for Variation */}
                                <RaceFormFields 
                                    control={control}
                                    register={register}
                                    errors={errors}
                                    isSubmitting={isSubmitting}
                                    isVariation
                                    index={activeTab}
                                    entityId={race?._id}
                                    placeholder={`Descreva a variação ${variations[activeTab]?.name} detalhadamente...`}
                                />

                                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-white/10">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("base")}
                                        className="px-6 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                                    >
                                        Voltar para Base
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {isSubmitting ? "Salvando..." : isEditMode ? "Salvar Alterações" : "Criar Raça"}
                                    </button>
                                </div>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </GlassModalContent>
            </GlassModal>

            <GlassConfirmClosing
                isOpen={showConfirmClose}
                onClose={() => setShowConfirmClose(false)}
                onConfirmExit={() => {
                    setShowConfirmClose(false)
                    onClose()
                }}
                onSaveAndExit={handleSubmit(onSubmit)}
                isSaving={isSubmitting}
            />
        </>
    )
}
