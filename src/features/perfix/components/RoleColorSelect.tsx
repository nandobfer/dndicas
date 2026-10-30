"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLOR_PALETTE, COLOR_TOKENS, type ColorToken } from "@/lib/constants/color-palette"

interface RoleColorSelectProps {
    value: string
    onChange: (cor: ColorToken) => void
    disabled?: boolean
}

/**
 * Grade das cores da paleta (copiado do crm-marketing-campanhas/Smart Desk). Guarda o TOKEN
 * (`"roxo"`), nunca o hex — é o que faz chip, aba e dark mode resolverem pelo mesmo mapa.
 */
export function RoleColorSelect({ value, onChange, disabled = false }: RoleColorSelectProps) {
    return (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do perfil">
            {COLOR_TOKENS.map((token) => {
                const color = COLOR_PALETTE[token]
                const selected = value === token

                return (
                    <button
                        key={token}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={color.label}
                        title={color.label}
                        disabled={disabled}
                        onClick={() => onChange(token)}
                        className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full ring-offset-background transition-transform",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                            selected ? "ring-2 ring-primary ring-offset-2" : "hover:scale-110",
                            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                        )}
                        style={{ backgroundColor: color.hex }}
                    >
                        {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
                    </button>
                )
            })}
        </div>
    )
}
