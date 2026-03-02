/**
 * @fileoverview Class creation and edition modal with tabbed interface.
 *
 * Layout:
 *  Tabs: Base tab (always) + one tab per subclass (edit mode only)
 *
 *  Base tab:
 *  Row 1: Status switch — full width
 *  Row 2: Name (left) + Source (right)
 *  Row 3: Hit Dice selector — horizontal, full-width
 *  Row 4: Saving Throws (attributes, multi, max 2)
 *  Row 5: Primary Attributes (multi)
 *  Row 6: Armor Proficiencies (grid 3)
 *  Row 7: Weapon Proficiencies (grid 3)
 *  Row 8: Skill Count + Available Skills (grid 3)
 *  Row 9: Spellcasting tier + Attribute (conditional)
 *  Row 10: Subclasses management
 *  Row 11: Description (rich text)
 *  Footer: Cancel / Save
 */

"use client";

import * as React from "react"
import { useForm, Controller, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion, AnimatePresence } from "framer-motion"
import { GraduationCap, Link, Shield, Dices, Star, BookOpen, Zap, Users, Plus, X, Pencil, Check, Loader2, Sword, Info, AlignLeft } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"

import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { GlassImageUploader } from "@/components/ui/glass-image-uploader"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"

import { attributeColors, diceColors, type AttributeType } from "@/lib/config/colors"

import { createClassSchema, type CreateClassSchema } from "../api/validation"
import {
    CharacterClass,
    CreateClassInput,
    UpdateClassInput,
    HitDiceType,
    ArmorProficiency,
    WeaponProficiency,
    SkillType,
    SpellcastingTier,
    Subclass,
    ARMOR_PROFICIENCY_OPTIONS,
    SKILL_OPTIONS,
    HIT_DICE_OPTIONS,
    SPELLCASTING_TIER_OPTIONS,
    WEAPON_PROFICIENCY_OPTIONS,
} from "../types/classes.types"
import { useCreateClass, useUpdateClass } from "../api/classes-queries"

// ─── Static derived options ─────────────────────────────────────────────────

const HIT_DICE_SELECTOR_OPTIONS: { value: HitDiceType; label: string; activeColor: string; textColor: string }[] = [
    { value: "d6", label: "d6", activeColor: diceColors.d6.bg, textColor: diceColors.d6.text },
    { value: "d8", label: "d8", activeColor: diceColors.d8.bg, textColor: diceColors.d8.text },
    { value: "d10", label: "d10", activeColor: diceColors.d10.bg, textColor: diceColors.d10.text },
    { value: "d12", label: "d12", activeColor: diceColors.d12.bg, textColor: diceColors.d12.text },
]

const ATTRIBUTE_OPTIONS = (Object.entries(attributeColors) as [AttributeType, (typeof attributeColors)[AttributeType]][]).map(([key, config]) => ({
    value: key,
    label: key, // Full name
    activeColor: config.bgAlpha,
    textColor: config.text,
}))

const ARMOR_OPTIONS: { value: ArmorProficiency; label: string; activeColor: string; textColor: string }[] = [
    { value: "Armaduras Leves", label: "Leves", activeColor: "bg-emerald-400/20", textColor: "text-emerald-400" },
    { value: "Armaduras Médias", label: "Médias", activeColor: "bg-blue-400/20", textColor: "text-blue-400" },
    { value: "Armaduras Pesadas", label: "Pesadas", activeColor: "bg-amber-400/20", textColor: "text-amber-400" },
]

const WEAPON_PROF_ALL_OPTIONS = WEAPON_PROFICIENCY_OPTIONS.map(opt => ({
    value: opt,
    label: opt
}))

// Group skills by their associated primary attribute in D&D 5e
const SKILL_MAP: Record<AttributeType, SkillType[]> = {
    "Força": ["Atletismo"],
    "Destreza": ["Acrobacia", "Furtividade", "Prestidigitação"],
    "Constituição": [],
    "Inteligência": ["Arcanismo", "História", "Investigação", "Natureza", "Religião"],
    "Sabedoria": ["Lidar com Animais", "Intuição", "Medicina", "Percepção", "Sobrevivência"],
    "Carisma": ["Atuação", "Enganação", "Intimidação", "Persuasão"]
}

