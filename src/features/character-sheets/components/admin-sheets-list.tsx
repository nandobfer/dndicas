"use client"

import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { ScrollText } from "lucide-react"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassSheetCard } from "@/components/ui/glass-sheet-card"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { InfiniteScrollSentinel } from "@/components/ui/infinite-scroll-sentinel"
import { motionConfig } from "@/lib/config/motion-configs"
import type { AdminSheetListItem, CharacterSheet } from "../types/character-sheet.types"

interface AdminSheetsListProps {
    items: AdminSheetListItem[]
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    error?: Error | null
    onLoadMore: () => void
    onRetry: () => void
}

const DEFAULT_SAVING_THROWS: CharacterSheet["savingThrows"] = {
    strength: false,
    dexterity: false,
    constitution: false,
    intelligence: false,
    wisdom: false,
    charisma: false,
}

function toCardSheet(item: AdminSheetListItem): CharacterSheet {
    return {
        _id: item.id,
        slug: item.slug,
        userId: item.owner.id ?? "",
        username: item.owner.username,
        name: item.name,
        class: item.class,
        classRef: null,
        subclass: item.subclass,
        subclassRef: null,
        level: item.level ?? 1,
        experience: "",
        race: item.race,
        raceRef: null,
        origin: item.origin,
        originRef: null,
        inspiration: false,
        multiclassNotes: "",
        photo: item.photo,
        age: "",
        height: "",
        weight: "",
        eyes: "",
        skin: "",
        hair: "",
        appearance: "",
        strength: item.strength,
        dexterity: item.dexterity,
        constitution: item.constitution,
        intelligence: item.intelligence,
        wisdom: item.wisdom,
        charisma: item.charisma,
        proficiencyBonusOverride: null,
        savingThrows: DEFAULT_SAVING_THROWS,
        skills: {} as CharacterSheet["skills"],
        movementSpeed: "",
        hpMax: item.hpMax,
        hpCurrent: item.hpCurrent,
        hpTemp: 0,
        hitDiceTotal: "",
        hitDiceUsed: 0,
        deathSavesSuccess: 0,
        deathSavesFailure: 0,
        armorClassOverride: null,
        armorClassBonus: null,
        unarmoredDefense: { enabled: false, base: 10, attributes: [] },
        initiativeOverride: null,
        initiativeProficiency: false,
        passivePerceptionOverride: null,
        spellcastingAttribute: null,
        spellSaveDCOverride: null,
        spellAttackBonusOverride: null,
        spellSlots: {},
        resourceCharges: [],
        coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        personalityTraits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        history: "",
        notes: "",
        notePages: [],
        classFeatures: "",
        speciesTraits: "",
        featuresNotes: "",
        size: "",
        armorTraining: { light: false, medium: false, heavy: false, shields: false },
        weaponProficiencies: "",
        toolProficiencies: "",
        computedArmorClass: item.computedArmorClass,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }
}

export function AdminSheetsList({ items, isLoading, hasNextPage, isFetchingNextPage, error, onLoadMore, onRetry }: AdminSheetsListProps) {
    const router = useRouter()

    if (isLoading && items.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <LoadingState variant="skeleton" message="Carregando fichas..." lines={6} />
                </GlassCardContent>
            </GlassCard>
        )
    }

    if (error && items.length === 0) {
        return (
            <div className="py-12">
                <ErrorState title="Erro ao carregar fichas" error={error} onRetry={onRetry} isRetrying={isLoading} />
            </div>
        )
    }

    if (!isLoading && items.length === 0) {
        return (
            <div className="py-12">
                <EmptyState
                    title="Nenhuma ficha encontrada"
                    description="Tente ajustar a busca para encontrar outras fichas."
                    icon={ScrollText}
                />
            </div>
        )
    }

    return (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                    {items.map((item, index) => (
                        <motion.div
                            key={item.id}
                            layout
                            variants={motionConfig.variants.fadeInUp}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ delay: (index % 10) * 0.04 }}
                        >
                            <GlassSheetCard
                                sheet={toCardSheet(item)}
                                variant="admin"
                                owner={item.owner}
                                showDelete={false}
                                onOpen={() => router.push(`/sheets/${item.slug}`)}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            <InfiniteScrollSentinel
                isLoading={isLoading}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={onLoadMore}
            />
        </>
    )
}
