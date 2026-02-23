"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Sparkles, Link, AlignLeft, Info } from "lucide-react";
import { cn } from "@/core/utils";
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSwitch } from "@/components/ui/glass-switch";
import { createTraitSchema, updateTraitSchema, type CreateTraitSchema, type UpdateTraitSchema } from "../api/validation";
import { Trait, CreateTraitInput, UpdateTraitInput } from "../types/traits.types";
import { RichTextEditor } from "@/features/rules/components/rich-text-editor";

export interface TraitFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CreateTraitInput | UpdateTraitInput) => Promise<void>;
    trait?: Trait | null;
    isSubmitting?: boolean;
}

export function TraitFormModal({ isOpen, onClose, onSubmit, trait, isSubmitting = false }: TraitFormModalProps) {
    const isEditMode = !!trait;

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        control,
        reset,
        formState: { errors },
    } = useForm<CreateTraitSchema | UpdateTraitSchema>({
        resolver: zodResolver(isEditMode ? updateTraitSchema : createTraitSchema),
        defaultValues: {
            name: trait?.name || "",
            description: trait?.description || "",
            source: trait?.source || "",
            status: trait?.status || "active",
        },
    });

    // Reset form when modal opens/closes or trait changes
    React.useEffect(() => {
        if (isOpen) {
            reset({
                name: trait?.name || "",
                description: trait?.description || "",
                source: trait?.source || "",
                status: trait?.status || "active",
            });
        }
    }, [isOpen, trait, reset]);

    const handleFormSubmit = async (data: CreateTraitSchema | UpdateTraitSchema) => {
        // Cast to appropriate input type as the schema infers slightly different types than the interface
        await onSubmit(data as CreateTraitInput | UpdateTraitInput);
    };

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="xl">
                <GlassModalHeader>
                    <GlassModalTitle>{isEditMode ? "Editar Habilidade" : "Nova Habilidade"}</GlassModalTitle>
                    <GlassModalDescription>
                        {isEditMode ? "Atualize as informações da habilidade" : "Crie um novo registro no catálogo de habilidades"}
                    </GlassModalDescription>
                </GlassModalHeader>

                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Name */}
                        <GlassInput 
                            id="name" 
                            label="Nome da Habilidade" 
                            placeholder="Ex: Fúria Bárbara" 
                            icon={<Sparkles />} 
                            error={errors.name?.message} 
                            {...register("name")} 
                        />

                        {/* Source */}
                        <GlassInput 
                            id="source" 
                            label="Fonte / Referência" 
                            placeholder="Ex: PHB pg. 48" 
                            icon={<Link />} 
                            error={errors.source?.message} 
                            {...register("source")} 
                        />
                    </div>

                    {/* Status Switch */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium text-white">Status da Habilidade</label>
                            <p className="text-xs text-white/60">Habilidades inativas não aparecem nas buscas públicas</p>
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
                                    placeholder="Descreva a habilidade detalhadamente... (Suporta imagens S3 e formatação)"
                                    className={errors.description ? "border-rose-500/50" : ""}
                                    disabled={isSubmitting}
                                    excludeId={trait?._id}
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
                            {isEditMode ? "Salvar Alterações" : "Criar Habilidade"}
                        </button>
                    </div>
                </form>
            </GlassModalContent>
        </GlassModal>
    );
}
