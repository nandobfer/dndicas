"use client"

import * as React from "react"
import { Battery, Info, ListOrdered, Plus, Trash2 } from "lucide-react"
import { attributeColors, type AttributeType } from "@/lib/config/colors"
import {
    type Control,
    type FieldErrors,
    type FieldValues,
    type Path,
    type UseFormRegister,
    type UseFormGetFieldState,
    type UseFormSetValue,
    useFieldArray,
    useWatch,
} from "react-hook-form"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import type { Charges } from "./types"

type ChargeModeOption = "none" | "fixed" | "proficiency" | "attribute" | "byLevel"
type ChargesByLevelFormRow = { level: string; value: string }
type ChargeFieldErrors = {
    attribute?: { message?: string }
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
    { value: "proficiency", label: "Proficiência", activeColor: "bg-amber-500/20", textColor: "#fcd34d" },
    { value: "attribute", label: "Atributo", activeColor: "bg-violet-500/20", textColor: "#c4b5fd" },
    { value: "byLevel", label: "Por nível", activeColor: "bg-blue-500/20", textColor: "#93c5fd" },
] as const

const LEVEL_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1)
const ATTRIBUTE_OPTIONS = (Object.entries(attributeColors) as [AttributeType, (typeof attributeColors)[AttributeType]][]).map(([key, config]) => ({
    value: key,
    label: config.name,
    activeColor: config.bgAlpha,
    textColor: config.hex,
}))

export interface ChargesFormSectionProps<TFieldValues extends FieldValues = FieldValues> {
    control: Control<TFieldValues>
    register: UseFormRegister<TFieldValues>
    setValue: UseFormSetValue<TFieldValues>
    getFieldState: UseFormGetFieldState<TFieldValues>
    errors: FieldErrors<TFieldValues>
    submitCount: number
    disabled?: boolean
    initialCharges?: Charges
    title?: string
    description?: string
}

