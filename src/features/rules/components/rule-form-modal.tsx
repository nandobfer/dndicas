"use client"

import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, ScrollText, Link, AlignLeft, Info } from "lucide-react"
import { cn } from "@/core/utils"
// Ensure these imports point to the correct files
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSwitch } from "@/components/ui/glass-switch"
import { createReferenceSchema, updateReferenceSchema, type CreateReferenceSchema, type UpdateReferenceSchema } from "../api/validation"
import { Reference, CreateReferenceInput, UpdateReferenceInput } from "../types/rules.types"
import { RichTextEditor } from "./rich-text-editor"

export interface RuleFormModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: CreateReferenceInput | UpdateReferenceInput) => Promise<void>
    rule?: Reference | null
    isSubmitting?: boolean
}

export function RuleFormModal({ isOpen, onClose, onSubmit, rule, isSubmitting = false }: RuleFormModalProps) {
    const isEditMode = !!rule

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        control,
        reset,
        formState: { errors },
    } = useForm<CreateReferenceSchema | UpdateReferenceSchema>({
        resolver: zodResolver(isEditMode ? updateReferenceSchema : createReferenceSchema),
        defaultValues: {
            name: rule?.name || "",
            description: rule?.description || "",
            source: rule?.source || "",
            status: rule?.status || "active",
        },
    })

    // Reset form when modal opens/closes or rule changes
    React.useEffect(() => {
        if (isOpen) {
            reset({
                name: rule?.name || "",
                description: rule?.description || "",
                source: rule?.source || "",
                status: rule?.status || "active",
            })
        }
    }, [isOpen, rule, reset])

    const handleFormSubmit = async (data: CreateReferenceSchema | UpdateReferenceSchema) => {
        // Cast to appropriate input type as the schema infers slightly different types than the interface
        await onSubmit(data as CreateReferenceInput | UpdateReferenceInput)
    }

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="xl">
                <GlassModalHeader>
                    <GlassModalTitle>{isEditMode ? "Editar Regra" : "Nova Regra"}</GlassModalTitle>
                    <GlassModalDescription>{isEditMode ? "Atualize as informações da regra de referência" : "Crie um novo registro no catálogo de regras"}</GlassModalDescription>
                </GlassModalHeader>

                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Name */}
                        <GlassInput 
                            id="name" 
                            label="Nome da Regra" 
                            placeholder="Ex: Agarrar (Grapple)" 
                            icon={<ScrollText />} 
                            error={errors.name?.message} 
                            {...register("name")} 
                        />

                        {/* Source */}
                        <GlassInput 
                            id="source" 
                            label="Fonte / Referência" 
                            placeholder="Ex: PHB pg. 195" 
                            icon={<Link />} 
                            error={errors.source?.message} 
                            {...register("source")} 
                        />
                    </div>

                    {/* Status Switch */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium text-white">Status da Regra</label>
                            <p className="text-xs text-white/60">Regras inativas não aparecem nas buscas públicas</p>
                        </div>
                        <GlassSwitch
                            checked={watch("status") === "active"}
                            onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")}
                            disabled={isSubmitting}
                        />
                    </div>

                    {/* Rich Text Description */}
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
                                    placeholder="Descreva a regra detalhadamente... (Suporta imagens e formatação)"
                                    className={errors.description ? "border-rose-500/50" : ""}
                                    disabled={isSubmitting}
                                    excludeId={rule?._id}
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
                            {isEditMode ? "Salvar Alterações" : "Criar Regra"}
                        </button>
                    </div>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
