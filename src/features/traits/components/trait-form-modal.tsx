"use client";

import * as React from "react";
import { useForm, Controller, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Sparkles, Link, AlignLeft, Info, Languages, Battery, Plus, Trash2, ListOrdered } from "lucide-react";
import { cn } from "@/core/utils";
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { GlassConfirmClosing } from "@/components/ui/glass-confirm-closing"
import { GlassSelector } from "@/components/ui/glass-selector";
import { createTraitSchema } from "../api/validation"
import { Trait, CreateTraitInput, UpdateTraitInput } from "../types/traits.types"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"
import { z } from "zod";

export interface TraitFormModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: CreateTraitInput | UpdateTraitInput) => Promise<void>
    trait?: Trait | null
    isSubmitting?: boolean
}

type TraitFormValues = z.input<typeof createTraitSchema>
type ChargeModeOption = "none" | "fixed" | "byLevel"
type TraitChargesByLevelFormRow = { level: string; value: string }
type ChargeFieldErrors = {
    value?: { message?: string }
    values?: Array<{
        level?: { message?: string }
        value?: { message?: string }
    }>
    message?: string
}

const CHARGE_MODE_OPTIONS = [
    { value: "none", label: "Nenhuma", activeColor: "bg-white/10" },
    { value: "fixed", label: "Fixa", activeColor: "bg-emerald-500/20", textColor: "#6ee7b7" },
    { value: "byLevel", label: "Por nível", activeColor: "bg-blue-500/20", textColor: "#93c5fd" },
] as const

const LEVEL_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1)

