"use client"

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/incompatible-library */

import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { BookOpen, Eye, HeartPulse, Languages, Link, Loader2, Plus, Shield, Skull, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { GlassConfirmClosing } from "@/components/ui/glass-confirm-closing"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import { OptionAutocomplete } from "@/components/ui/option-autocomplete"
import { GlassStatusSwitch } from "@/components/ui/glass-status-switch"
import { ImageAndDescriptionSection } from "@/features/classes/components/shared-form-components"
import { cn } from "@/core/utils"
import { createMonsterSchema, type CreateMonsterSchema } from "../api/validation"
import { useCreateMonster, useUpdateMonster } from "../api/monsters-queries"
import type { Monster, MonsterChallengeRating, MonsterSize, MonsterType, UpdateMonsterInput } from "../types/monsters.types"
import { getMonsterProficiencyBonus, getMonsterXp } from "../utils/monster-calculations"
import { ALIGNMENT_OPTIONS, ATTRIBUTE_KEYS, CONDITION_OPTIONS, MONSTER_SIZE_OPTIONS, MONSTER_TYPE_OPTIONS, SPEED_FIELDS } from "./monster-options"
import { NpcParamFormList } from "./npc-param-form-list"
import { MonsterAttributeBlock } from "./monster-attribute-block"
import { MonsterDefenseSelector, type DamageDefenseState } from "./monster-defense-selector"
import { SKILL_ATTRIBUTE_MAP } from "@/features/character-sheets/utils/dnd-calculations"
import type { DamageTypeKey } from "@/lib/config/damage-types-hex"

const DEFAULT_ATTRIBUTES = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
}

const numericMask = (value: string, allowNegative = false) => {
    const sanitized = value.replace(/[^\d-]/g, "")
    if (!allowNegative) return sanitized.replace(/-/g, "")
    return sanitized.replace(/(?!^)-/g, "")
}
const challengeRatingMask = (value: string) => value.replace(/[^\d/-]/g, "")

function FormSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                {icon}
                {title}
            </label>
            {children}
        </div>
    )
}

function MaskedNumberField({
    label,
    value,
    onChange,
    min,
    max,
    allowEmpty = false,
    placeholder,
    disabled = false,
    mode = "number",
    mask,
}: {
    label: string
    value?: number | string
    onChange: (value: number | string | undefined) => void
    min?: number
    max?: number
    allowEmpty?: boolean
    placeholder?: string
    disabled?: boolean
    mode?: "number" | "text"
    mask?: (value: string) => string
}) {
    const allowNegative = typeof min === "number" && min < 0
    const clamp = (next: number) => {
        let clamped = next
        if (typeof min === "number") clamped = Math.max(min, clamped)
        if (typeof max === "number") clamped = Math.min(max, clamped)
        return clamped
    }
    const parseValue = (next: string) => {
        if (mode === "text") return mask ? mask(next) : next
        const masked = numericMask(next, allowNegative)
        if (!masked || masked === "-") return undefined
        const parsed = Number(masked)
        return Number.isFinite(parsed) ? clamp(parsed) : undefined
    }
    const currentValue = value ?? ""
    const adjustValue = (amount: number) => {
        if (mode === "text") {
            const stringValue = String(value ?? "")
            if (!/^-?\d+$/.test(stringValue)) return
            onChange(String(Number(stringValue) + amount))
            return
        }
        onChange(clamp((typeof value === "number" ? value : 0) + amount))
    }

    return (
        <div className="flex flex-col group w-full relative">
            <div className="flex items-center w-full min-h-[38px]">
                <button type="button" disabled={disabled} onClick={() => adjustValue(-1)} className={cn("p-1 rounded-full transition-colors text-white/40 flex-shrink-0", !disabled && "hover:bg-white/10 hover:text-white", disabled && "opacity-50 cursor-not-allowed")}>-</button>
                <input
                    aria-label={label}
                    type="text"
                    inputMode="numeric"
                    value={currentValue}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(event) => {
                        const parsed = parseValue(event.target.value)
                        onChange(parsed === undefined && !allowEmpty ? min ?? 0 : parsed)
                    }}
                    className="w-full bg-transparent px-2 py-1 outline-none placeholder:text-white/20 tracking-tight transition-all text-white text-lg font-bold text-center [appearance:textfield]"
                />
                <button type="button" disabled={disabled} onClick={() => adjustValue(1)} className={cn("p-1 rounded-full transition-colors text-white/40 flex-shrink-0", !disabled && "hover:bg-white/10 hover:text-white", disabled && "opacity-50 cursor-not-allowed")}>+</button>
            </div>
            <div className={cn("w-full bg-white/10 transition-colors h-0.5", !disabled && "group-focus-within:bg-white/40")} />
            <label className="font-black uppercase tracking-widest text-white/40 mt-1 ml-1 select-none text-[10px]">{label}</label>
        </div>
    )
}

