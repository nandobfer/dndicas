"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/opex/alert-dialog"
import { tabMotionProps } from "@/components/motion/tab-motion"

export interface IntegrationTabDef<T extends string> {
    id: T
    label: string
    icon: LucideIcon
    /** Contador discreto ao lado do rótulo (ex.: vínculos, pessoas sem correspondência). */
    badge?: number | null
}

const TAB_CLASS_NAME = [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-1.5",
    "text-sm font-medium text-muted-foreground transition-all",
    "hover:bg-background/60 hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-sm",
    "aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground",
].join(" ")

interface IntegrationTabsProps<T extends string> {
    tabs: readonly IntegrationTabDef<T>[]
    active: T
    onSelect: (tab: T) => void
    /** Aba pedida enquanto há alterações não salvas (abre a confirmação). */
    pendingTab: T | null
    onConfirmDiscard: () => void
    onCancelDiscard: () => void
    label: string
    children: ReactNode
}

/** Abas da página de uma integração, com troca animada e confirmação de descarte. */
export function IntegrationTabs<T extends string>({ tabs, active, onSelect, pendingTab, onConfirmDiscard, onCancelDiscard, label, children }: IntegrationTabsProps<T>) {
    return (
        <div className="flex flex-col gap-6">
            <div role="tablist" aria-label={label} className="flex w-full flex-wrap justify-start gap-1 rounded-xl bg-muted p-1">
                {tabs.map(({ id, label: tabLabel, icon: Icon, badge }) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        id={`integration-tab-${id}`}
                        aria-selected={active === id}
                        aria-controls={`integration-panel-${id}`}
                        className={TAB_CLASS_NAME}
                        onClick={() => onSelect(id)}
                    >
                        <Icon className="h-4 w-4" aria-hidden />
                        {tabLabel}
                        {badge ? <span className="rounded-full bg-background/30 px-1.5 font-mono text-[10px] tabular-nums">{badge}</span> : null}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={active} {...tabMotionProps} role="tabpanel" id={`integration-panel-${active}`} aria-labelledby={`integration-tab-${active}`} className="flex min-w-0 flex-col gap-6">
                    {children}
                </motion.div>
            </AnimatePresence>

            <AlertDialog open={pendingTab !== null} onOpenChange={(open) => !open && onCancelDiscard()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
                        <AlertDialogDescription>Esta aba tem alterações não salvas. Ao trocar de aba, elas serão descartadas.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={onConfirmDiscard}>Descartar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