export function TraitFormModal({ isOpen, onClose, onSubmit, trait, isSubmitting = false }: TraitFormModalProps) {
    const isEditMode = !!trait
    const [showConfirmClose, setShowConfirmClose] = React.useState(false)
    const fixedChargesRef = React.useRef("")
    const byLevelChargesRef = React.useRef<TraitChargesByLevelFormRow[]>([{ level: "1", value: "" }])

    const {
        register,
        handleSubmit,
        setValue,
        getFieldState,
        control,
        reset,
        formState: { errors, isDirty, submitCount }
    } = useForm<TraitFormValues>({
        resolver: zodResolver(createTraitSchema),
        defaultValues: {
            name: trait?.name || "",
            originalName: trait?.originalName || "",
            description: trait?.description || "",
            charges: trait?.charges || undefined,
            source: trait?.source || "LDJ pág. ",
            status: trait?.status || "active"
        }
    })

    const { fields, append, remove, replace } = useFieldArray({
        control,
        name: "charges.values" as never,
    })

    const watchedCharges = useWatch({ control, name: "charges" })
    const watchedStatus = useWatch({ control, name: "status" })
    const chargeMode = watchedCharges?.mode ?? "none"
    const chargeErrors = errors.charges as unknown as ChargeFieldErrors | undefined
    const shouldShowChargeErrors = submitCount > 0

    React.useEffect(() => {
        if (watchedCharges?.mode === "fixed") {
            fixedChargesRef.current = watchedCharges.value
        }
        if (watchedCharges?.mode === "byLevel") {
            byLevelChargesRef.current = watchedCharges.values.length > 0
                ? watchedCharges.values.map((row) => ({ level: String(row.level ?? ""), value: row.value }))
                : [{ level: "1", value: "" }]
        }
    }, [watchedCharges])

    // Reset form when modal opens/closes or trait changes
    React.useEffect(() => {
        if (isOpen) {
            setShowConfirmClose(false)
            fixedChargesRef.current = trait?.charges?.mode === "fixed" ? trait.charges.value : ""
            byLevelChargesRef.current = trait?.charges?.mode === "byLevel" && trait.charges.values.length > 0
                ? trait.charges.values.map((row) => ({ level: String(row.level), value: row.value }))
                : [{ level: "1", value: "" }]
            reset({
                name: trait?.name || "",
                originalName: trait?.originalName || "",
                description: trait?.description || "",
                charges: trait?.charges || undefined,
                source: trait?.source || "LDJ pág. ",
                status: trait?.status || "active"
            })
        }
    }, [isOpen, trait, reset])

    const handleChargeModeChange = (nextMode: ChargeModeOption) => {
        if (nextMode === "none") {
            replace([])
            setValue("charges", undefined, { shouldDirty: true, shouldValidate: false })
            return
        }

        if (nextMode === "fixed") {
            replace([])
            setValue(
                "charges",
                { mode: "fixed", value: fixedChargesRef.current || "" },
                { shouldDirty: true, shouldValidate: false },
            )
            return
        }

        const rows = byLevelChargesRef.current.length > 0 ? byLevelChargesRef.current : [{ level: "1", value: "" }]
        replace(rows as never)
        setValue(
            "charges",
            { mode: "byLevel", values: rows },
            { shouldDirty: true, shouldValidate: false },
        )
    }

    const handleAddChargeRow = () => {
        const existingLevels = new Set(
            (watchedCharges?.mode === "byLevel" ? watchedCharges.values : [])
                .map((row) => Number(row.level))
                .filter((level) => Number.isFinite(level)),
        )
        const nextLevel = LEVEL_OPTIONS.find((level) => !existingLevels.has(level)) ?? 1
        append({ level: String(nextLevel), value: "" } as never)
    }

    const sanitizeLevelInput = (index: number, rawValue: string) => {
        const digitsOnly = rawValue.replace(/\D/g, "")
        setValue(`charges.values.${index}.level` as const, digitsOnly as never, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: false,
        })
    }

    const shouldShowChargeFieldError = (fieldName: `charges.values.${number}.level` | `charges.values.${number}.value`) => {
        if (shouldShowChargeErrors) return true
        const fieldState = getFieldState(fieldName, control._formState)
        return fieldState.isTouched && fieldState.invalid
    }

    const handleFormSubmit = async (data: TraitFormValues) => {
        const cleanedData = {
            ...data,
            originalName: data.originalName?.trim() || undefined,
            charges: data.charges
                ? data.charges.mode === "fixed"
                    ? { mode: "fixed" as const, value: data.charges.value }
                    : { mode: "byLevel" as const, values: data.charges.values }
                : undefined,
        }
        await onSubmit(cleanedData as CreateTraitInput | UpdateTraitInput)
        setShowConfirmClose(false)
    }

    const handleCloseAttempt = () => {
        if (isDirty) {
            setShowConfirmClose(true)
        } else {
            onClose()
        }
    }

    return (
        <>
            <GlassModal open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <GlassInput
                                    id="source"
                                    label="Fonte / Referência"
                                    placeholder="Ex: PHB pg. 48"
                                    icon={<Link />}
                                    error={errors.source?.message}
                                    {...register("source")}
                                />
                                <GlassInput
                                    id="originalName"
                                    label="Nome em Inglês"
                                    placeholder="Ex: Barbarian Rage"
                                    icon={<Languages />}
                                    error={errors.originalName?.message}
                                    {...register("originalName")}
                                />
                            </div>
                        </div>

                        {/* Status Switch */}
                        <GlassStatusSwitch
                            entityLabel="Status da Habilidade"
                            description="Habilidades inativas não aparecem nas buscas públicas"
                            checked={watchedStatus === "active"}
                            onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")}
                            disabled={isSubmitting}
                        />

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

                        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <Battery className="h-4 w-4" />
                                    Cargas
                                </label>
                                <p className="text-xs text-white/45">
                                    Defina uma carga fixa ou uma progressão por nível. Valores aceitos: <span className="font-mono">3</span>, <span className="font-mono">1d6</span>, <span className="font-mono">4d8</span>.
                                </p>
                            </div>

                            <GlassSelector
                                value={chargeMode}
                                onChange={(value) => handleChargeModeChange(value as ChargeModeOption)}
                                options={CHARGE_MODE_OPTIONS.map((option) => ({ ...option, label: option.label }))}
                                fullWidth
                                layoutId="trait-charge-mode"
                            />

                            {chargeMode === "fixed" && (
                                <GlassInput
                                    id="charges.fixed"
                                    label="Carga Fixa"
                                    placeholder="Ex: 3 ou 1d6"
                                    icon={<Battery />}
                                    error={shouldShowChargeErrors ? chargeErrors?.value?.message : undefined}
                                    {...register("charges.value" as const)}
                                />
                            )}

                            {chargeMode === "byLevel" && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/40">
                                            <ListOrdered className="h-3.5 w-3.5" />
                                            Progressão de cargas
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAddChargeRow}
                                            disabled={isSubmitting || fields.length >= LEVEL_OPTIONS.length}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Linha
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {fields.map((field, index) => (
                                            <div
                                                key={field.id}
                                                className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2 rounded-xl border border-white/10 bg-black/10 p-3"
                                            >
                                                <div className="space-y-1">
                                                    <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                                                        Nível
                                                    </label>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        autoComplete="off"
                                                        value={String(watchedCharges?.mode === "byLevel" ? watchedCharges.values[index]?.level ?? "" : "")}
                                                        onChange={(event) => sanitizeLevelInput(index, event.target.value)}
                                                        disabled={isSubmitting}
                                                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/25"
                                                        placeholder="Ex: 5"
                                                    />
                                                    {shouldShowChargeFieldError(`charges.values.${index}.level`) && chargeErrors?.values?.[index]?.level?.message && (
                                                        <p className="text-xs text-rose-400">
                                                            {chargeErrors.values[index]?.level?.message}
                                                        </p>
                                                    )}
                                                </div>

                                                <GlassInput
                                                    id={`charges.values.${index}.value`}
                                                    label="Cargas"
                                                    placeholder="Ex: 2 ou 1d6"
                                                    icon={<Battery />}
                                                    error={shouldShowChargeFieldError(`charges.values.${index}.value`) ? chargeErrors?.values?.[index]?.value?.message : undefined}
                                                    {...register(`charges.values.${index}.value` as const)}
                                                />

                                                <div className="flex items-center self-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => remove(index)}
                                                        disabled={isSubmitting}
                                                        className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Remover linha"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {shouldShowChargeErrors && chargeErrors?.message && (
                                        <p className="text-xs text-rose-400 animate-slide-down flex items-center gap-1">
                                            <Info className="h-3 w-3" />
                                            {chargeErrors.message}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
                            <button
                                type="button"
                                onClick={handleCloseAttempt}
                                disabled={isSubmitting}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                    "text-white/60 hover:text-white hover:bg-white/10",
                                    "disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    "flex items-center gap-2"
                                )}
                            >
                                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                {isEditMode ? "Salvar Alterações" : "Criar Habilidade"}
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
                onSaveAndExit={handleSubmit(handleFormSubmit)}
                isSaving={isSubmitting}
            />
        </>
    )
}
