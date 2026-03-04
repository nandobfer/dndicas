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
import { GlassConfirmClosing } from "@/components/ui/glass-confirm-closing"
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { GlassImageUploader } from "@/components/ui/glass-image-uploader"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"

import { attributeColors, diceColors, rarityColors, type AttributeType } from "@/lib/config/colors"
import { ImageAndDescriptionSection, SpellcastingSection, TraitsSection } from "./shared-form-components"

import { createClassSchema, type CreateClassSchema } from "../api/validation"
import {
    CharacterClass,
    CreateClassInput,
    UpdateClassInput,
    HitDiceType,
    ArmorProficiency,
    WeaponProficiency,
    SkillType,
    Subclass,
    ARMOR_PROFICIENCY_OPTIONS,
    SKILL_OPTIONS,
    HIT_DICE_OPTIONS,
    WEAPON_PROFICIENCY_OPTIONS,
} from "../types/classes.types"
import { useCreateClass, useUpdateClass } from "../api/classes-queries"
import { GlassSwitch } from "@/components/ui/glass-switch"

// ── Shared Constants ─────────────────────────────────────────────────────────

const SUBCLASS_COLORS = [
    rarityColors.uncommon,
    rarityColors.rare,
    rarityColors.veryRare,
    rarityColors.legendary,
    rarityColors.artifact,
    rarityColors.common, // Adicionando common no final para rotacionar completo
]

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

const WEAPON_PROF_ALL_OPTIONS = WEAPON_PROFICIENCY_OPTIONS.map((opt) => ({
    value: opt,
    label: opt,
}))

// Group skills by their associated primary attribute in D&D 5e
const SKILL_MAP: Record<AttributeType, SkillType[]> = {
    Força: ["Atletismo"],
    Destreza: ["Acrobacia", "Furtividade", "Prestidigitação"],
    Constituição: [],
    Inteligência: ["Arcanismo", "História", "Investigação", "Natureza", "Religião"],
    Sabedoria: ["Lidar com Animais", "Intuição", "Medicina", "Percepção", "Sobrevivência"],
    Carisma: ["Atuação", "Enganação", "Intimidação", "Persuasão"],
}

const SPELLCASTING_OPTIONS: { value: boolean; label: string; activeColor: string; textColor: string }[] = [
    { value: false, label: "Não", activeColor: "bg-slate-400/20", textColor: "text-slate-400" },
    { value: true, label: "Sim", activeColor: "bg-amber-400/20", textColor: "text-amber-400" },
]

// ─── Subclass Traits Wrapper ──────────────────────────────────────────────────

/**
 * Isolated component to handle subclass traits useFieldArray.
 * This fixes the Rules of Hooks violation by ensuring useFieldArray is always called,
 * but with a stable path or conditionally rendered inside this component.
 */
function SubclassTraitsWrapper({ control, activeTab, isSubmitting, errors }: { control: any; activeTab: number; isSubmitting: boolean; errors: any }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: `subclasses.${activeTab}.traits` as any,
    })

    return <TraitsSection fields={fields} append={append} remove={remove} control={control} isSubmitting={isSubmitting} traitsFieldName={`subclasses.${activeTab}.traits`} errors={errors} />
}

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

