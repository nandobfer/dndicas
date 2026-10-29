"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/opex/alert-dialog"
import { Button } from "@/components/ui/opex/button"
import { listContainer, listItem } from "@/components/motion/presets"

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: ReactNode
    /** O que será afetado, listado abaixo da descrição. */
    items?: ReadonlyArray<string>
    confirmLabel: string
    cancelLabel?: string
    /** `destructive` para ações que cancelam, excluem ou descartam. */
    variant?: "default" | "destructive"
    pending?: boolean
    onConfirm: () => void
    children?: ReactNode
}

/**
 * Confirmação explícita de ação crítica, composta sobre o `AlertDialog` (copiada do
 * crm-marketing-campanhas): título, descrição, itens afetados, botão principal com carregamento e
 * "Voltar". Enquanto `pending`, nada fecha o diálogo.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, items, confirmLabel, cancelLabel = "Voltar", variant = "default", pending = false, onConfirm, children }: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
                </AlertDialogHeader>
                <AnimatePresence initial={false}>
                    {items && items.length > 0 && (
                        <motion.ul variants={listContainer} initial="hidden" animate="visible" className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm">
                            {items.map((item) => (
                                <motion.li key={item} variants={listItem} className="text-foreground">
                                    {item}
                                </motion.li>
                            ))}
                        </motion.ul>
                    )}
                </AnimatePresence>
                {children}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
                    <Button variant={variant === "destructive" ? "destructive" : "default"} onClick={onConfirm} disabled={pending}>
                        {pending && <Loader2 className="animate-spin" aria-hidden />} {confirmLabel}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
