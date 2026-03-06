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
    Backpack, Plus, X, Pencil, Check, Sword, Shield, 
    Hammer, Package, Coins, Anchor, Info, Tag, 
    Search, Link, Library, Scale, Weight, Boxes,
    Loader2, ScrollText, Sparkles
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"

import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassConfirmClosing } from "@/components/ui/glass-confirm-closing"
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { GlassEntityChooser } from "@/components/ui/glass-entity-chooser"
import { ImageAndDescriptionSection, TraitsSection } from "@/features/classes/components/shared-form-components"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"

import { diceColors } from "@/lib/config/colors"
import { createItemSchema, type CreateItemSchema } from "../api/validation"
import { 
    Item, 
    ItemType, 
    ItemRarity, 
    ArmorType, 
    DamageType,
    CreateItemInput,
    UpdateItemInput
} from "../types/items.types"
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

const ARMOR_TYPE_OPTIONS = [
    { value: "nenhuma", label: "Nenhuma" },
    { value: "leve", label: "Leve" },
    { value: "média", label: "Média" },
    { value: "pesada", label: "Pesada" },
]

const DICE_TYPE_OPTIONS = [
    { value: "d4", label: "d4", activeColor: diceColors.d4.bg, textColor: diceColors.d4.text },
    { value: "d6", label: "d6", activeColor: diceColors.d6.bg, textColor: diceColors.d6.text },
    { value: "d8", label: "d8", activeColor: diceColors.d8.bg, textColor: diceColors.d8.text },
    { value: "d10", label: "d10", activeColor: diceColors.d10.bg, textColor: diceColors.d10.text },
    { value: "d12", label: "d12", activeColor: diceColors.d12.bg, textColor: diceColors.d12.text },
    { value: "d20", label: "d20", activeColor: diceColors.d20.bg, textColor: diceColors.d20.text },
]

const DAMAGE_TYPE_OPTIONS = [
    "cortante", "perfurante", "concussão", "ácido", "fogo", "frio", 
    "relâmpago", "trovão", "veneno", "psíquico", "radiante", "necrótico", "força"
].map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))

// ─── Empty States (following spell pattern) ───────────────────────────────────