function SpeedFields({ watch, setValue, unregister, disabled }: { watch: any; setValue: any; unregister: any; disabled?: boolean }) {
    const removeSpeed = (name: (typeof SPEED_FIELDS)[number]["name"]) => {
        setValue(name, null as any, { shouldDirty: true, shouldValidate: true })
        unregister(name, { keepDirty: true, keepTouched: false, keepValue: false })
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {SPEED_FIELDS.map((speedField) => {
                const Icon = speedField.icon
                const value = watch(speedField.name)
                const isDefined = value !== undefined && value !== null
                return (
                    <div key={speedField.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-white/55 flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5" />
                                {speedField.label}
                            </span>
                            {isDefined && (
                                <button type="button" aria-label={`Remover ${speedField.label}`} onClick={() => removeSpeed(speedField.name)} disabled={disabled} className="p-1 rounded-md text-white/35 hover:text-rose-400 hover:bg-rose-400/10 transition-colors">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        {isDefined ? (
                            <GlassInput aria-label={speedField.label} value={value} onChange={(event) => setValue(speedField.name, event.target.value, { shouldDirty: true })} placeholder="9m" disabled={disabled} />
                        ) : (
                            <button
                                type="button"
                                aria-label={`Adicionar ${speedField.label}`}
                                onClick={() => setValue(speedField.name, speedField.name === "speed" ? "9m" : "", { shouldDirty: true, shouldValidate: true })}
                                disabled={disabled}
                                className="w-full h-10 rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-xs font-semibold text-white/45 hover:text-white hover:border-white/30 hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Adicionar
                            </button>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export function MonsterFormModal({ monster, isOpen, onClose, onSuccess }: { monster: Monster | null; isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
    const isEditMode = !!monster
    const createMutation = useCreateMonster()
    const updateMutation = useUpdateMonster()
    const isSubmitting = createMutation.isPending || updateMutation.isPending
    const [showConfirmClose, setShowConfirmClose] = React.useState(false)

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        unregister,
        control,
        reset,
        formState: { errors, isDirty },
    } = useForm<CreateMonsterSchema>({
        resolver: zodResolver(createMonsterSchema) as any,
        defaultValues: {
            name: "",
            originalName: "",
            source: "LDM pág. ",
            description: "",
            image: "",
            status: "active",
            type: "beast",
            size: "M",
            alignment: "unaligned",
            armorClass: 10,
            initiative: undefined,
            hitPointsFormula: "1d8",
            speed: "9m",
            flySpeed: undefined,
            swimSpeed: undefined,
            climbSpeed: undefined,
            attributes: DEFAULT_ATTRIBUTES,
            savingThrows: {},
            skills: {},
            senses: {},
            sensesAndLanguages: [],
            challengeRating: "",
            languages: "—",
            damageVulnerabilities: [],
            damageResistances: [],
            damageImmunities: [],
            conditionImmunities: [],
            conditionImmunityNotes: "",
            traits: [],
            actions: [],
            bonusActions: [],
            reactions: [],
            legendaryActions: [],
            legendaryActionUses: 3,
            lairActions: [],
            lairActionInitiative: 20,
            regionalEffects: [],
        },
    })

    React.useEffect(() => {
        if (!isOpen) return
        setShowConfirmClose(false)
        reset({
            name: monster?.name ?? "",
            originalName: monster?.originalName ?? "",
            source: monster?.source ?? "LDM pág. ",
            description: monster?.description ?? "",
            image: monster?.image ?? "",
            status: monster?.status ?? "active",
            type: monster?.type ?? "beast",
            size: monster?.size ?? "M",
            alignment: monster?.alignment ?? "unaligned",
            armorClass: monster?.armorClass ?? 10,
            initiative: monster?.initiative ?? undefined,
            hitPointsFormula: monster?.hitPointsFormula ?? "1d8",
            speed: monster?.speed ?? "9m",
            flySpeed: monster?.flySpeed,
            swimSpeed: monster?.swimSpeed,
            climbSpeed: monster?.climbSpeed,
            attributes: monster?.attributes ?? DEFAULT_ATTRIBUTES,
            savingThrows: monster?.savingThrows ?? {},
            skills: monster?.skills ?? {},
            senses: monster?.senses ?? {},
            sensesAndLanguages: monster?.sensesAndLanguages ?? [],
            challengeRating: monster?.challengeRating ?? "",
            experienceOverride: monster?.experienceOverride,
            proficiencyBonusOverride: monster?.proficiencyBonusOverride,
            languages: monster?.languages ?? "—",
            damageVulnerabilities: monster?.damageVulnerabilities ?? [],
            damageResistances: monster?.damageResistances ?? [],
            damageImmunities: monster?.damageImmunities ?? [],
            conditionImmunities: monster?.conditionImmunities ?? [],
            conditionImmunityNotes: monster?.conditionImmunityNotes ?? "",
            traits: monster?.traits ?? [],
            actions: monster?.actions ?? [],
            bonusActions: monster?.bonusActions ?? [],
            reactions: monster?.reactions ?? [],
            legendaryActions: monster?.legendaryActions ?? [],
            legendaryActionUses: monster?.legendaryActionUses ?? 3,
            lairActions: monster?.lairActions ?? [],
            lairActionInitiative: monster?.lairActionInitiative ?? 20,
            regionalEffects: monster?.regionalEffects ?? [],
        })
    }, [isOpen, monster, reset])

    const cr = watch("challengeRating") as MonsterChallengeRating
    const xp = getMonsterXp(cr, watch("experienceOverride"))
    const prof = getMonsterProficiencyBonus(cr, watch("proficiencyBonusOverride"))
    const attributes = watch("attributes") ?? DEFAULT_ATTRIBUTES
    const defenseState: Partial<Record<DamageTypeKey, DamageDefenseState>> = {}
    ;(watch("damageVulnerabilities") ?? []).forEach((item: DamageTypeKey) => { defenseState[item] = "V" })
    ;(watch("damageResistances") ?? []).forEach((item: DamageTypeKey) => { defenseState[item] = "R" })
    ;(watch("damageImmunities") ?? []).forEach((item: DamageTypeKey) => { defenseState[item] = "I" })

    const setDefenseState = (state: Partial<Record<DamageTypeKey, DamageDefenseState>>) => {
        setValue("damageVulnerabilities", Object.entries(state).filter(([, value]) => value === "V").map(([key]) => key as DamageTypeKey), { shouldDirty: true })
        setValue("damageResistances", Object.entries(state).filter(([, value]) => value === "R").map(([key]) => key as DamageTypeKey), { shouldDirty: true })
        setValue("damageImmunities", Object.entries(state).filter(([, value]) => value === "I").map(([key]) => key as DamageTypeKey), { shouldDirty: true })
    }

    const handleCloseAttempt = () => {
        if (isDirty) setShowConfirmClose(true)
        else onClose()
    }

    const onSubmit = async (data: CreateMonsterSchema) => {
        const challengeRating = data.challengeRating.trim() || "0"
        const currentSpeed = watch("speed")
        const currentFlySpeed = watch("flySpeed")
        const currentSwimSpeed = watch("swimSpeed")
        const currentClimbSpeed = watch("climbSpeed")
        const cleaned = {
            ...data,
            challengeRating,
            originalName: data.originalName?.trim() || undefined,
            speed: currentSpeed === null || currentSpeed === undefined ? null : currentSpeed.trim() || null,
            flySpeed: currentFlySpeed === null || currentFlySpeed === undefined ? null : currentFlySpeed.trim() || null,
            swimSpeed: currentSwimSpeed === null || currentSwimSpeed === undefined ? null : currentSwimSpeed.trim() || null,
            climbSpeed: currentClimbSpeed === null || currentClimbSpeed === undefined ? null : currentClimbSpeed.trim() || null,
            experience: getMonsterXp(challengeRating, data.experienceOverride),
        }

        try {
            if (isEditMode && monster) await updateMutation.mutateAsync({ id: monster._id, data: cleaned as UpdateMonsterInput })
            else await createMutation.mutateAsync(cleaned as any)
            toast.success(isEditMode ? "Monstro atualizado com sucesso!" : "Monstro criado com sucesso!")
            onSuccess()
            onClose()
        } catch (error) {
            console.error("[MonsterFormModal] Error:", error)
            toast.error(error instanceof Error ? error.message : "Erro ao salvar monstro")
        }
    }

    return (
        <>
            <GlassModal open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
                <GlassModalContent size="xl" className="max-w-full md:max-w-[78vw]">
                    <GlassModalHeader>
                        <GlassModalTitle>{isEditMode ? `Editar ${monster?.name}` : "Novo Monstro"}</GlassModalTitle>
                        <GlassModalDescription>{isEditMode ? "Atualize as informações do monstro" : "Crie uma nova criatura no catálogo"}</GlassModalDescription>
                    </GlassModalHeader>

                    <form id="monster-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-6 mt-4">
                        <GlassStatusSwitch entityLabel="Status do Monstro" description="Monstros inativos não aparecem nas buscas públicas" checked={watch("status") === "active"} onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")} disabled={isSubmitting} />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <GlassInput id="name" label="Nome do Monstro" placeholder="Ex: Dragão Vermelho Adulto" icon={<Skull />} required error={errors.name?.message} {...register("name")} disabled={isSubmitting} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <GlassInput id="source" label="Fonte" placeholder="Ex: LDM pág. 98" icon={<Link />} error={errors.source?.message} {...register("source")} disabled={isSubmitting} />
                                <GlassInput id="originalName" label="Nome Original" placeholder="Ex: Adult Red Dragon" icon={<Languages />} error={errors.originalName?.message} {...register("originalName")} disabled={isSubmitting} />
                            </div>
                        </div>

                        <ImageAndDescriptionSection control={control} isSubmitting={isSubmitting} errors={errors} imageFieldName="image" descriptionFieldName="description" entityId={monster?._id} placeholder="Descreva o monstro detalhadamente..." />

                        <FormSection title="Classificação" icon={<Sparkles className="h-4 w-4" />}>
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="space-y-2 flex-1 min-w-0">
                                    <span className="text-xs text-white/50">Tipo</span>
                                    <OptionAutocomplete value={watch("type") as MonsterType} onChange={(value) => setValue("type", value as MonsterType, { shouldDirty: true })} options={MONSTER_TYPE_OPTIONS} placeholder="Selecione o tipo" title="Tipo de monstro" mode="single" className="w-full min-w-0" />
                                </div>
                                <div className="space-y-2 flex-1 min-w-0">
                                    <span className="text-xs text-white/50">Tamanho</span>
                                    <OptionAutocomplete value={watch("size") as MonsterSize} onChange={(value) => setValue("size", value as MonsterSize, { shouldDirty: true })} options={MONSTER_SIZE_OPTIONS} placeholder="Selecione o tamanho" title="Tamanho" mode="single" accentClass="amber" className="w-full min-w-0" />
                                </div>
                                <div className="space-y-2 flex-1 min-w-0">
                                    <span className="text-xs text-white/50">Alinhamento</span>
                                    <OptionAutocomplete value={watch("alignment")} onChange={(value) => setValue("alignment", value as CreateMonsterSchema["alignment"], { shouldDirty: true })} options={ALIGNMENT_OPTIONS} placeholder="Selecione o alinhamento" title="Alinhamento" mode="single" accentClass="purple" className="w-full min-w-0" />
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Combate" icon={<Shield className="h-4 w-4" />}>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <Controller name="armorClass" control={control} render={({ field }) => <MaskedNumberField label="CA" value={field.value} onChange={(value) => field.onChange(value)} min={0} max={50} disabled={isSubmitting} />} />
                                <Controller name="initiative" control={control} render={({ field }) => <MaskedNumberField label="Iniciativa" value={field.value} onChange={(value) => field.onChange(value)} min={-20} max={50} allowEmpty disabled={isSubmitting} />} />
                                <GlassInput label="PV" placeholder="12d8 + 12" icon={<HeartPulse />} {...register("hitPointsFormula")} error={errors.hitPointsFormula?.message} disabled={isSubmitting} />
                                <Controller name="proficiencyBonusOverride" control={control} render={({ field }) => <MaskedNumberField label="Proficiência" value={field.value} onChange={(value) => field.onChange(value)} min={0} max={20} allowEmpty placeholder={`Derivado: +${prof}`} disabled={isSubmitting} />} />
                            </div>
                            <SpeedFields watch={watch} setValue={setValue} unregister={unregister} disabled={isSubmitting} />
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px] gap-4 items-end">
                                <Controller name="challengeRating" control={control} render={({ field }) => <MaskedNumberField label="Challenge Rating" value={field.value} onChange={(value) => field.onChange(value)} mode="text" mask={challengeRatingMask} placeholder="1/4" disabled={isSubmitting} />} />
                                <Controller name="experienceOverride" control={control} render={({ field }) => <MaskedNumberField label="XP Override" value={field.value} onChange={(value) => field.onChange(value)} min={0} allowEmpty placeholder={String(xp)} disabled={isSubmitting} />} />
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-widest text-white/35">Derivado</div>
                                    <div className="text-sm font-bold text-white">{xp.toLocaleString("pt-BR")} XP / +{prof} prof.</div>
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Atributos, Salvaguardas e Perícias" icon={<BookOpen className="h-4 w-4" />}>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                {ATTRIBUTE_KEYS.map((attribute) => (
                                    <MonsterAttributeBlock
                                        key={attribute}
                                        attributeKey={attribute}
                                        attributes={attributes}
                                        value={attributes[attribute] ?? 10}
                                        savingThrow={watch(`savingThrows.${attribute}` as `savingThrows.${typeof attribute}`)}
                                        skills={(Object.keys(SKILL_ATTRIBUTE_MAP) as Array<keyof typeof SKILL_ATTRIBUTE_MAP>).filter((skill) => SKILL_ATTRIBUTE_MAP[skill] === attribute).sort().map((skill) => ({ name: skill, state: watch(`skills.${skill}` as `skills.${typeof skill}`) }))}
                                        proficiencyBonus={prof}
                                        onValueChange={(value) => setValue(`attributes.${attribute}` as `attributes.${typeof attribute}`, value, { shouldDirty: true })}
                                        onSavingThrowChange={(value) => setValue(`savingThrows.${attribute}` as `savingThrows.${typeof attribute}`, value, { shouldDirty: true })}
                                        onSkillChange={(skill, value) => setValue(`skills.${skill}` as `skills.${typeof skill}`, value as any, { shouldDirty: true })}
                                        isReadOnly={isSubmitting}
                                    />
                                ))}
                            </div>
                        </FormSection>

                        <FormSection title="Sentidos, Idiomas e Defesas" icon={<Eye className="h-4 w-4" />}>
                            <NpcParamFormList title="Sentidos e Idiomas" name="sensesAndLanguages" control={control} register={register} disabled={isSubmitting} color="cyan" />
                            <MonsterDefenseSelector value={defenseState} onChange={setDefenseState} />
                            <div className="space-y-2">
                                <span className="text-xs text-white/50">Imunidade a condições</span>
                                <OptionAutocomplete value={watch("conditionImmunities") ?? []} onChange={(value) => setValue("conditionImmunities", (Array.isArray(value) ? value : value ? [value] : []) as CreateMonsterSchema["conditionImmunities"], { shouldDirty: true })} options={CONDITION_OPTIONS} placeholder="Nenhuma condição" title="Imunidade a condições" accentClass="emerald" />
                            </div>
                        </FormSection>

                        <NpcParamFormList title="Traços" name="traits" control={control} register={register} disabled={isSubmitting} color="emerald" />
                        <NpcParamFormList title="Ações" name="actions" control={control} register={register} disabled={isSubmitting} attack color="red" />
                        <NpcParamFormList title="Ações Bônus" name="bonusActions" control={control} register={register} disabled={isSubmitting} attack color="amber" />
                        <NpcParamFormList title="Reações" name="reactions" control={control} register={register} disabled={isSubmitting} attack color="purple" />
                        <NpcParamFormList title="Ações Lendárias" name="legendaryActions" control={control} register={register} disabled={isSubmitting} attack customValue="legendaryActionUses" customValueLabel="Usos lendários" setValue={setValue} watch={watch} color="pink" />
                        <NpcParamFormList title="Ações de Covil" name="lairActions" control={control} register={register} disabled={isSubmitting} attack customValue="lairActionInitiative" customValueLabel="Iniciativa do covil" setValue={setValue} watch={watch} color="slate" />
                        <NpcParamFormList title="Efeitos Regionais" name="regionalEffects" control={control} register={register} disabled={isSubmitting} color="blue" />

                        {Object.keys(errors).length > 0 && <p className="text-xs text-rose-400">Existem campos inválidos no formulário. Revise os dados antes de salvar.</p>}

                        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-white/10">
                            <button type="button" onClick={handleCloseAttempt} className="px-6 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors disabled:opacity-50" disabled={isSubmitting}>Cancelar</button>
                            <button type="submit" className={cn("flex flex-1 sm:flex-none items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all shadow-lg active:scale-95", "bg-blue-500 text-white shadow-blue-500/20 hover:bg-blue-600", isSubmitting && "opacity-50 cursor-not-allowed")} disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                {isEditMode ? "Salvar Alterações" : "Criar Monstro"}
                            </button>
                        </div>
                    </form>
                </GlassModalContent>
            </GlassModal>

            <GlassConfirmClosing isOpen={showConfirmClose} onClose={() => setShowConfirmClose(false)} onConfirmExit={() => { setShowConfirmClose(false); onClose() }} onSaveAndExit={handleSubmit(onSubmit as any)} isSaving={isSubmitting} />
        </>
    )
}