export function ChargesFormSection<TFieldValues extends FieldValues = FieldValues>({
    control,
    register,
    setValue,
    getFieldState,
    errors,
    submitCount,
    disabled = false,
    initialCharges,
    title = "Cargas",
    description = 'Defina uma carga fixa ou uma progressão por nível. Valores aceitos: "3", "1d6", "4d8".',
}: ChargesFormSectionProps<TFieldValues>) {
    const fixedChargesRef = React.useRef("")
    const attributeChargesRef = React.useRef<AttributeType>("Sabedoria")
    const byLevelChargesRef = React.useRef<ChargesByLevelFormRow[]>([{ level: "1", value: "" }])

    const { fields, append, remove, replace } = useFieldArray({
        control,
        name: "charges.values" as never,
    })

    const watchedCharges = useWatch({
        control,
        name: "charges" as Path<TFieldValues>,
    }) as Charges | { mode: "byLevel"; values: ChargesByLevelFormRow[] } | { mode: "fixed"; value: string } | { mode: "proficiency" } | { mode: "attribute"; attribute: AttributeType } | undefined

    const chargeMode = watchedCharges?.mode ?? "none"
    const chargeErrors = errors.charges as unknown as ChargeFieldErrors | undefined
    const shouldShowChargeErrors = submitCount > 0

    React.useEffect(() => {
        fixedChargesRef.current = initialCharges?.mode === "fixed" ? initialCharges.value : ""
        attributeChargesRef.current = initialCharges?.mode === "attribute" ? initialCharges.attribute : "Sabedoria"
        byLevelChargesRef.current =
            initialCharges?.mode === "byLevel" && initialCharges.values.length > 0
                ? initialCharges.values.map((row) => ({ level: String(row.level), value: row.value }))
                : [{ level: "1", value: "" }]
    }, [initialCharges])

    React.useEffect(() => {
        if (watchedCharges?.mode === "fixed") {
            fixedChargesRef.current = watchedCharges.value
        }
        if (watchedCharges?.mode === "attribute") {
            attributeChargesRef.current = watchedCharges.attribute
        }
        if (watchedCharges?.mode === "byLevel") {
            byLevelChargesRef.current =
                watchedCharges.values.length > 0
                    ? watchedCharges.values.map((row) => ({ level: String(row.level ?? ""), value: row.value }))
                    : [{ level: "1", value: "" }]
        }
    }, [watchedCharges])

    const handleChargeModeChange = (nextMode: ChargeModeOption) => {
        if (nextMode === "none") {
            replace([])
            setValue("charges" as Path<TFieldValues>, undefined as never, { shouldDirty: true, shouldValidate: false })
            return
        }

        if (nextMode === "fixed") {
            replace([])
            setValue("charges" as Path<TFieldValues>, { mode: "fixed", value: fixedChargesRef.current || "" } as never, {
                shouldDirty: true,
                shouldValidate: false,
            })
            return
        }

        if (nextMode === "proficiency") {
            replace([])
            setValue("charges" as Path<TFieldValues>, { mode: "proficiency" } as never, {
                shouldDirty: true,
                shouldValidate: false,
            })
            return
        }

        if (nextMode === "attribute") {
            replace([])
            setValue("charges" as Path<TFieldValues>, { mode: "attribute", attribute: attributeChargesRef.current } as never, {
                shouldDirty: true,
                shouldValidate: false,
            })
            return
        }

        const rows = byLevelChargesRef.current.length > 0 ? byLevelChargesRef.current : [{ level: "1", value: "" }]
        replace(rows as never)
        setValue("charges" as Path<TFieldValues>, { mode: "byLevel", values: rows } as never, {
            shouldDirty: true,
            shouldValidate: false,
        })
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
        setValue(`charges.values.${index}.level` as Path<TFieldValues>, digitsOnly as never, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: false,
        })
    }

    const shouldShowChargeFieldError = (fieldName: `charges.values.${number}.level` | `charges.values.${number}.value`) => {
        if (shouldShowChargeErrors) return true
        const fieldState = getFieldState(fieldName as Path<TFieldValues>)
        return fieldState.isTouched && fieldState.invalid
    }

    return (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="space-y-2">
                <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                    <Battery className="h-4 w-4" />
                    {title}
                </label>
                <p className="text-xs text-white/45">{description}</p>
            </div>

            <GlassSelector
                value={chargeMode}
                onChange={(value) => handleChargeModeChange(value as ChargeModeOption)}
                options={CHARGE_MODE_OPTIONS.map((option) => ({ ...option, label: option.label }))}
                fullWidth
                layoutId={`${title.toLowerCase().replace(/\s+/g, "-")}-charge-mode`}
                disabled={disabled}
            />

            {chargeMode === "fixed" && (
                <GlassInput
                    id="charges.fixed"
                    label="Carga Fixa"
                    placeholder="Ex: 3 ou 1d6"
                    icon={<Battery />}
                    error={shouldShowChargeErrors ? chargeErrors?.value?.message : undefined}
                    disabled={disabled}
                    {...register("charges.value" as never)}
                />
            )}

            {chargeMode === "proficiency" && (
                <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                    <p className="text-sm font-medium text-white/75">As cargas desta entidade escalam com a proficiência.</p>
                </div>
            )}

            {chargeMode === "attribute" && (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                            <Battery className="h-4 w-4" />
                            Atributo
                        </label>
                        <GlassSelector
                            value={watchedCharges?.mode === "attribute" ? watchedCharges.attribute : "Sabedoria"}
                            onChange={(value) => {
                                const nextAttribute = value as AttributeType
                                attributeChargesRef.current = nextAttribute
                                setValue("charges" as Path<TFieldValues>, { mode: "attribute", attribute: nextAttribute } as never, {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                    shouldValidate: false,
                                })
                            }}
                            options={ATTRIBUTE_OPTIONS}
                            layout="grid"
                            cols={3}
                            size="md"
                            fullWidth
                            disabled={disabled}
                            layoutId={`${title.toLowerCase().replace(/\s+/g, "-")}-charge-attribute`}
                        />
                        {shouldShowChargeErrors && chargeErrors?.attribute?.message && (
                            <p className="text-xs text-rose-400 animate-slide-down flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                {chargeErrors.attribute.message}
                            </p>
                        )}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                        <p className="text-sm font-medium text-white/75">As cargas desta entidade escalam com o modificador do atributo selecionado.</p>
                    </div>
                </div>
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
                            disabled={disabled || fields.length >= LEVEL_OPTIONS.length}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Linha
                        </button>
                    </div>

                    <div className="space-y-2">
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid grid-cols-[120px_minmax(0,1fr)_auto] gap-2 rounded-xl border border-white/10 bg-black/10 p-3">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Nível</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        value={String(watchedCharges?.mode === "byLevel" ? watchedCharges.values[index]?.level ?? "" : "")}
                                        onChange={(event) => sanitizeLevelInput(index, event.target.value)}
                                        disabled={disabled}
                                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/25"
                                        placeholder="Ex: 5"
                                    />
                                    {shouldShowChargeFieldError(`charges.values.${index}.level`) && chargeErrors?.values?.[index]?.level?.message && (
                                        <p className="text-xs text-rose-400">{chargeErrors.values[index]?.level?.message}</p>
                                    )}
                                </div>

                                <GlassInput
                                    id={`charges.values.${index}.value`}
                                    label="Cargas"
                                    placeholder="Ex: 2 ou 1d6"
                                    icon={<Battery />}
                                    error={shouldShowChargeFieldError(`charges.values.${index}.value`) ? chargeErrors?.values?.[index]?.value?.message : undefined}
                                    disabled={disabled}
                                    {...register(`charges.values.${index}.value` as never)}
                                />

                                <div className="flex items-center self-center">
                                    <button
                                        type="button"
                                        onClick={() => remove(index)}
                                        disabled={disabled}
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
    )
}
