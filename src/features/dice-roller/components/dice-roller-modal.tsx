"use client"

import {
    GlassModal,
    GlassModalContent,
    GlassModalDescription,
    GlassModalHeader,
    GlassModalTitle,
} from "@/components/ui/glass-modal"
import type { DiceRollPreset } from "../types"
import { DiceRollerPanel } from "./dice-roller-panel"

interface DiceRollerModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    preset?: DiceRollPreset | null
}

export function DiceRollerModal({ open, onOpenChange, preset }: DiceRollerModalProps) {
    return (
        <GlassModal open={open} onOpenChange={onOpenChange}>
            <GlassModalContent size="full" className="max-w-3xl bg-black/55 p-0" bodyClassName="p-0">
                <GlassModalHeader className="sr-only">
                    <GlassModalTitle>Rolagem de dados</GlassModalTitle>
                    <GlassModalDescription>Monte e role dados com resultado gerado pelo servidor.</GlassModalDescription>
                </GlassModalHeader>
                <DiceRollerPanel preset={preset} />
            </GlassModalContent>
        </GlassModal>
    )
}
