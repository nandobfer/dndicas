"use client"

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { getColor } from "@/lib/constants/color-palette"

interface RoleChipProps {
    cargo: { nome: string; cor?: string | null }
    /** Quantas permissões o perfil concede. Omitido, o chip mostra só o nome. */
    permissionCount?: number
    className?: string
}

/**
 * Chip colorido de um perfil (copiado do Smart Desk). A cor sai do TOKEN (`cor: "roxo"`) via
 * `getColor`; token desconhecido cai em "cinza".
 */
export function RoleChip({ cargo, permissionCount, className }: RoleChipProps) {
    const color = getColor(cargo.cor ?? undefined)
    const reducedMotion = useReducedMotion()

    return (
        <motion.span
            whileHover={reducedMotion ? undefined : { scale: 1.03 }}
            whileTap={reducedMotion ? undefined : { scale: 0.97 }}
            className={cn(
                // `cursor-[inherit]`: o chip mora dentro de linhas clicáveis e não deve sobrepor o cursor delas.
                "inline-flex w-fit cursor-[inherit] items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/10",
                color.chipClassName,
                className,
            )}
        >
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color.hex }} />
            <span>{cargo.nome}</span>
            {permissionCount !== undefined && (
                <span className="opacity-70 tabular-nums">
                    {permissionCount} {permissionCount === 1 ? "permissão" : "permissões"}
                </span>
            )}
        </motion.span>
    )
}
