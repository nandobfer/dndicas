/**
 * @fileoverview Background creation and edition modal.
 * Follows the visual pattern and structure of ClassFormModal.
 */

"use client";

import * as React from "react"
import { useForm, Controller, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, BookOpen, X, Loader2, Info, Sparkles, ScrollText, GraduationCap, Link } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"

import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassConfirmClosing } from "@/components/ui/glass-confirm-closing"
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { GlassEntityChooser } from "@/components/ui/glass-entity-chooser"
import { ImageAndDescriptionSection, TraitsSection, SkillSelection, EquipmentSection } from "@/features/classes/components/shared-form-components"

import { attributeColors, type AttributeType } from "@/lib/config/colors"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"

import { 
    Background, 
    CreateBackgroundInput, 
    UpdateBackgroundInput 
} from "../types/backgrounds.types"
import { useCreateBackground, useUpdateBackground } from "../api/backgrounds-queries"
import { useFeat } from "@/features/feats/hooks/useFeats"

// ── Shared Constants ─────────────────────────────────────────────────────────

const featProvider = ENTITY_PROVIDERS.find(p => p.name === "Talento")

const ATTRIBUTE_OPTIONS = (Object.entries(attributeColors) as [AttributeType, (typeof attributeColors)[AttributeType]][]).map(([key, config]) => ({
    value: key,
    label: key,
    activeColor: config.bgAlpha,
    textColor: config.text,
}))

// ── Props ───────────────────────────────────────────────────────────────────

