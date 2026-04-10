"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useAuth } from "@/core/hooks/useAuth"
import { motionConfig } from "@/lib/config/motion-configs"
import { SheetHeader } from "./sheet-header"
import { SheetAttributesAndItems } from "./sheet-attributes-and-items"
import { SheetAttacksTraitsSpells } from "./sheet-attacks-traits-spells"
import { SheetNotes } from "./sheet-notes"
import { useSheetAutoSave } from "../hooks/use-sheet-auto-save"
import { useSheetMentionSync } from "../hooks/use-sheet-mention-sync"
import { useItems } from "../api/character-sheets-queries"
import type { CharacterSheetFull } from "../types/character-sheet.types"

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
    const { data: items = [] } = useItems(sheet._id)

    useSheetMentionSync({ sheet, form, isReadOnly })

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-4">
            {/* Header */}
            <SheetHeader sheet={sheet} form={form} items={items} isReadOnly={isReadOnly} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <SheetAttributesAndItems sheet={sheet} form={form} isReadOnly={isReadOnly} />
                <SheetAttacksTraitsSpells sheet={sheet} form={form} isReadOnly={isReadOnly} />
            </div>

            <SheetNotes sheet={sheet} form={form} isReadOnly={isReadOnly} />
        </motion.div>
    )
}