const SPELLCASTING_OPTIONS: { value: SpellcastingTier; label: string; activeColor: string; textColor: string }[] = [
    { value: "Nenhum", label: "Nenhum", activeColor: "bg-slate-400/20", textColor: "text-slate-400" },
    { value: "Terço", label: "Terço", activeColor: "bg-blue-400/20", textColor: "text-blue-400" },
    { value: "Metade", label: "Metade", activeColor: "bg-purple-400/20", textColor: "text-purple-400" },
    { value: "Completo", label: "Completo", activeColor: "bg-amber-400/20", textColor: "text-amber-400" },
]

// ─── Subclass Tab Item ───────────────────────────────────────────────────────

interface SubclassTabItemProps {
    subclass: Subclass
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

function SubclassTabItem({
    subclass,
    index,
    isRenaming,
    renameValue,
    onStartRename,
    onRenameChange,
    onConfirmRename,
    onCancelRename,
    onDelete,
    disabled = false,
}: SubclassTabItemProps) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 group"
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
                    <button
                        type="button"
                        onClick={() => onConfirmRename(index)}
                        className="text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                        <Check className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onCancelRename}
                        className="text-white/40 hover:text-white/60 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </>
            ) : (
                <>
                    <span className="flex-1 text-sm text-white/80 truncate">{subclass.name}</span>
                    {!disabled && (
                        <>
                            <button
                                type="button"
                                onClick={() => onStartRename(index, subclass.name)}
                                className="text-white/30 hover:text-white/60 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onDelete(index)}
                                className="text-white/30 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </>
                    )}
                </>
            )}
        </motion.div>
    )
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ClassFormModalProps {
    characterClass: CharacterClass | null
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ClassFormModal({ characterClass, isOpen, onClose, onSuccess }: ClassFormModalProps) {
    const isEditMode = !!characterClass
    const createMutation = useCreateClass()
    const updateMutation = useUpdateClass()
    const isSubmitting = createMutation.isPending || updateMutation.isPending

    // Tabs
    const [activeTab, setActiveTab] = React.useState<"base" | number>("base")

    // Subclass add field
    const [newSubclassName, setNewSubclassName] = React.useState("")
    const [renamingIndex, setRenamingIndex] = React.useState<number | null>(null)
    const [renameValue, setRenameValue] = React.useState("")

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        control,
        reset,
        formState: { errors },
    } = useForm<CreateClassSchema>({
        resolver: zodResolver(createClassSchema) as any,
        defaultValues: {
            name: characterClass?.name ?? "",
            description: characterClass?.description ?? "",
            source: characterClass?.source ?? "",
            status: characterClass?.status ?? "active",
            hitDice: characterClass?.hitDice ?? "d8",
            primaryAttributes: characterClass?.primaryAttributes ?? [],
            savingThrows: characterClass?.savingThrows ?? [],
            armorProficiencies: characterClass?.armorProficiencies ?? [],
            weaponProficiencies: characterClass?.weaponProficiencies ?? ["Armas simples" as WeaponProficiency],
            skillCount: characterClass?.skillCount ?? 2,
            availableSkills: characterClass?.availableSkills ?? [],
            spellcasting: characterClass?.spellcasting ?? "Nenhum",
            spellcastingAttribute: characterClass?.spellcastingAttribute ?? undefined,
            subclasses: characterClass?.subclasses ?? [],
            traits: characterClass?.traits ?? [],
            image: characterClass?.image ?? "",
        },
    })

    const { fields: weaponFields, append: appendWeapon, remove: removeWeapon } = useFieldArray({
        control,
        name: "weaponProficiencies" as never,
    })

    const { fields: traitFields, append: appendTrait, remove: removeTrait } = useFieldArray({
        control,
        name: "traits" as never,
    })

    // Reset when modal opens/closes or class changes
    React.useEffect(() => {
        if (isOpen) {
            setActiveTab("base")
            setNewSubclassName("")
            setRenamingIndex(null)
            reset({
                name: characterClass?.name ?? "",
                description: characterClass?.description ?? "",
                source: characterClass?.source ?? "",
                status: characterClass?.status ?? "active",
                hitDice: characterClass?.hitDice ?? "d8",
                primaryAttributes: characterClass?.primaryAttributes ?? [],
                savingThrows: characterClass?.savingThrows ?? [],
                armorProficiencies: characterClass?.armorProficiencies ?? [],
                weaponProficiencies: characterClass?.weaponProficiencies ?? ["Armas simples" as WeaponProficiency],
                skillCount: characterClass?.skillCount ?? 2,
                availableSkills: characterClass?.availableSkills ?? [],
                spellcasting: characterClass?.spellcasting ?? "Nenhum",
                spellcastingAttribute: characterClass?.spellcastingAttribute ?? undefined,
                subclasses: characterClass?.subclasses ?? [],
                traits: characterClass?.traits ?? [],
            })
        }
    }, [isOpen, characterClass, reset])

    const subclasses = watch("subclasses") || []
    const spellcasting = watch("spellcasting")

    // ── Subclass management ──────────────────────────────────────────────────

    const handleAddSubclass = () => {
        const trimmed = newSubclassName.trim()
        if (!trimmed) return
        setValue("subclasses", [...subclasses, { name: trimmed }])
        setNewSubclassName("")
    }

    const handleDeleteSubclass = (index: number) => {
        const updated = subclasses.filter((_, i) => i !== index)
        setValue("subclasses", updated)
        if (activeTab === index) setActiveTab("base")
    }

    const handleStartRename = (index: number, name: string) => {
        setRenamingIndex(index)
        setRenameValue(name)
    }

    const handleConfirmRename = (index: number) => {
        const trimmed = renameValue.trim()
        if (!trimmed) return
        const updated = subclasses.map((s, i) => (i === index ? { ...s, name: trimmed } : s))
        setValue("subclasses", updated)
        setRenamingIndex(null)
    }

    const handleCancelRename = () => setRenamingIndex(null)

    // ── Submit ───────────────────────────────────────────────────────────────

    const onSubmit = async (values: CreateClassSchema) => {
        console.log("[ClassFormModal] Submitting values:", values)
        try {
            if (isEditMode && characterClass) {
                await updateMutation.mutateAsync({ id: characterClass._id, data: values as UpdateClassInput })
            } else {
                await createMutation.mutateAsync(values as CreateClassInput)
            }
            toast.success(characterClass ? "Classe atualizada com sucesso!" : "Classe criada com sucesso!")
            onSuccess()
            onClose()
        } catch (error) {
            console.error("[ClassFormModal] Error:", error)
            toast.error(error instanceof Error ? error.message : "Erro ao salvar classe")
        }
    }

    const onFormError = (errors: any) => {
        console.error("[ClassFormModal] Validation errors:", errors)
        toast.error("Por favor, corrija os erros no formulário.")
    }

    // ── Render tabs list ─────────────────────────────────────────────────────

    const tabs = [{ id: "base" as const, label: "Base" }, ...subclasses.map((s, i) => ({ id: i as number, label: s.name }))]

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="xl" className="max-w-[70vw]">
                <GlassModalHeader>
                    <GlassModalTitle>{isEditMode ? `Editar ${characterClass!.name}` : "Nova Classe"}</GlassModalTitle>
                    <GlassModalDescription>
                        {isEditMode ? "Atualize as informações da classe" : "Crie um novo registro no catálogo de classes"}
                    </GlassModalDescription>
                </GlassModalHeader>

                {/* Tab bar */}
                <div className="flex items-center gap-1 mt-4 p-1 rounded-lg bg-white/5 border border-white/10 overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={String(tab.id)}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "relative flex-shrink-0 px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none",
                                activeTab === tab.id ? "text-white bg-white/15" : "text-white/50 hover:text-white/70"
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Base tab content */}
                <AnimatePresence mode="wait">
                    {activeTab === "base" && (
                        <motion.form
                            key="base"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            onSubmit={handleSubmit(onSubmit as any, onFormError)}
                            className="space-y-6 mt-4"
                        >
                            {/* Row 1: Status switch */}
                            <GlassStatusSwitch
                                entityLabel="Status da Classe"
                                description="Classes inativas não aparecem nas buscas públicas"
                                checked={watch("status") === "active"}
                                onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")}
                                disabled={isSubmitting}
                            />

                            {/* Row 2: Name + Source */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <GlassInput
                                    id="name"
                                    label="Nome da Classe"
                                    placeholder="Ex: Guerreiro"
                                    icon={<GraduationCap />}
                                    required
                                    error={errors.name?.message}
                                    {...register("name")}
                                />
                                <GlassInput
                                    id="source"
                                    label="Fonte"
                                    placeholder="Ex: PHB pg. 70"
                                    icon={<Link />}
                                    error={errors.source?.message}
                                    {...register("source")}
                                />
                            </div>

                            {/* Row 3: Image + Description (Newly relocated) */}
                            <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] gap-6">
                                <div className="space-y-2 flex flex-col">
                                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                        <Info className="h-4 w-4" />
                                        Arte da Classe
                                    </label>
                                    <Controller
                                        name="image"
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
                                            name="description"
                                            control={control}
                                            render={({ field }) => (
                                                <RichTextEditor
                                                    value={field.value || ""}
                                                    onChange={field.onChange}
                                                    placeholder="Descreva a classe detalhadamente... (Suporta imagens S3 e formatação)"
                                                    className={cn("h-full min-h-[250px]", errors.description ? "border-rose-500/50" : "")}
                                                    disabled={isSubmitting}
                                                    excludeId={characterClass?._id}
                                                />
                                            )}
                                        />
                                    </div>
                                    {errors.description && <p className="text-xs text-rose-400">{errors.description.message}</p>}
                                </div>
                            </div>

                            {/* Row 4: Hit Dice */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <Dices className="h-4 w-4" />
                                    Dado de Vida
                                    <span className="text-xs text-white/40 font-normal">(hit dice da classe)</span>
                                </label>
                                <Controller
                                    name="hitDice"
                                    control={control}
                                    render={({ field }) => (
                                        <GlassSelector
                                            options={HIT_DICE_SELECTOR_OPTIONS}
                                            value={field.value as HitDiceType}
                                            onChange={(v) => field.onChange(v)}
                                            mode="single"
                                            layout="horizontal"
                                            fullWidth
                                            size="md"
                                            disabled={isSubmitting}
                                            layoutId="class-hit-dice"
                                        />
                                    )}
                                />
                                {errors.hitDice && <p className="text-xs text-rose-400">{errors.hitDice.message}</p>}
                            </div>

                            {/* Row 4: Saving Throws */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <Shield className="h-4 w-4" />
                                    Testes de Resistência
                                    <span className="text-xs text-white/40 font-normal">(exatamente 2)</span>
                                </label>
                                <Controller
                                    name="savingThrows"
                                    control={control}
                                    render={({ field }) => (
                                        <GlassSelector
                                            options={ATTRIBUTE_OPTIONS}
                                            value={(field.value as AttributeType[]) || []}
                                            onChange={(v) => {
                                                const arr = Array.isArray(v) ? v : [v]
                                                if (arr.length <= 2) field.onChange(arr)
                                            }}
                                            mode="multi"
                                            layout="horizontal"
                                            fullWidth
                                            size="md"
                                            disabled={isSubmitting}
                                            layoutId="class-saving-throws"
                                        />
                                    )}
                                />
                                {errors.savingThrows && (
                                    <p className="text-xs text-rose-400">{errors.savingThrows.message as string}</p>
                                )}
                            </div>

                            {/* Row 5: Primary Attributes */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <Star className="h-4 w-4" />
                                    Atributos Primários
                                    <span className="text-xs text-white/40 font-normal">(pré-requisito de multiclasse)</span>
                                </label>
                                <Controller
                                    name="primaryAttributes"
                                    control={control}
                                    render={({ field }) => (
                                        <GlassSelector
                                            options={ATTRIBUTE_OPTIONS}
                                            value={(field.value as AttributeType[]) || []}
                                            onChange={(v) => field.onChange(Array.isArray(v) ? v : [v])}
                                            mode="multi"
                                            layout="horizontal"
                                            fullWidth
                                            size="md"
                                            disabled={isSubmitting}
                                            layoutId="class-primary-attrs"
                                        />
                                    )}
                                />
                                {errors.primaryAttributes && (
                                    <p className="text-xs text-rose-400">{errors.primaryAttributes.message as string}</p>
                                )}
                            </div>

                            {/* Row 6: Armor Proficiencies */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                        <Shield className="h-4 w-4 text-blue-400" />
                                        Proficiências de Armadura
                                    </label>
                                    <Controller
                                        name="armorProficiencies"
                                        control={control}
                                        render={({ field }) => (
                                            <GlassSelector
                                                options={ARMOR_OPTIONS}
                                                value={(field.value as ArmorProficiency[]) || []}
                                                onChange={(v) => field.onChange(Array.isArray(v) ? v : [v])}
                                                mode="multi"
                                                layout="grid"
                                                cols={3}
                                                size="md"
                                                disabled={isSubmitting}
                                                className="w-full"
                                            />
                                        )}
                                    />
                                </div>
                                    <GlassStatusSwitch
                                        entityLabel="Escudos"
                                        description="Proficiência no uso de escudos"
                                        checked={(watch("armorProficiencies") || []).includes("Escudos")}
                                        onCheckedChange={(checked) => {
                                            const current = watch("armorProficiencies") || []
                                            if (checked) {
                                                if (!current.includes("Escudos")) setValue("armorProficiencies", [...current, "Escudos"])
                                            } else {
                                                setValue("armorProficiencies", current.filter((v: string) => v !== "Escudos"))
                                            }
                                        }}
                                        disabled={isSubmitting}
                                    />
                            </div>

                            {/* Row 7: Weapon Proficiencies */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                        <Sword className="h-4 w-4 text-rose-400" />
                                        Proficiências de Arma
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => appendWeapon("" as WeaponProficiency)}
                                        disabled={isSubmitting}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                            "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30",
                                            "border border-rose-500/30",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                            "flex items-center gap-1.5",
                                        )}
                                    >
                                        <Plus className="h-3 w-3" />
                                        Adicionar Proficiência
                                    </button>
                                </div>

                                <AnimatePresence mode="popLayout">
                                    {weaponFields.length === 0 ? (
                                        <GlassInlineEmptyState message="Nenhuma proficiência de arma adicionada" />
                                    ) : (
                                        <div className="space-y-2">
                                            {weaponFields.map((field, index) => (
                                                <motion.div
                                                    key={field.id}
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: 20 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="flex items-center gap-2"
                                                >
                                                    <div className="flex-1">
                                                        <Controller
                                                            name={`weaponProficiencies.${index}` as any}
                                                            control={control}
                                                            render={({ field: controllerField }) => (
                                                                <RichTextEditor
                                                                    value={controllerField.value || ""}
                                                                    onChange={controllerField.onChange}
                                                                    variant="simple"
                                                                    placeholder="Ex: Armas simples, Espadas longas, etc."
                                                                    disabled={isSubmitting}
                                                                />
                                                            )}
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeWeapon(index)}
                                                        disabled={isSubmitting}
                                                        className={cn(
                                                            "p-2 rounded-lg transition-colors border border-white/10 bg-white/5",
                                                            "text-rose-400 hover:bg-rose-500/20",
                                                            "disabled:opacity-50 disabled:cursor-not-allowed"
                                                        )}
                                                        title="Remover proficiência"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Row 8: Skills */}
                            <div className="space-y-4">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2 w-full pb-2 border-b border-white/5">
                                    <BookOpen className="h-4 w-4" />
                                    Perícias
                                </label>

                                <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-lg border border-white/10 w-fit">
                                    <span className="text-xs text-white/60 font-medium uppercase tracking-wider whitespace-nowrap">O jogador escolhe</span>
                                    <GlassInput
                                        id="skillCount"
                                        type="text"
                                        inputMode="numeric"
                                        label=""
                                        placeholder="2"
                                        error={errors.skillCount?.message}
                                        className="w-14"
                                        {...register("skillCount", { valueAsNumber: true })}
                                    />
                                    <span className="text-xs text-white/60 font-medium uppercase tracking-wider whitespace-nowrap">Perícias dentre:</span>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 lg:flex lg:flex-wrap gap-6">
                                    {(Object.keys(SKILL_MAP) as AttributeType[]).map((attr) => {
                                        const skills = SKILL_MAP[attr]
                                        if (skills.length === 0) return null

                                        const attrConfig = attributeColors[attr]

                                        return (
                                            <div key={attr} className="space-y-3 flex-1 min-w-[140px]">
                                                <h4 className={cn("text-[10px] font-bold uppercase tracking-widest pb-1 border-b border-white/10 text-center", attrConfig.text)}>
                                                    {attr}
                                                </h4>
                                                <div className="flex flex-col gap-1.5">
                                                    <Controller
                                                        name="availableSkills"
                                                        control={control}
                                                        render={({ field }) => (
                                                            <GlassSelector
                                                                options={skills.map(skill => ({
                                                                    value: skill,
                                                                    label: skill,
                                                                    activeColor: attrConfig.bgAlpha,
                                                                    textColor: attrConfig.text,
                                                                }))}
                                                                value={(field.value as string[]) || []}
                                                                onChange={(v) => field.onChange(v)}
                                                                mode="multi"
                                                                layout="grid"
                                                                cols={1}
                                                                disabled={isSubmitting}
                                                                layoutId={`skills-${attr}`}
                                                                className="bg-transparent border-none p-0 gap-1"
                                                            />
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                {errors.availableSkills && (
                                    <p className="text-xs text-rose-400">{errors.availableSkills.message as string}</p>
                                )}
                            </div>

                            {/* Row 9: Spellcasting */}
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                        <Zap className="h-4 w-4" />
                                        Conjuração
                                    </label>
                                    <Controller
                                        name="spellcasting"
                                        control={control}
                                        render={({ field }) => (
                                            <GlassSelector
                                                options={SPELLCASTING_OPTIONS}
                                                value={field.value as SpellcastingTier}
                                                onChange={(v) => {
                                                    field.onChange(v)
                                                    if (v === "Nenhum") setValue("spellcastingAttribute", undefined)
                                                }}
                                                mode="single"
                                                layout="horizontal"
                                                fullWidth
                                                size="md"
                                                disabled={isSubmitting}
                                                layoutId="class-spellcasting"
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
                                            className="space-y-2 overflow-hidden"
                                        >
                                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                                <Zap className="h-4 w-4 text-amber-400" />
                                                Atributo de Conjuração
                                            </label>
                                            <Controller
                                                name="spellcastingAttribute"
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
                                                        layoutId="class-spellcasting-attr"
                                                    />
                                                )}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Row 10: Subclasses management */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Subclasses
                                </label>

                                {!isEditMode ? (
                                    <div className="px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white/40 italic">
                                        Salve a classe primeiro para adicionar subclasses.
                                    </div>
                                ) : (
                                    <>
                                        {/* Add subclass */}
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newSubclassName}
                                                onChange={(e) => setNewSubclassName(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSubclass())}
                                                placeholder="Nome da subclasse..."
                                                disabled={isSubmitting}
                                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors disabled:opacity-50"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddSubclass}
                                                disabled={isSubmitting || !newSubclassName.trim()}
                                                className={cn(
                                                    "flex items-center justify-center px-3 py-2 rounded-lg transition-colors",
                                                    "bg-white/10 hover:bg-white/15 text-white/60 hover:text-white",
                                                    "disabled:opacity-30 disabled:cursor-not-allowed"
                                                )}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>

                                        {/* Subclass list */}
                                        {subclasses.length === 0 ? (
                                            <GlassInlineEmptyState message="Nenhuma subclasse adicionada. Subclasses aparecem como abas acima." />
                                        ) : (
                                            <div className="space-y-2">
                                                <AnimatePresence>
                                                    {subclasses.map((s, i) => (
                                                        <SubclassTabItem
                                                            key={s._id || i}
                                                            subclass={s}
                                                            index={i}
                                                            isRenaming={renamingIndex === i}
                                                            renameValue={renameValue}
                                                            onStartRename={handleStartRename}
                                                            onRenameChange={setRenameValue}
                                                            onConfirmRename={handleConfirmRename}
                                                            onCancelRename={handleCancelRename}
                                                            onDelete={handleDeleteSubclass}
                                                            disabled={isSubmitting}
                                                        />
                                                    ))}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Row 12: Class Traits */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-amber-400" />
                                        Habilidades de Classe
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => appendTrait({ level: 1, description: "" })}
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
                                    {traitFields.length === 0 ? (
                                        <GlassInlineEmptyState message="Nenhuma habilidade de classe adicionada" />
                                    ) : (
                                        <div className="space-y-3">
                                            {traitFields.map((field, index) => (
                                                <motion.div
                                                    key={field.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    className="flex items-end gap-2 p-3 rounded-xl bg-white/5 border border-white/10"
                                                >
                                                    <div className="w-20 self-stretch flex flex-col">
                                                        <Controller
                                                            name={`traits.${index}.level`}
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
                                                            <label className="text-sm font-medium text-white/80 block shrink-0">Traços / Regras (Habilidade)</label>
                                                            <Controller
                                                                name={`traits.${index}.description`}
                                                                control={control}
                                                                render={({ field: descField }) => (
                                                                    <RichTextEditor
                                                                        value={descField.value || ""}
                                                                        onChange={descField.onChange}
                                                                        variant="simple"
                                                                        placeholder="Mencione uma habilidade ou digite sua descrição"
                                                                        disabled={isSubmitting}
                                                                        className="flex-1 min-h-[38px]"
                                                                    />
                                                                )}
                                                            />
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeTrait(index)}
                                                        disabled={isSubmitting}
                                                        className={cn(
                                                            "h-10 px-3 rounded-lg transition-colors border border-white/10 bg-white/5",
                                                            "text-rose-400 hover:bg-rose-500/20",
                                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                                            "mb-[1px]" // Fine-tuning alignment with text editor border
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

                            {/* Footer */}
                            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {isSubmitting ? "Salvando..." : isEditMode ? "Salvar Alterações" : "Criar Classe"}
                                </button>
                            </div>
                        </motion.form>
                    )}

                    {/* Subclass tab content */}
                    {typeof activeTab === "number" && (
                        <motion.div
                            key={`subclass-${activeTab}`}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="mt-6 space-y-4"
                        >
                            <div className="rounded-lg bg-white/5 border border-white/10 p-6 text-center">
                                <Users className="h-8 w-8 text-amber-400/60 mx-auto mb-3" />
                                <h3 className="text-base font-semibold text-white/80">
                                    {subclasses[activeTab]?.name}
                                </h3>
                                <p className="text-sm text-white/40 mt-1">
                                    O formulário de subclasse será implementado em breve.
                                </p>
                            </div>

                            <div className="flex justify-end pt-2 border-t border-white/10">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-6 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors"
                                >
                                    Fechar
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </GlassModalContent>
        </GlassModal>
    )
}
