/**
 * @fileoverview Item creation and edition modal.
 * Follows the visual pattern and structure of ClassFormModal.
 */

"use client";

import * as React from "react"
import { useForm, useFieldArray, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion, AnimatePresence } from "framer-motion"
import {
    Backpack,
    Plus,
    X,
    Pencil,
    Check,
    Sword,
    Shield,
    Hammer,
    Package,
    Coins,
    Anchor,
    Info,
    Tag,
    Search,
    Link,
    Languages,
    Library,
    Scale,
    Weight,
    Boxes,
    Loader2,
    ScrollText,
    Sparkles,
    Wand2,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"

import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassConfirmClosing } from "@/components/ui/glass-confirm-closing"
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { GlassEntityChooser } from "@/components/ui/glass-entity-chooser"
import { GlassInlineEmptyState } from "@/components/ui/glass-inline-empty-state"
import { GlassSwitch } from "@/components/ui/glass-switch"
import { ImageAndDescriptionSection } from "@/features/classes/components/shared-form-components"
import { EntityListChooser } from "./shared/entity-list-chooser"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"
import { useIsMobile } from "@/core/hooks/useMediaQuery"

import { WeaponFormFields } from "./form-fields/weapon-form-fields"
import { ArmorFormFields } from "./form-fields/armor-form-fields"
import { ToolFormFields } from "./form-fields/tool-form-fields"

import { diceColors } from "@/lib/config/colors"
import { createItemSchema, type CreateItemSchema } from "../api/validation"
import { Item, ItemType, ItemRarity, ArmorType, DamageType, CreateItemInput, UpdateItemInput } from "../types/items.types"
import { useCreateItem, useUpdateItem } from "../api/items-queries"

// ── Shared Constants ─────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
    { value: "qualquer", label: "Qualquer", icon: Backpack },
    { value: "arma", label: "Arma", icon: Sword },
    { value: "armadura", label: "Armadura", icon: Shield },
    { value: "escudo", label: "Escudo", icon: Shield },
    { value: "ferramenta", label: "Ferramenta", icon: Hammer },
    { value: "consumível", label: "Consumível", icon: Package },
    { value: "munição", label: "Munição", icon: Anchor },
]

