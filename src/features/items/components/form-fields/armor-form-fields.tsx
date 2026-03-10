"use client"

import * as React from "react"
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form"
import { Shield, ShieldCheck, ShieldAlert, Zap, Target } from "lucide-react"
import { motion } from "framer-motion"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { CreateItemSchema } from "../../api/validation"
import { ArmorType, ItemType } from "../../types/items.types"
import { armorTypeConfig, acTypeConfig, rarityToTailwind } from "@/lib/config/colors"

const ARMOR_TYPE_OPTIONS = [
    { 
        value: "nenhuma", 
        label: armorTypeConfig.nenhuma.label, 
        icon: Shield,
        activeColor: rarityToTailwind[armorTypeConfig.nenhuma.color].bg,
        textColor: rarityToTailwind[armorTypeConfig.nenhuma.color].text
    },
    { 
        value: "leve", 
        label: armorTypeConfig.leve.label, 
        icon: ShieldCheck,
        activeColor: rarityToTailwind[armorTypeConfig.leve.color].bg,
        textColor: rarityToTailwind[armorTypeConfig.leve.color].text
    },
    { 
        value: "média", 
        label: armorTypeConfig.média.label, 
        icon: ShieldAlert,
        activeColor: rarityToTailwind[armorTypeConfig.média.color].bg,
        textColor: rarityToTailwind[armorTypeConfig.média.color].text
    },
    { 
        value: "pesada", 
        label: armorTypeConfig.pesada.label, 
        icon: ShieldAlert,
        activeColor: rarityToTailwind[armorTypeConfig.pesada.color].bg,
        textColor: rarityToTailwind[armorTypeConfig.pesada.color].text
    },
]

const AC_TYPE_OPTIONS = [
    { 
        value: "base", 
        label: acTypeConfig.base.label, 
        icon: Target,
        activeColor: rarityToTailwind[acTypeConfig.base.color].bg,
        textColor: rarityToTailwind[acTypeConfig.base.color].text
    },
    { 
        value: "bonus", 
        label: acTypeConfig.bonus.label, 
        icon: Zap,
        activeColor: rarityToTailwind[acTypeConfig.bonus.color].bg,
        textColor: rarityToTailwind[acTypeConfig.bonus.color].text
    },
]

interface ArmorFormFieldsProps {
    selectedType: ItemType
    setValue: UseFormSetValue<CreateItemSchema>
    watch: UseFormWatch<CreateItemSchema>
    errors: FieldErrors<CreateItemSchema>
}

export function ArmorFormFields({ selectedType, setValue, watch, errors }: ArmorFormFieldsProps) {
    return (
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

            <div className="flex flex-col gap-6">
                {selectedType === "armadura" ? (
                    <>
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <Shield className="h-4 w-4 text-blue-400/60" />
                                Tipo de Armadura
                            </label>
                            <GlassSelector
                                options={ARMOR_TYPE_OPTIONS}
                                value={watch("armorType") || "nenhuma"}
                                onChange={(val) => setValue("armorType", val as ArmorType)}
                                layoutId="armor-type-selector"
                                layout="horizontal"
                                fullWidth
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <Target className="h-4 w-4 text-blue-400/60" />
                                Tipo de CA
                            </label>
                            <GlassSelector
                                options={AC_TYPE_OPTIONS}
                                value={watch("acType") || "base"}
                                onChange={(val) => setValue("acType", val as any)}
                                layoutId="ac-type-selector"
                                layout="horizontal"
                                fullWidth
                            />
                        </div>

                        <GlassInput
                            label="Classe de Armadura (CA)"
                            placeholder="Ex: 15"
                            value={watch("ac") || ""}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "")
                                setValue("ac", val === "" ? undefined : parseInt(val))
                            }}
                            error={errors.ac?.message}
                        />
                    </>
                ) : (
                    <GlassInput
                        label="Bônus de CA"
                        placeholder="Ex: 2"
                        value={watch("acBonus") || ""}
                        onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "")
                            setValue("acBonus", val === "" ? undefined : parseInt(val))
                        }}
                        error={errors.acBonus?.message}
                    />
                )}
            </div>
        </motion.div>
    )
}
