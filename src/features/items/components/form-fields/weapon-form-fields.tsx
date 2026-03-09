"use client"

import { UseFormRegister, UseFormSetValue, UseFormWatch, Control, FieldErrors, Controller } from "react-hook-form"
import { Sword, Dices, Zap, Target, ScrollText } from "lucide-react"
import { motion } from "framer-motion"
import { GlassSelector } from "@/components/ui/glass-selector"
import { GlassDiceSelector } from "@/components/ui/glass-dice-selector"
import { GlassEntityChooser } from "@/components/ui/glass-entity-chooser"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { damageTypeColors } from "@/lib/config/colors"
import { EntityListChooser } from "../shared/entity-list-chooser"
import { ENTITY_PROVIDERS } from "@/lib/config/entities"
import { CreateItemSchema } from "../../api/validation"
import { DamageType } from "../../types/items.types"

// Map the existing damageTypeColors to GlassSelector options.
// Expand physical damage into its 3 subtypes (cortante, perfurante, concussão)
// and ensure they appear first in the list, followed by magical types.
const DAMAGE_TYPE_OPTIONS = (() => {
    const physical = damageTypeColors.physical;
    
    // 1. Create the 3 physical subtypes first
    const physicalOptions = [
        { value: "cortante", label: "Cortante" },
        { value: "perfurante", label: "Perfurante" },
        { value: "concussão", label: "Concussão" },
    ].map(t => ({
        value: t.value as DamageType,
        label: t.label,
        activeColor: physical.hex,
        textColor: physical.hex,
    }));

    // 2. Map the rest of the magical types, skipping physical and healing
    const magicalOptions = Object.entries(damageTypeColors)
        .filter(([key]) => key !== "physical" && key !== "healing")
        .map(([key, config]) => {
            const label = config.keys[0].charAt(0).toUpperCase() + config.keys[0].slice(1)
            return {
                value: config.keys[0] as DamageType, 
                label,
                activeColor: config.hex,
                textColor: config.hex,
            }
        });

    return [...physicalOptions, ...magicalOptions];
})();

interface WeaponFormFieldsProps {
    register: UseFormRegister<CreateItemSchema>
    setValue: UseFormSetValue<CreateItemSchema>
    watch: UseFormWatch<CreateItemSchema>
    control: Control<CreateItemSchema>
    errors: FieldErrors<CreateItemSchema>
    isSubmitting: boolean
    propertyFields: any[]
    appendProperty: (value: any) => void
    removeProperty: (index: number) => void
}

export function WeaponFormFields({
    register,
    control,
    errors,
    isSubmitting,
    propertyFields,
    appendProperty,
    removeProperty,
}: WeaponFormFieldsProps) {
    const isMobile = useIsMobile()
    
    return (
        <motion.div
            key="weapon-attrs"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-6"
        >
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <Sword className="h-4 w-4 text-rose-400" />
                <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider">Atributos de Arma</h3>
            </div>

            <div className="space-y-6">
                {/* Dano (Dice Selector) */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <Dices className="h-4 w-4 text-blue-400/60" />
                        Dano da Arma
                    </label>
                    <Controller
                        name="damageDice"
                        control={control}
                        render={({ field }) => (
                            <GlassDiceSelector
                                value={field.value as any}
                                onChange={field.onChange}
                                layoutId="weapon-damage-dice"
                                layout="horizontal"
                            />
                        )}
                    />
                </div>

                {/* Tipo de Dano */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-400/60" />
                        Tipo de Dano
                    </label>
                    <Controller
                        name="damageType"
                        control={control}
                        render={({ field }) => (
                            <GlassSelector
                                options={DAMAGE_TYPE_OPTIONS}
                                value={field.value as DamageType}
                                onChange={(val) => field.onChange(val)}
                                layoutId="weapon-damage-type"
                                layout="grid"
                                cols={isMobile ? 1 : 3}
                                fullWidth
                            />
                        )}
                    />
                </div>

                {/* Properties (Rules) - Moved inside the weapon card */}
                <EntityListChooser
                    fields={propertyFields}
                    append={appendProperty}
                    remove={removeProperty}
                    control={control}
                    isSubmitting={isSubmitting}
                    fieldName="properties"
                    errors={errors}
                    entityType="Regra"
                    title="Propriedades da Arma"
                    description="Regras como Pesada, Leve, Alcance..."
                    icon={<ScrollText className="h-4 w-4 text-slate-400" />}
                />

                {/* Maestria */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <Target className="h-4 w-4 text-emerald-400/60" />
                        Maestria
                    </label>
                    <Controller
                        name="mastery"
                        control={control}
                        render={({ field }) => (
                            <div className="space-y-1">
                                <GlassEntityChooser
                                    provider={ENTITY_PROVIDERS.find(p => p.name === "Regra")}
                                    placeholder="Selecionar Maestria (Ex: Cleave, Vex...)"
                                    value={field.value ? { label: field.value.replace(/<[^>]*>/g, ""), id: field.value } : undefined}
                                    onChange={(val) => {
                                        if (val) {
                                            field.onChange(
                                                `<span data-type="mention" data-id="${val.id}" data-entity-type="Regra" class="mention">${val.label}</span>`
                                            )
                                        } else {
                                            field.onChange("")
                                        }
                                    }}
                                    className={errors.mastery ? "border-rose-500/50" : ""}
                                />
                                {errors.mastery?.message && (
                                    <p className="text-[10px] text-rose-500 font-medium ml-1">
                                        {errors.mastery.message as string}
                                    </p>
                                )}
                            </div>
                        )}
                    />
                </div>
            </div>
        </motion.div>
    )
}