export interface BackgroundFormModalProps {
    background: Background | any // Permite receber o que vem do backend (id vs _id, featId como objeto)
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function BackgroundFormModal({ background, isOpen, onClose, onSuccess }: BackgroundFormModalProps) {
    const isEditMode = !!background
    const createMutation = useCreateBackground()
    const updateMutation = useUpdateBackground()
    const isSubmitting = createMutation.isPending || updateMutation.isPending
    const [showConfirmClose, setShowConfirmClose] = React.useState(false)

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        control,
        reset,
        formState: { errors, isDirty }
    } = useForm<CreateBackgroundInput>({
        defaultValues: {
            name: background?.name ?? "",
            description: background?.description ?? "",
            source: background?.source ?? "LDJ pág. ",
            status: background?.status ?? "active",
            image: background?.image ?? "",
            skillProficiencies: background?.skillProficiencies ?? [],
            suggestedAttributes: background?.suggestedAttributes ?? [],
            featId: background?.featId ?? "",
            equipment: background?.equipment ?? "",
            traits: background?.traits ?? []
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

    // Reset when modal opens/closes or background changes
    React.useEffect(() => {
        if (isOpen) {
            setShowConfirmClose(false)
            reset({
                name: background?.name ?? "",
                description: background?.description ?? "",
                source: background?.source ?? "LDJ pág. ",
                status: background?.status ?? "active",
                image: background?.image ?? "",
                skillProficiencies: background?.skillProficiencies ?? [],
                suggestedAttributes: background?.suggestedAttributes ?? [],
                featId: background?.featId ?? "",
                equipment: background?.equipment ?? "",
                traits: background?.traits ?? []
            })
        }
    }, [isOpen, background, reset])

    const handleCloseAttempt = () => {
        if (isDirty) {
            setShowConfirmClose(true)
        } else {
            onClose()
        }
    }

    // ── Submit ───────────────────────────────────────────────────────────────

    const onSubmit = async (data: CreateBackgroundInput) => {
        // Limpeza dos dados
        const cleanData = {
            ...data,
            traits: (data.traits || [])
                .filter(t => t.description && t.description.trim() !== "")
        }

        try {
            if (isEditMode && background) {
                const id = background._id || background.id
                await updateMutation.mutateAsync({ id, data: cleanData as UpdateBackgroundInput })
                toast.success("Origem atualizada com sucesso!")
            } else {
                await createMutation.mutateAsync(cleanData as CreateBackgroundInput)
                toast.success("Origem criada com sucesso!")
            }
            onSuccess()
            onClose()
        } catch (error) {
            console.error("[BackgroundFormModal] Error submitting:", error)
            toast.error("Ocorreu um erro ao salvar a origem.")
        }
    }

    return (
        <>
            <GlassModal open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
                <GlassModalContent size="xl" className="max-w-[70vw]">
                    <GlassModalHeader>
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                                <GlassModalTitle className="text-2xl font-bold tracking-tight">
                                    {isEditMode ? `Editar Origem: ${background?.name}` : "Nova Origem"}
                                </GlassModalTitle>
                                <GlassModalDescription className="text-white/40">
                                    {isEditMode 
                                        ? "Atualize os detalhes e mecânicas desta origem." 
                                        : "Defina uma nova origem com seus benefícios e história."}
                                </GlassModalDescription>
                            </div>
                        </div>
                    </GlassModalHeader>

                    <form id="background-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
                        {/* Row 1: Status switch */}
                        <GlassStatusSwitch
                            entityLabel="Origem"
                            description="Define se esta origem estará disponível para seleção de personagens"
                            checked={watch("status") === "active"}
                            onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")}
                            disabled={isSubmitting}
                        />

                        {/* Row 2: Name & Source */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <GlassInput 
                                id="name" 
                                label="Nome da Origem" 
                                placeholder="Ex: Acólito" 
                                icon={<GraduationCap className="h-4 w-4" />} 
                                required 
                                error={errors.name?.message} 
                                {...register("name")} 
                            />
                            <GlassInput 
                                id="source" 
                                label="Fonte" 
                                placeholder="Ex: LDJ pág. " 
                                icon={<Link className="h-4 w-4" />} 
                                error={errors.source?.message} 
                                {...register("source")} 
                            />
                        </div>

                        {/* Row 3: Art & Description */}
                        <ImageAndDescriptionSection
                            control={control}
                            isSubmitting={isSubmitting}
                            errors={errors}
                            imageFieldName="image"
                            descriptionFieldName="description"
                            entityId={background?._id}
                            placeholder="Descreva a história, as influências e o papel desta origem no mundo..."
                        />

                        {/* Row 4: Feat */}
                        <div className="space-y-2 pt-2">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <ScrollText className="h-4 w-4 text-blue-400" />
                                Talento Adquirido
                            </label>
                            <Controller
                                name="featId"
                                control={control}
                                render={({ field }) => (
                                    <GlassEntityChooser
                                        provider={featProvider as any}
                                        value={field.value}
                                        onChange={(val: any) => {
                                            field.onChange(val)
                                        }}
                                        placeholder="Selecione o talento concedido..."
                                        disabled={isSubmitting}
                                    />
                                )}
                            />
                        </div>

                        {/* Row 5: Attributes */}
                        <div className="space-y-2 pt-2">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-amber-400" />
                                Bônus de Atributo
                            </label>
                            <Controller
                                name="suggestedAttributes"
                                control={control}
                                render={({ field }) => (
                                    <GlassSelector
                                        options={ATTRIBUTE_OPTIONS}
                                        value={field.value || []}
                                        onChange={field.onChange}
                                        mode="multi"
                                        layout="horizontal"
                                        fullWidth
                                        disabled={isSubmitting}
                                        layoutId="background-attributes"
                                    />
                                )}
                            />
                        </div>

                        {/* Row 6: Skills */}
                        <SkillSelection
                            control={control}
                            isSubmitting={isSubmitting}
                            errors={errors}
                            availableSkillsFieldName="skillProficiencies"
                            label="Proficiência nas Perícias"
                        />

                        {/* Row 7: Traits */}
                        <TraitsSection
                            fields={traitFields}
                            append={appendTrait}
                            remove={removeTrait}
                            control={control}
                            isSubmitting={isSubmitting}
                            traitsFieldName="traits"
                            errors={errors}
                        />

                        {/* Row 8: Equipment */}
                        <EquipmentSection isSubmitting={isSubmitting} />

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
                                {isSubmitting ? "Salvando..." : isEditMode ? "Salvar Alterações" : "Criar Origem"}
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
                onSaveAndExit={handleSubmit(onSubmit)}
                isSaving={isSubmitting}
            />
        </>
    )
}
