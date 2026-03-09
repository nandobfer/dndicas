"use client"

import * as React from "react"
import { UseFormRegister } from "react-hook-form"
import { Hammer } from "lucide-react"
import { GlassInput } from "@/components/ui/glass-input"
import { CreateItemSchema } from "../../api/validation"
import { GlassSelector } from "@/components/ui/glass-selector"
import { attributeColors, AttributeType } from "@/lib/config/colors"
import { UseFormWatch, UseFormSetValue } from "react-hook-form"

const ATTRIBUTE_OPTIONS = (Object.entries(attributeColors) as [AttributeType, (typeof attributeColors)[AttributeType]][]).map(([key, config]) => ({
    value: key,
    label: key, // Full name
    activeColor: config.bgAlpha,
    textColor: config.text,
}))

interface ToolFormFieldsProps {
    watch: UseFormWatch<CreateItemSchema>
    setValue: UseFormSetValue<CreateItemSchema>
}

export function ToolFormFields({ watch, setValue }: ToolFormFieldsProps) {
    return (
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-4">
            <div className="flex items-center gap-2">
                <Hammer className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-medium text-white/60">Atributos de Ferramenta</h3>
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-white/80">Atributo Associado</label>
                <GlassSelector
                    options={ATTRIBUTE_OPTIONS}
                    value={watch("attributeUsed") || ""}
                    onChange={(val) => setValue("attributeUsed", val as any)}
                    layoutId="tool-attr-selector"
                    layout="horizontal"
                    fullWidth
                />
            </div>
        </div>
    )
}
