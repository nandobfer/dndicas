"use client";

import * as React from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Zap, Link, AlignLeft, Info, Trophy, Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/core/utils";
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSwitch } from "@/components/ui/glass-switch";
import { createFeatSchema, type CreateFeatSchema } from "../api/validation";
import { Feat, CreateFeatInput, UpdateFeatInput } from "../types/feats.types";
import { RichTextEditor } from "@/features/rules/components/rich-text-editor";

export interface FeatFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CreateFeatInput | UpdateFeatInput) => Promise<void>;
    feat?: Feat | null;
    isSubmitting?: boolean;
}

export function FeatFormModal({ isOpen, onClose, onSubmit, feat, isSubmitting = false }: FeatFormModalProps) {
    const isEditMode = !!feat;
    const [lastAddedIndex, setLastAddedIndex] = React.useState<number | null>(null)

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        control,
        reset,
        formState: { errors },
    } = useForm<CreateFeatSchema>({
        resolver: zodResolver(createFeatSchema) as any,
        defaultValues: {
            name: feat?.name || "",
            description: feat?.description || "",
            source: feat?.source || "",
            level: feat?.level || 1,
            prerequisites: feat?.prerequisites || [],
            status: feat?.status || "active",
        },
    })

    // Type assertion needed: react-hook-form's useFieldArray has type inference issues
    // with Zod schemas containing array fields. The `as never` cast bypasses the narrowing
    // issue while keeping proper runtime behavior. See: https://github.com/react-hook-form/react-hook-form/issues/6679
    const { fields, append, remove } = useFieldArray({
        control,
        name: "prerequisites" as never,
    })

    // Reset form when modal opens/closes or feat changes
    React.useEffect(() => {
        if (isOpen) {
            setLastAddedIndex(null)
            reset({
                name: feat?.name || "",
                description: feat?.description || "",
                source: feat?.source || "",
                level: feat?.level || 1,
                prerequisites: feat?.prerequisites || [],
                status: feat?.status || "active",
            })
        }
    }, [isOpen, feat, reset])

    const handleFormSubmit = async (data: CreateFeatSchema) => {
        // Filter out empty prerequisites (considering TipTap might return <p></p>)
        const cleanedData = {
            ...data,
            prerequisites: (data.prerequisites || []).filter((p: string) => {
                if (!p) return false
                const plainText = p.replace(/<[^>]*>/g, "").trim()
                return plainText.length > 0
            }),
        }
        await onSubmit(cleanedData as CreateFeatInput | UpdateFeatInput)
    }

    const handleAddPrerequisite = () => {
        append("")
        setLastAddedIndex(fields.length)
    }

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="xl">
                <GlassModalHeader>
                    <GlassModalTitle>{isEditMode ? "Editar Talento" : "Novo Talento"}</GlassModalTitle>
                    <GlassModalDescription>{isEditMode ? "Atualize as informações do talento" : "Crie um novo registro no catálogo de talentos"}</GlassModalDescription>
                </GlassModalHeader>

                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 mt-4">
                    {/* Name */}
                    <GlassInput id="name" label="Nome do Talento" placeholder="Ex: Mestre em Armas" icon={<Zap />} error={errors.name?.message} {...register("name")} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Source */}
                        <GlassInput id="source" label="Fonte / Referência" placeholder="Ex: PHB pg. 167" icon={<Link />} error={errors.source?.message} {...register("source")} />

                        {/* Level */}
                        <GlassInput
                            id="level"
                            type="text"
                            inputMode="numeric"
                            label="Nível Mínimo"
                            placeholder="1"
                            icon={<Trophy />}
                            error={errors.level?.message}
                            {...register("level", {
                                setValueAs: (v) => (v === "" ? undefined : parseInt(v, 10)),
                                onChange: (e) => {
                                    e.target.value = e.target.value.replace(/\D/g, "")
                                },
                            })}
                        />
                    </div>

                    {/* Status Switch */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium text-white">Status do Talento</label>
                            <p className="text-xs text-white/60">Talentos inativos não aparecem nas buscas públicas</p>
                        </div>
                        <GlassSwitch checked={watch("status") === "active"} onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")} disabled={isSubmitting} />
                    </div>

                    {/* Prerequisites Dynamic List */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                Pré-requisitos
                            </label>
                            <button
                                type="button"
                                onClick={handleAddPrerequisite}
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
                                Adicionar Pré-requisito
                            </button>
                        </div>

                        <AnimatePresence mode="popLayout">
                            {fields.length === 0 ? (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-white/40 italic text-center py-4">
                                    Nenhum pré-requisito adicionado
                                </motion.div>
                            ) : (
                                <div className="space-y-2">
                                    {fields.map((field, index) => (
                                        <motion.div
                                            key={field.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex items-start gap-2"
                                        >
                                            <div className="flex-1">
                                                <Controller
                                                    name={`prerequisites.${index}` as any}
                                                    control={control}
                                                    render={({ field: controllerField }) => (
                                                        <RichTextEditor
                                                            variant="simple"
                                                            value={controllerField.value || ""}
                                                            onChange={controllerField.onChange}
                                                            placeholder="Ex: Força 13 ou superior"
                                                            className={errors.prerequisites?.[index] ? "border-rose-500/50" : ""}
                                                            disabled={isSubmitting}
                                                            excludeId={feat?._id}
                                                            autoFocus={index === lastAddedIndex}
                                                        />
                                                    )}
                                                />
                                                {errors.prerequisites?.[index] && (
                                                    <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                                        <Info className="h-3 w-3" />
                                                        {(errors.prerequisites[index] as any).message}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => remove(index)}
                                                disabled={isSubmitting}
                                                className={cn("p-2 rounded-lg transition-colors mt-1", "text-rose-400 hover:bg-rose-500/20", "disabled:opacity-50 disabled:cursor-not-allowed")}
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </AnimatePresence>
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
                                    placeholder="Descreva o talento detalhadamente... (Suporta imagens S3 e formatação)"
                                    className={errors.description ? "border-rose-500/50" : ""}
                                    disabled={isSubmitting}
                                    excludeId={feat?._id}
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
                                "shadow-lg shadow-blue-500/20",
                            )}
                        >
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isEditMode ? "Salvar Alterações" : "Criar Talento"}
                        </button>
                    </div>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