const RARITY_OPTIONS = [
    { value: "comum", label: "Comum", activeColor: "bg-slate-400/20", textColor: "text-slate-400" },
    { value: "incomum", label: "Incomum", activeColor: "bg-emerald-400/20", textColor: "text-emerald-400" },
    { value: "raro", label: "Raro", activeColor: "bg-blue-400/20", textColor: "text-blue-400" },
    { value: "muito raro", label: "Muito Raro", activeColor: "bg-purple-400/20", textColor: "text-purple-400" },
    { value: "lendário", label: "Lendário", activeColor: "bg-amber-400/20", textColor: "text-amber-400" },
    { value: "artefato", label: "Artefato", activeColor: "bg-rose-400/20", textColor: "text-rose-400" },
]

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ItemFormModalProps {
    item: Item | null
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ItemFormModal({ item, isOpen, onClose, onSuccess }: ItemFormModalProps) {
    const isMobile = useIsMobile()
    const isEditMode = !!item
    const createMutation = useCreateItem()
    const updateMutation = useUpdateItem()
    const isSubmitting = createMutation.isPending || updateMutation.isPending
    const [showConfirmClose, setShowConfirmClose] = React.useState(false)

    // Specific local states for "Price" field (following Spell Range pattern)
    const [isPriceActive, setIsPriceActive] = React.useState(false)

const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    reset,
    formState: { errors, isDirty },
} = useForm<CreateItemSchema>({
    resolver: zodResolver(createItemSchema) as any,
    defaultValues: {
        name: item?.name ?? "",
        originalName: item?.originalName ?? "",
        description: item?.description ?? "",
        source: item?.source ?? "LDJ pág. ",
        status: item?.status ?? "active",
        type: item?.type ?? "qualquer",
        rarity: item?.rarity ?? "comum",
        price: item?.price ?? "",
        traits: (item?.traits || []) as any,
        properties: (item?.properties || []) as any,
        mastery: item?.mastery ?? "",
        attributeUsed: (item?.attributeUsed as any) ?? undefined,
        ac: item?.ac ?? undefined,
        acType: item?.acType ?? "base",
        armorType: item?.armorType ?? "nenhuma",
        acBonus: item?.acBonus ?? undefined,
        strReq: item?.strReq ?? 0,
        stealthDis: item?.stealthDis ?? false,
        damageType: item?.damageType ?? "cortante",
        damageDice: (item?.damageDice as any) ?? { quantidade: 1, tipo: "d6" },
        additionalDamage: (item?.additionalDamage || []) as any,
        effectDice: (item?.effectDice as any) ?? undefined,
        image: item?.image ?? "",
    },
})

const {
    fields: additionalDamageFields,
    append: appendAdditionalDamage,
    remove: removeAdditionalDamage,
} = useFieldArray({
    control,
    name: "additionalDamage" as any,
})

const {
    fields: traitFields,
    append: appendTrait,
    remove: removeTrait,
} = useFieldArray({
    control,
    name: "traits" as any,
})

const {
    fields: propertyFields,
    append: appendProperty,
    remove: removeProperty,
} = useFieldArray({
    control,
    name: "properties" as any,
})

React.useEffect(() => {
    if (isOpen) {
        setShowConfirmClose(false)
        setIsPriceActive(!!item?.price)
        reset({
            name: item?.name ?? "",
            originalName: item?.originalName ?? "",
            description: item?.description ?? "",
            source: item?.source ?? "LDJ pág. ",
            status: item?.status ?? "active",
            type: item?.type ?? "qualquer",
            rarity: item?.rarity ?? "comum",
            price: item?.price ?? "",
            isMagic: item?.isMagic ?? false,
            traits: (item?.traits || []) as any,
            properties: (item?.properties || []) as any,
            mastery: item?.mastery ?? "",
            attributeUsed: (item?.attributeUsed as any) ?? undefined,
            ac: item?.ac ?? undefined,
            acType: item?.acType ?? "base",
            armorType: item?.armorType ?? "nenhuma",
            acBonus: item?.acBonus ?? undefined,
            strReq: item?.strReq ?? 0,
            stealthDis: item?.stealthDis ?? false,
            damageType: item?.damageType ?? "cortante",
            damageDice: (item?.damageDice as any) ?? { quantidade: 1, tipo: "d6" },
            additionalDamage: (item?.additionalDamage || []) as any,
            effectDice: (item?.effectDice as any) ?? undefined,
            image: item?.image ?? "",
        })
    }
}, [isOpen, item, reset])

const selectedType = watch("type")

const handleCloseAttempt = () => {
    if (isDirty) {
        setShowConfirmClose(true)
    } else {
        onClose()
    }
}

const onSubmit = async (data: CreateItemSchema) => {
    const cleanedData = {
        ...data,
        originalName: data.originalName?.trim() || undefined,
    }
    console.log("[ItemFormModal] Submitting data:", cleanedData)
    try {
        if (isEditMode && item) {
            await updateMutation.mutateAsync({ id: item._id, data: cleanedData as UpdateItemInput })
        } else {
            await createMutation.mutateAsync(cleanedData as CreateItemInput)
        }
        toast.success(item ? "Item atualizado com sucesso!" : "Item criado com sucesso!")
        onSuccess()
        onClose()
    } catch (error) {
        console.error("[ItemFormModal] Error:", error)
        toast.error(error instanceof Error ? error.message : "Erro ao salvar item")
    }
}

// DEBUG: Errors
React.useEffect(() => {
    if (Object.keys(errors).length > 0) {
        console.warn("[ItemFormModal] Validation Errors:", errors)
    }
}, [errors])

return (
    <>
        <GlassModal open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
            <GlassModalContent size="xl" className="max-w-full md:max-w-[70vw]">
                <GlassModalHeader>
                    <GlassModalTitle>{isEditMode ? `Editar ${item?.name}` : "Novo Item"}</GlassModalTitle>
                    <GlassModalDescription>{isEditMode ? "Atualize as informações do item" : "Crie um novo registro no catálogo de itens"}</GlassModalDescription>
                </GlassModalHeader>

                <form id="item-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-6 mt-4">
                    {/* Status Switch */}
                    <GlassStatusSwitch
                        entityLabel="Status do Item"
                        description="Itens inativos não aparecem nas buscas públicas"
                        checked={watch("status") === "active"}
                        onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")}
                        disabled={isSubmitting}
                    />

                    {/* Name + Source */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <GlassInput
                            id="name"
                            label="Nome do Item"
                            placeholder="Ex: Espada Longa +1"
                            icon={<Backpack className="h-4 w-4" />}
                            required
                            error={errors.name?.message}
                            {...register("name")}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <GlassInput id="source" label="Fonte" placeholder="Ex: PHB pg. 150" icon={<Link className="h-4 w-4" />} error={errors.source?.message} {...register("source")} />
                            <GlassInput id="originalName" label="Nome em Inglês" placeholder="Ex: Longsword +1" icon={<Languages className="h-4 w-4" />} error={errors.originalName?.message} {...register("originalName")} />
                        </div>
                    </div>

                    {/* Image + Description Section */}
                    <ImageAndDescriptionSection
                        control={control}
                        isSubmitting={isSubmitting}
                        errors={errors}
                        imageFieldName="image"
                        descriptionFieldName="description"
                        entityId={item?._id}
                        placeholder="Descreva o item detalhadamente... (Suporta imagens e formatação)"
                    />

                    {/* Magic Item Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/5 relative overflow-hidden group">
                        <div className="flex items-center gap-3">
                            <div className={cn("p-2 rounded-xl transition-colors", watch("isMagic") ? "bg-blue-400/20 text-blue-400" : "bg-white/5 text-white/40")}>
                                <Wand2 className="h-5 w-5" />
                            </div>
                            <div className="space-y-0.5">
                                <h4 className="text-sm font-bold text-white tracking-tight uppercase">Item Mágico</h4>
                                <p className="text-[11px] text-white/40 font-medium leading-tight">Define se este item possui propriedades mágicas ou é mundano</p>
                            </div>
                        </div>
                        <Controller control={control} name="isMagic" render={({ field: { value, onChange } }) => <GlassSwitch checked={value} onCheckedChange={onChange} disabled={isSubmitting} />} />
                        {/* Decorative logic shine */}
                        {watch("isMagic") && <motion.div layoutId="magic-glow" className="absolute inset-0 bg-blue-400/5 pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
                    </div>

                    {/* Price (Following Spell Range pattern) */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <Coins className="h-4 w-4 text-amber-400/60" />
                                Preço / Custo
                            </label>
                            {!isPriceActive && (
                                <button
                                    type="button"
                                    onClick={() => setIsPriceActive(true)}
                                    className="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors uppercase tracking-widest flex items-center gap-1.5"
                                >
                                    <Plus className="h-3 w-3" /> Definir Preço
                                </button>
                            )}
                        </div>

                        <AnimatePresence>
                            {isPriceActive ? (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-end gap-2">
                                    <div className="flex-1">
                                        <GlassInput id="price" placeholder="Ex: 15 po" {...register("price")} error={errors.price?.message} autoFocus />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsPriceActive(false)
                                            setValue("price", "")
                                        }}
                                        className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-white/40 hover:text-rose-400 hover:bg-rose-400/10 transition-all mb-[1px]"
                                        title="Remover preço"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </motion.div>
                            ) : (
                                <GlassInlineEmptyState message="Nenhum preço definido para este item" />
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Rarity (Single row) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-amber-400/60" />
                            Raridade
                        </label>
                        <GlassSelector
                            options={RARITY_OPTIONS}
                            value={watch("rarity")}
                            onChange={(val) => setValue("rarity", val as ItemRarity)}
                            layoutId="item-rarity-form"
                            layout={isMobile ? "grid" : "horizontal"}
                            cols={isMobile ? 1 : 3}
                            fullWidth
                        />
                    </div>

                    {/* Type (Single row, Qualqer first) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                            <Boxes className="h-4 w-4" />
                            Tipo de Item
                        </label>
                        <GlassSelector
                            options={TYPE_OPTIONS}
                            value={watch("type")}
                            onChange={(val) => setValue("type", val as ItemType)}
                            layoutId="item-type-form"
                            layout={isMobile ? "grid" : "horizontal"}
                            cols={isMobile ? 1 : 3}
                            fullWidth
                        />
                    </div>

                    {/* Dynamic fields based on type */}
                    <AnimatePresence mode="popLayout">
                        {/* Weapon Specifics */}
                        {selectedType === "arma" && (
                            <WeaponFormFields
                                register={register}
                                setValue={setValue}
                                watch={watch}
                                control={control}
                                errors={errors}
                                isSubmitting={isSubmitting}
                                propertyFields={propertyFields}
                                appendProperty={appendProperty}
                                removeProperty={removeProperty}
                                additionalDamageFields={additionalDamageFields}
                                appendAdditionalDamage={appendAdditionalDamage}
                                removeAdditionalDamage={removeAdditionalDamage}
                            />
                        )}

                        {/* Armor/Shield Specifics */}
                        {(selectedType === "armadura" || selectedType === "escudo") && <ArmorFormFields selectedType={selectedType} setValue={setValue} watch={watch} errors={errors} />}
                    </AnimatePresence>

                    {/* Tool Specifics */}
                    {selectedType === "ferramenta" && <ToolFormFields watch={watch} setValue={setValue} />}

                    {/* Public Traits Section (Global/Non-Weapon specific traits) */}
                    <EntityListChooser
                        fields={traitFields}
                        append={appendTrait}
                        remove={removeTrait}
                        control={control}
                        isSubmitting={isSubmitting}
                        fieldName="traits"
                        errors={errors}
                        entityType="Habilidade"
                    />

                    {/* Footer Actions - Agora dentro do form para paridade com ClassFormModal */}
                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-white/10">
                        <button
                            type="button"
                            onClick={handleCloseAttempt}
                            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors disabled:opacity-50"
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className={cn(
                                "flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all shadow-lg active:scale-95",
                                "bg-blue-500 text-white shadow-blue-500/20 hover:bg-blue-600",
                                isSubmitting && "opacity-50 cursor-not-allowed",
                            )}
                            disabled={isSubmitting}
                        >
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isEditMode ? "Salvar Alterações" : "Criar Item"}
                        </button>
                    </div>
                </form>
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