function GlassInlineEmptyState({ message }: { message: string }) {
    return (
        <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white/30 italic">
            {message}
        </div>
    )
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ItemFormModalProps {
    item: Item | null
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ItemFormModal({ item, isOpen, onClose, onSuccess }: ItemFormModalProps) {
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
            description: item?.description ?? "",
            source: item?.source ?? "",
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
            damageType: item?.damageType ?? undefined,
            damageDice: (item?.damageDice as any) ?? undefined,
            effectDice: (item?.effectDice as any) ?? undefined,
            image: item?.image ?? "",
        },
    })

    const { fields: traitFields, append: appendTrait, remove: removeTrait } = useFieldArray({
        control,
        name: "traits" as any,
    })

    const { fields: propertyFields, append: appendProperty, remove: removeProperty } = useFieldArray({
        control,
        name: "properties" as any,
    })

    React.useEffect(() => {
        if (isOpen) {
            setShowConfirmClose(false)
            setIsPriceActive(!!item?.price)
            reset({
                name: item?.name ?? "",
                description: item?.description ?? "",
                source: item?.source ?? "",
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
                damageType: item?.damageType ?? undefined,
                damageDice: (item?.damageDice as any) ?? undefined,
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
        try {
            if (isEditMode && item) {
                await updateMutation.mutateAsync({ id: item._id, data: data as UpdateItemInput })
            } else {
                await createMutation.mutateAsync(data as CreateItemInput)
            }
            toast.success(item ? "Item atualizado com sucesso!" : "Item criado com sucesso!")
            onSuccess()
            onClose()
        } catch (error) {
            console.error("[ItemFormModal] Error:", error)
            toast.error(error instanceof Error ? error.message : "Erro ao salvar item")
        }
    }

    return (
        <>
            <GlassModal open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
                <GlassModalContent size="xl" className="max-w-[70vw]">
                    <GlassModalHeader>
                        <GlassModalTitle>{isEditMode ? `Editar ${item?.name}` : "Novo Item"}</GlassModalTitle>
                        <GlassModalDescription>{isEditMode ? "Atualize as informações do item" : "Crie um novo registro no catálogo de itens"}</GlassModalDescription>
                    </GlassModalHeader>

                    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6 mt-4">
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
                            <GlassInput 
                                id="source" 
                                label="Fonte" 
                                placeholder="Ex: PHB pg. 150" 
                                icon={<Link className="h-4 w-4" />} 
                                error={errors.source?.message} 
                                {...register("source")} 
                            />
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
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="flex items-end gap-2"
                                    >
                                        <div className="flex-1">
                                            <GlassInput
                                                id="price"
                                                placeholder="Ex: 15 po"
                                                {...register("price")}
                                                error={errors.price?.message}
                                                autoFocus
                                            />
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
                                <Scale className="h-4 w-4" />
                                Raridade
                            </label>
                            <GlassSelector
                                options={RARITY_OPTIONS}
                                value={watch("rarity")}
                                onChange={(val) => setValue("rarity", val as ItemRarity)}
                                layoutId="item-rarity-form"
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
                                fullWidth
                            />
                        </div>

                        {/* Dynamic fields based on type */}
                        <AnimatePresence mode="popLayout">
                            {/* Weapon Specifics */}
                            {selectedType === "arma" && (
                                <motion.div
                                    key="weapon-attrs"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-4"
                                >
                                    <div className="flex items-center gap-2">
                                        <Sword className="h-4 w-4 text-rose-400" />
                                        <h3 className="text-sm font-medium text-white/60">Atributos de Arma</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-white/40">Dano (Dados)</label>
                                            <div className="flex gap-2">
                                                <GlassInput
                                                    type="number"
                                                    className="w-16"
                                                    placeholder="Qty"
                                                    value={watch("damageDice.quantidade") || ""}
                                                    onChange={(e) => setValue("damageDice.quantidade", parseInt(e.target.value) || 0)}
                                                />
                                                <GlassSelector
                                                    options={DICE_TYPE_OPTIONS}
                                                    value={watch("damageDice.tipo") || "d6"}
                                                    onChange={(val) => setValue("damageDice.tipo", val as any)}
                                                    layoutId="damage-dice-type"
                                                    size="sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-white/40">Tipo de Dano</label>
                                            <GlassSelector
                                                options={DAMAGE_TYPE_OPTIONS}
                                                value={watch("damageType") || "cortante"}
                                                onChange={(val) => setValue("damageType", val as DamageType)}
                                                layoutId="damage-type-selector"
                                                size="sm"
                                            />
                                        </div>

                                        <GlassInput 
                                            label="Maestria" 
                                            placeholder="Ex: Cleave" 
                                            {...register("mastery" as any)} 
                                        />
                                    </div>

                                    {/* Properties (Rules) nested inside Weapon */}
                                    <TraitsSection
                                        fields={propertyFields}
                                        append={appendProperty}
                                        remove={removeProperty}
                                        control={control}
                                        isSubmitting={isSubmitting}
                                        traitsFieldName="properties"
                                        errors={errors}
                                    />
                                </motion.div>
                            )}

                            {/* Armor/Shield Specifics */}
                            {(selectedType === "armadura" || selectedType === "escudo") && (
                                <motion.div
                                    key="armor-attrs"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-4"
                                >
                                    <div className="flex items-center gap-2">
                                        <Shield className="h-4 w-4 text-blue-400" />
                                        <h3 className="text-sm font-medium text-white/60">Atributos de Defesa</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {selectedType === "armadura" ? (
                                            <>
                                                <GlassInput 
                                                    type="number" 
                                                    label="Classe de Armadura (CA)" 
                                                    placeholder="Ex: 15" 
                                                    value={watch("ac") || ""} 
                                                    onChange={(e) => setValue("ac", parseInt(e.target.value) || undefined)} 
                                                />
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-white/40">Tipo de Armadura</label>
                                                    <GlassSelector
                                                        options={ARMOR_TYPE_OPTIONS}
                                                        value={watch("armorType") || "nenhuma"}
                                                        onChange={(val) => setValue("armorType", val as ArmorType)}
                                                        layoutId="armor-type-selector"
                                                        size="sm"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-medium text-white/40">Tipo de CA</label>
                                                    <GlassSelector
                                                        options={[{ value: "base", label: "Base" }, { value: "bonus", label: "Bônus" }]}
                                                        value={watch("acType") || "base"}
                                                        onChange={(val) => setValue("acType", val as any)}
                                                        layoutId="ac-type-selector"
                                                        size="sm"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <GlassInput 
                                                type="number" 
                                                label="Bônus de CA" 
                                                placeholder="Ex: 2" 
                                                value={watch("acBonus") || ""} 
                                                onChange={(e) => setValue("acBonus", parseInt(e.target.value) || undefined)} 
                                            />
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Tool Specifics */}
                        {selectedType === "ferramenta" && (
                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Hammer className="h-4 w-4 text-amber-400" />
                                    <h3 className="text-sm font-medium text-white/60">Atributos de Ferramenta</h3>
                                </div>
                                <GlassInput 
                                    label="Atributo Associado" 
                                    placeholder="Ex: Destreza, Inteligência..." 
                                    {...register("attributeUsed" as any)} 
                                />
                            </div>
                        )}

                        {/* Public Traits Section (Global/Non-Weapon specific traits) */}
                        <TraitsSection
                            fields={traitFields}
                            append={appendTrait}
                            remove={removeTrait}
                            control={control}
                            isSubmitting={isSubmitting}
                            traitsFieldName="traits"
                            errors={errors}
                        />

                        {/* Footer Actions */}
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
                                    isSubmitting && "opacity-50 cursor-not-allowed"
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
