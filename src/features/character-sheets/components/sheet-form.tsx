"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useAuth } from "@/core/hooks/useAuth"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { SheetHeader } from "./sheet-header"
import { SheetLeftColumn } from "./sheet-left-column"
import { SheetMiddleColumn } from "./sheet-middle-column"
import { SheetCenterColumn } from "./sheet-center-column"
import { SheetRightColumn } from "./sheet-right-column"
import { CompactRichInput } from "./compact-rich-input"
import { useSheetAutoSave } from "../hooks/use-sheet-auto-save"
import { useSheetMentionSync } from "../hooks/use-sheet-mention-sync"
import { usePatchSheet, useItems } from "../api/character-sheets-queries"
import type { CharacterSheetFull, PatchSheetBody } from "../types/character-sheet.types"

interface SheetFormProps {
    sheet: CharacterSheetFull
}

export function SheetForm({ sheet }: SheetFormProps) {
    const router = useRouter()
    const { userId, isSignedIn, isLoaded } = useAuth()
    const canEdit = isLoaded && isSignedIn && userId === sheet.userId
    const isReadOnly = !canEdit

    const handleSlugChange = useCallback((newSlug: string) => {
        router.replace(`/sheets/${newSlug}`)
    }, [router])

    const form = useSheetAutoSave(sheet, { onSlugChange: handleSlugChange, disabled: isReadOnly })
    const { watch, setFieldLocally, patchField } = form
    const { isPending: isLoading } = usePatchSheet(sheet._id)
    const { data: items = [] } = useItems(sheet._id)

    useSheetMentionSync({ sheet, form, isReadOnly })

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-4">
            {/* Header */}
            <SheetHeader sheet={sheet} form={form} items={items} isReadOnly={isReadOnly} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <GlassCard>
                        <GlassCardContent className="pt-4 pb-4">
                            <SheetLeftColumn sheet={sheet} form={form} isReadOnly={isReadOnly} />
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardContent className="pt-4 pb-4">
                            <SheetMiddleColumn sheet={sheet} form={form} isReadOnly={isReadOnly} />
                        </GlassCardContent>
                    </GlassCard>
                </div>

                <GlassCard>
                    <GlassCardContent className="pt-4 pb-4">
                        <SheetCenterColumn sheet={sheet} form={form} isReadOnly={isReadOnly} />
                    </GlassCardContent>
                </GlassCard>
            </div>

            {/* Items + Spells — two equal columns, always open */}
            <SheetRightColumn sheet={sheet} form={form} isReadOnly={isReadOnly} />

            {/* Notes — full-width, always open */}
            <GlassCard>
                <GlassCardContent className="p-4">
                    <CompactRichInput
                        variant="full"
                        label="Notas"
                        value={watch("notes") ?? sheet.notes ?? ""}
                        onChange={(v) => setFieldLocally("notes" as keyof PatchSheetBody, v)}
                        onBlur={(v) => patchField("notes" as keyof PatchSheetBody, v)}
                        placeholder="Anotações livres, histórico, recompensas, NPCs... use @ para mencionar"
                        isLoading={isLoading}
                        minRows={5}
                        excludeId={sheet._id}
                        disabled={isReadOnly}
                    />
                </GlassCardContent>
            </GlassCard>
        </motion.div>
    )
}
