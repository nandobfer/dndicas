"use client"

import { motion } from "framer-motion"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { SheetHeader } from "./sheet-header"
import { SheetLeftColumn } from "./sheet-left-column"
import { SheetCenterColumn } from "./sheet-center-column"
import { SheetRightColumn } from "./sheet-right-column"
import { useSheetAutoSave } from "../hooks/use-sheet-auto-save"
import type { CharacterSheetFull } from "../types/character-sheet.types"

interface SheetFormProps {
    sheet: CharacterSheetFull
}

export function SheetForm({ sheet }: SheetFormProps) {
    const form = useSheetAutoSave(sheet)

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-4">
            {/* Header */}
            <SheetHeader sheet={sheet} form={form} />

            {/* Three-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <GlassCard>
                    <GlassCardContent className="pt-4 pb-4">
                        <SheetLeftColumn sheet={sheet} form={form} />
                    </GlassCardContent>
                </GlassCard>

                <GlassCard>
                    <GlassCardContent className="pt-4 pb-4">
                        <SheetCenterColumn sheet={sheet} form={form} />
                    </GlassCardContent>
                </GlassCard>

                <GlassCard>
                    <GlassCardContent className="pt-4 pb-4">
                        <SheetRightColumn sheet={sheet} form={form} />
                    </GlassCardContent>
                </GlassCard>
            </div>
        </motion.div>
    )
}
