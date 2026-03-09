"use client"

import * as React from "react"
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form"
import { Shield } from "lucide-react"
import { motion } from "framer-motion"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import { CreateItemSchema } from "../../api/validation"
import { ArmorType, ItemType } from "../../types/items.types"

const ARMOR_TYPE_OPTIONS = [
    { value: "nenhuma", label: "Nenhuma" },
    { value: "leve", label: "Leve" },
    { value: "média", label: "Média" },
    { value: "pesada", label: "Pesada" },
]

interface ArmorFormFieldsProps {
    selectedType: ItemType
    setValue: UseFormSetValue<CreateItemSchema>
    watch: UseFormWatch<CreateItemSchema>
    errors: FieldErrors<CreateItemSchema>
}

export function ArmorFormFields({
    selectedType,
    setValue,
    watch,
    errors
}: ArmorFormFieldsProps) {
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
                                options={[
                                    { value: "base", label: "Base" },
                                    { value: "bonus", label: "Bônus" },
                                ]}
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
    )
}
