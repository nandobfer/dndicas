"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Info, Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { GlassCard as Card, GlassCardContent as CardContent } from "@/components/ui/glass-card"
import { ToggleCard } from "@/components/ui/opex/toggle-card"
import type { AiFeatureAvailability } from "../types"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

interface FeatureFormShellProps {
    id: string
    label: string
    description: string
    enabled: boolean
    onEnabledChange: (enabled: boolean) => void
    availability: AiFeatureAvailability
    dirty: boolean
    isDefault: boolean
    pending: boolean
    readOnly: boolean
    onUndo: () => void
    onSave: () => void
    children: ReactNode
}

/** Moldura de um uso de IA: liga/desliga com a disponibilidade, os cards do uso e o rodapé. Copiada do Ciliar. */
export function FeatureFormShell({ id, label, description, enabled, onEnabledChange, availability, dirty, isDefault, pending, readOnly, onUndo, onSave, children }: FeatureFormShellProps) {
    return (
        <>
            <Card>
                <CardContent className="space-y-3 p-6">
                    <ToggleCard id={id} label={label} description={description} checked={enabled} onCheckedChange={onEnabledChange} disabled={readOnly} onLabel="Ligado" offLabel="Desligado" />
                    <AnimatePresence initial={false}>
                        {!dirty && !availability.available && availability.reason && (
                            <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
            {children}
            {!readOnly && (
                <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                    <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || pending} onClick={onUndo}>
                        <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={(!dirty && !isDefault) || pending} onClick={onSave}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                        Salvar
                    </Button>
                </div>
            )}
        </>
    )
}
