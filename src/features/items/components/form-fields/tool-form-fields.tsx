"use client"

import * as React from "react"
import { UseFormRegister } from "react-hook-form"
import { Hammer } from "lucide-react"
import { GlassInput } from "@/components/ui/glass-input"
import { CreateItemSchema } from "../../api/validation"

interface ToolFormFieldsProps {
    register: UseFormRegister<CreateItemSchema>
}

export function ToolFormFields({ register }: ToolFormFieldsProps) {
    return (
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-4">
            <div className="flex items-center gap-2">
                <Hammer className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-medium text-white/60">Atributos de Ferramenta</h3>
            </div>
            <GlassInput label="Atributo Associado" placeholder="Ex: Destreza, Inteligência..." {...register("attributeUsed" as any)} />
        </div>
    )
}