function SubclassTabItem({ subclass, index, isRenaming, renameValue, onStartRename, onRenameChange, onConfirmRename, onCancelRename, onDelete, disabled = false }: SubclassTabItemProps) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 group"
            style={{ borderColor: subclass.color ? `${subclass.color}40` : undefined }}
        >
            {isRenaming ? (
                /* ... (keeping the renaming logic unchanged) */
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
                        <span className="text-sm text-white/80 truncate">{subclass.name}</span>
                        {subclass.source && (
                            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-bold text-white/40 uppercase tracking-tight truncate">{subclass.source}</span>
                        )}
                        {subclass.color && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: subclass.color }} />}
                    </div>
                    {!disabled && (
                        <>
                            <button type="button" onClick={() => onStartRename(index, subclass.name)} className="text-white/30 hover:text-white/60 transition-colors opacity-0 group-hover:opacity-100">
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => onDelete(index)} className="text-white/30 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100">
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
    const [showConfirmClose, setShowConfirmClose] = React.useState(false)

    // Tabs
    const [activeTab, setActiveTab] = React.useState<"base" | number>("base")

    // Subclass add field
    const [newSubclassName, setNewSubclassName] = React.useState("")
    const [newSubclassSource, setNewSubclassSource] = React.useState("")
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
            spellcasting: characterClass?.spellcasting ?? false,
            spellcastingAttribute: characterClass?.spellcastingAttribute ?? undefined,
            spells: characterClass?.spells ?? [],
            subclasses: characterClass?.subclasses ?? [],
            traits: characterClass?.traits ?? [],
            image: characterClass?.image ?? ""
        }
    })

    const {
        fields: weaponFields,
        append: appendWeapon,
        remove: removeWeapon,
    } = useFieldArray({
        control,
        name: "weaponProficiencies" as never,
    })

    const {
        fields: traitFields,
        append: appendTrait,
        remove: removeTrait,
    } = useFieldArray({
        control,
        name: "traits",
    })

    // Reset when modal opens/closes or class changes
    React.useEffect(() => {
        if (isOpen) {
            setShowConfirmClose(false)
            setActiveTab("base")
            setNewSubclassName("")
            setNewSubclassSource("")
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
                spellcasting: Boolean(characterClass?.spellcasting),
                spellcastingAttribute: characterClass?.spellcastingAttribute ?? undefined,
                spells: characterClass?.spells ?? [],
                subclasses: (characterClass?.subclasses || []).map((s) => ({
                    ...s,
                    spellcasting: Boolean(s.spellcasting),
                    spells: s.spells ?? [],
                })),
                traits: characterClass?.traits ?? [],
                image: characterClass?.image ?? "",
            })
        }
    }, [isOpen, characterClass, reset])

    const subclasses = watch("subclasses") || []
    const spellcasting = watch("spellcasting")

    // ── Subclass management ──────────────────────────────────────────────────

    const handleAddSubclass = () => {
        const nameTrimmed = newSubclassName.trim()
        if (!nameTrimmed) return

        const sourceTrimmed = newSubclassSource.trim()
        const color = SUBCLASS_COLORS[subclasses.length % SUBCLASS_COLORS.length]

        const newSubclass: CreateClassSchema["subclasses"][number] = {
            name: nameTrimmed,
            source: sourceTrimmed || undefined,
            color: color,
            spellcasting: false,
            spellcastingAttribute: undefined,
            spells: [],
            traits: [],
            description: "",
            image: "",
        }

        setValue("subclasses", [...subclasses, newSubclass])
        setNewSubclassName("")
        setNewSubclassSource("")

        // Auto-navigate to the new subclass tab
        const newIndex = subclasses.length
        setActiveTab(newIndex)

        // Scroll to top of the modal content when switching to a new tab
        // Adicionado um delay maior (300ms) para evitar scrollar antes da renderização da nova aba
        setTimeout(() => {
            const modalContent = document.querySelector('[role="dialog"]')
            if (modalContent) {
                modalContent.scrollTo({ top: 0, behavior: "smooth" })
            }
        }, 300)
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

    const handleCloseAttempt = () => {
        if (isDirty) {
            setShowConfirmClose(true)
        } else {
            onClose()
        }
    }

    // ── Submit ───────────────────────────────────────────────────────────────

    const onSubmit = async (data: CreateClassSchema) => {
        // Create a copy of values to modify
        const values = { ...data };

        // Ensure all objects in spells have at least an id or _id
        const cleanSpells = (spells: any[]) => 
            (spells || []).filter(s => s.id || s._id).map(s => ({
                id: s.id || s._id,
                name: s.name,
                circle: s.circle
            }));

        values.spells = cleanSpells(values.spells);
        
        if (values.subclasses) {
            values.subclasses = values.subclasses.map(s => ({
                ...s,
                spells: cleanSpells(s.spells)
            }));
        }

        console.log("[ClassFormModal] Submitting cleaned values:", values)
        try {
            if (isEditMode && characterClass) {
                await updateMutation.mutateAsync({ id: characterClass._id, data: values as UpdateClassInput })
            } else {
                await createMutation.mutateAsync(values as CreateClassInput)
            }
            toast.success(characterClass ? "Classe atualizada com sucesso!" : "Classe criada com sucesso!")
            setShowConfirmClose(false)
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
        <>
            <GlassModal open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
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
                                    "relative flex-shrink-0 px-4 py-1.5 rounded-md text-sm font-medium transition-all focus:outline-none",
                                    activeTab === tab.id ? "text-white shadow-sm" : "text-white/50 hover:text-white/70"
                                )}
                                style={
                                    activeTab === tab.id
                                        ? {
                                              backgroundColor:
                                                  typeof tab.id === "number" && subclasses[tab.id]?.color
                                                      ? `${subclasses[tab.id].color}33`
                                                      : "rgba(255, 255, 255, 0.15)",
                                              color: typeof tab.id === "number" && subclasses[tab.id]?.color ? subclasses[tab.id].color : "white"
                                          }
                                        : undefined
                                }
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
                                <ImageAndDescriptionSection
                                    control={control}
                                    isSubmitting={isSubmitting}
                                    errors={errors}
                                    imageFieldName="image"
                                    descriptionFieldName="description"
                                    entityId={characterClass?._id}
                                    placeholder="Descreva a classe detalhadamente... (Suporta imagens S3 e formatação)"
                                />

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
                                    {errors.savingThrows && <p className="text-xs text-rose-400">{errors.savingThrows.message as string}</p>}
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
                                    <GlassSwitch
                                        label="Escudos"
                                        description="Proficiência no uso de escudos"
                                        checked={(watch("armorProficiencies") || []).includes("Escudos")}
                                        onCheckedChange={(checked) => {
                                            const current = watch("armorProficiencies") || []
                                            if (checked) {
                                                if (!current.includes("Escudos")) setValue("armorProficiencies", [...current, "Escudos"])
                                            } else {
                                                setValue(
                                                    "armorProficiencies",
                                                    current.filter((v: string) => v !== "Escudos")
                                                )
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
                                                "flex items-center gap-1.5"
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
                                        <span className="text-xs text-white/60 font-medium uppercase tracking-wider whitespace-nowrap">
                                            O jogador escolhe
                                        </span>
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
                                        <span className="text-xs text-white/60 font-medium uppercase tracking-wider whitespace-nowrap">
                                            Perícias dentre:
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 lg:flex lg:flex-wrap gap-6">
                                        {(Object.keys(SKILL_MAP) as AttributeType[]).map((attr) => {
                                            const skills = SKILL_MAP[attr]
                                            if (skills.length === 0) return null

                                            const attrConfig = attributeColors[attr]

                                            return (
                                                <div key={attr} className="space-y-3 flex-1 min-w-[140px]">
                                                    <h4
                                                        className={cn(
                                                            "text-[10px] font-bold uppercase tracking-widest pb-1 border-b border-white/10 text-center",
                                                            attrConfig.text
                                                        )}
                                                    >
                                                        {attr}
                                                    </h4>
                                                    <div className="flex flex-col gap-1.5">
                                                        <Controller
                                                            name="availableSkills"
                                                            control={control}
                                                            render={({ field }) => (
                                                                <GlassSelector
                                                                    options={skills.map((skill) => ({
                                                                        value: skill,
                                                                        label: skill,
                                                                        activeColor: attrConfig.bgAlpha,
                                                                        textColor: attrConfig.text
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
                                    {errors.availableSkills && <p className="text-xs text-rose-400">{errors.availableSkills.message as string}</p>}
                                </div>

                                {/* Row 9: Spellcasting */}
                                <SpellcastingSection
                                    control={control}
                                    watch={watch}
                                    setValue={setValue}
                                    isSubmitting={isSubmitting}
                                    spellcastingFieldName="spellcasting"
                                    attributeFieldName="spellcastingAttribute"
                                    layoutIdPrefix="base"
                                />

                                {/* Row 10: Class Traits */}
                                <TraitsSection
                                    fields={traitFields}
                                    append={appendTrait}
                                    remove={removeTrait}
                                    control={control}
                                    isSubmitting={isSubmitting}
                                    traitsFieldName="traits"
                                    errors={errors}
                                />

                                {/* Row 11: Subclasses management */}
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
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <input
                                                    type="text"
                                                    value={newSubclassName}
                                                    onChange={(e) => setNewSubclassName(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSubclass())}
                                                    placeholder="Nome da subclasse..."
                                                    disabled={isSubmitting}
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors disabled:opacity-50"
                                                />
                                                <input
                                                    type="text"
                                                    value={newSubclassSource}
                                                    onChange={(e) => setNewSubclassSource(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSubclass())}
                                                    placeholder="Fonte..."
                                                    disabled={isSubmitting}
                                                    className="sm:w-1/3 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors disabled:opacity-50"
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
                                                                subclass={s as any}
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

                                {/* Footer */}
                                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-white/10">
                                    <button
                                        type="button"
                                        onClick={handleCloseAttempt}
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
                            <motion.form
                                key={`subclass-${activeTab}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                                onSubmit={handleSubmit(onSubmit as any, onFormError)}
                                className="mt-6 space-y-6"
                            >
                                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 bg-white/5"
                                            style={{ borderColor: subclasses[activeTab]?.color ? `${subclasses[activeTab]?.color}40` : undefined }}
                                        >
                                            <Users className="h-5 w-5" style={{ color: subclasses[activeTab]?.color }} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white leading-none">{subclasses[activeTab]?.name}</h3>
                                            <p className="text-xs text-white/40 mt-1 uppercase tracking-widest font-medium">
                                                Configuração de Subclasse
                                            </p>
                                        </div>
                                    </div>
                                    {subclasses[activeTab]?.source && (
                                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 uppercase">
                                            <Link className="h-3 w-3" />
                                            {subclasses[activeTab]?.source}
                                        </div>
                                    )}
                                </div>

                                <ImageAndDescriptionSection
                                    control={control}
                                    isSubmitting={isSubmitting}
                                    errors={errors}
                                    imageFieldName={`subclasses.${activeTab}.image`}
                                    descriptionFieldName={`subclasses.${activeTab}.description`}
                                    entityId={characterClass?._id}
                                    placeholder={`Descreva a subclasse ${subclasses[activeTab]?.name} detalhadamente...`}
                                />

                                <div
                                    className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-6"
                                    style={{ borderColor: subclasses[activeTab]?.color ? `${subclasses[activeTab]?.color}40` : undefined }}
                                >
                                    <SpellcastingSection
                                        control={control}
                                        watch={watch}
                                        setValue={setValue}
                                        isSubmitting={isSubmitting}
                                        spellcastingFieldName={`subclasses.${activeTab}.spellcasting`}
                                        attributeFieldName={`subclasses.${activeTab}.spellcastingAttribute`}
                                        layoutIdPrefix={`subclass-${activeTab}`}
                                    />

                                    <div className="h-px bg-white/5" />

                                    <SubclassTraitsWrapper control={control} activeTab={activeTab} isSubmitting={isSubmitting} errors={errors} />
                                </div>

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
                                        {isSubmitting ? "Salvando..." : isEditMode ? "Salvar Alterações" : "Criar Classe"}
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
                onSaveAndExit={handleSubmit(onSubmit as any)}
                isSaving={isSubmitting}
            />
        </>
    )
}
