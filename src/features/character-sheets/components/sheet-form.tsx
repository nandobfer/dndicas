"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useAuth } from "@/core/hooks/useAuth"
import { motionConfig } from "@/lib/config/motion-configs"
import { SheetHeader, useSheetHeaderSections } from "./sheet-header"
import { SheetAttributesAndItems } from "./sheet-attributes-and-items"
import { SheetAttacksTraitsSpells } from "./sheet-attacks-traits-spells"
import { SheetNotes } from "./sheet-notes"
import { useSheetAttributesLeftSections } from "./sheet-attributes-left"
import { useSheetAttributesRightSections } from "./sheet-attributes-right"
import { useSheetAttacksAndTraitsSections } from "./sheet-attacks-and-traits"
import { ItemList } from "./item-list"
import { SpellList } from "./spell-list"
import { useSheetAutoSave } from "../hooks/use-sheet-auto-save"
import { useSheetMentionSync } from "../hooks/use-sheet-mention-sync"
import { useItems } from "../api/character-sheets-queries"
import type { CharacterSheetFull } from "../types/character-sheet.types"
import { useMediaQuery } from "@/core/hooks/useMediaQuery"

interface SheetFormProps {
    sheet: CharacterSheetFull
}

export function SheetForm({ sheet }: SheetFormProps) {
    const router = useRouter()
    const { userId, isSignedIn, isLoaded } = useAuth()
    const isDesktop = useMediaQuery("(min-width: 1024px)")
    const [hasHydrated, setHasHydrated] = useState(false)
    const canEdit = isLoaded && isSignedIn && userId === sheet.userId
    const isReadOnly = !canEdit

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            setHasHydrated(true)
        })
        return () => cancelAnimationFrame(frame)
    }, [])

    const handleSlugChange = useCallback((newSlug: string) => {
        router.replace(`/sheets/${newSlug}`)
    }, [router])

    const form = useSheetAutoSave(sheet, { onSlugChange: handleSlugChange, disabled: isReadOnly })
    const { data: items = [] } = useItems(sheet._id)
    const headerSections = useSheetHeaderSections({ sheet, form, items, isReadOnly })
    const leftSections = useSheetAttributesLeftSections({ sheet, form, isReadOnly })
    const rightAttributeCards = useSheetAttributesRightSections({ sheet, form, isReadOnly })
    const attacksSections = useSheetAttacksAndTraitsSections({ sheet, form, isReadOnly })

    useSheetMentionSync({ sheet, form, isReadOnly })

    const shouldRenderDesktop = hasHydrated ? isDesktop : true

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-4">
            {shouldRenderDesktop ? (
                <div className="space-y-4">
                    <SheetHeader sheet={sheet} form={form} items={items} isReadOnly={isReadOnly} />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                        <SheetAttributesAndItems sheet={sheet} form={form} isReadOnly={isReadOnly} />
                        <SheetAttacksTraitsSpells sheet={sheet} form={form} isReadOnly={isReadOnly} />
                    </div>

                    <SheetNotes sheet={sheet} form={form} isReadOnly={isReadOnly} />
                </div>
            ) : (
                <div className="space-y-4">
                    {headerSections.identityCard}

                    <div className="grid grid-cols-2 gap-4 items-stretch">
                        {headerSections.levelCard}
                        {headerSections.armorClassCard}
                    </div>

                    {headerSections.hitPointsCard}
                    {headerSections.hitDiceAndDeathSavesCard}
                    {attacksSections.combatStatsCard}
                    {leftSections.inspirationCard}
                    {leftSections.proficiencyBonusCard}
                    {leftSections.attributeCards}
                    {rightAttributeCards}
                    {attacksSections.attacksCard}
                    {attacksSections.resourceChargesCard}
                    {attacksSections.classFeaturesCard}
                    {attacksSections.speciesTraitsCard}
                    {attacksSections.featsCard}
                    {leftSections.trainingCard}
                    <ItemList sheet={sheet} form={form} isReadOnly={isReadOnly} />
                    <SpellList sheet={sheet} form={form} isReadOnly={isReadOnly} />
                    <SheetNotes sheet={sheet} form={form} isReadOnly={isReadOnly} />
                </div>
            )}
        </motion.div>
    )
}
