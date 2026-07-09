"use client"

import * as React from "react"
import { Chip } from "@/components/ui/chip"
import { ScrollText, Quote, Sparkles, ExternalLink, Fingerprint } from "lucide-react"
import { cn } from "@/core/utils"
import { entityColors } from "@/lib/config/colors"
import { Reference } from "../types/rules.types"
import { EntityTitleLink, MentionContent } from "./mention-badge"
import { GlassPopover, GlassPopoverTrigger, GlassPopoverContent } from "@/components/ui/glass-popover"
import { FeatPreview } from "@/features/feats/components/feat-preview"
import type { Feat } from "@/features/feats/types/feats.types"
import { SpellPreview } from "@/features/spells/components/spell-preview"
import type { Spell } from "@/features/spells/types/spells.types"
import { ClassPreview } from "@/features/classes/components/class-preview"
import { SubclassPreview } from "@/features/classes/components/subclass-preview"
import type { CharacterClass, Subclass } from "@/features/classes/types/classes.types"
import { BackgroundPreview } from "@/features/backgrounds/components/background-preview"
import type { Background } from "@/features/backgrounds/types/backgrounds.types"
import { RacePreview } from "@/features/races/components/race-preview"
import type { Race } from "@/features/races/types/races.types"
import { ItemPreview } from "@/features/items/components/item-preview"
import type { Item } from "@/features/items/types/items.types"
import { MonsterPreview } from "@/features/monsters/components/monster-preview"
import type { Monster } from "@/features/monsters/types/monsters.types"
import { useWindows } from "@/core/context/window-context"
import { useAuth } from "@/core/hooks/useAuth"
import { motion } from "framer-motion"
import { EntitySource } from "./entity-source"
import type { Trait } from "@/features/traits/types/traits.types"
import { ChargesPreview } from "@/features/shared/charges/charges-preview"
import { EntityGenerationAIModal } from "@/features/entity-generation/components/entity-generation-ai-modal"
import { spellGenerationAdapter } from "@/features/entity-generation/adapters/spell-generation-adapter"
import { featGenerationAdapter } from "@/features/entity-generation/adapters/feat-generation-adapter"
import { monsterGenerationAdapter } from "@/features/entity-generation/adapters/monster-generation-adapter"
import { EntityAIUnderstandButton } from "@/features/entity-understanding/components/entity-ai-understand-button"

interface RulePreviewProps {
    rule: Reference
    showStatus?: boolean
    hideActionIcons?: boolean
}

export const RulePreview = ({ rule, showStatus = true, hideActionIcons = false }: RulePreviewProps) => {
    const { addWindow } = useWindows()
    return (
        <div className="space-y-4 w-full">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg border flex-shrink-0", entityColors.Regra.badge)}>
                        <ScrollText className="w-4 h-4" />
                    </div>
                    <div>
                        <EntityTitleLink name={rule.name} entityType="Regra" entity={rule} />
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Regra do Sistema</p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                    {!hideActionIcons && (
                        <EntityAIUnderstandButton entity={rule} entityId={String(rule._id || rule.name)} entityType="Regra" entityName={rule.name} />
                    )}
                    {!hideActionIcons && (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() =>
                                addWindow({
                                    title: rule.name || "Regra",
                                    content: null,
                                    item: rule,
                                    entityType: "Regra",
                                })
                            }
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            title="Abrir em nova janela"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </motion.button>
                    )}
                    {showStatus && (
                        <Chip variant={rule.status === "active" ? "uncommon" : "common"} size="sm">
                            {rule.status === "active" ? "Ativa" : "Inativa"}
                        </Chip>
                    )}
                </div>
            </div>

            {rule.description && (
                <div className="relative">
                    <Quote className="absolute -top-1 -left-1 w-8 h-8 text-white/5 -z-10" />
                    <div className="text-xs text-white/70 pl-4 border-l border-white/10 py-1 break-words">
                        <MentionContent html={rule.description} mode="block" />
                    </div>
                </div>
            )}

            <EntitySource source={rule.source} originalName={rule.originalName} />
        </div>
    )
}

/**
 * T041: Added Trait preview component for Habilidade entity type.
 */
interface TraitPreviewProps {
    trait: Trait
    showStatus?: boolean
}

type SubclassParentData = {
    name?: string
    subclasses?: Subclass[]
} & Record<string, unknown>

type SubclassPreviewData = {
    parentClass: SubclassParentData
    subclass: Subclass
}

const normalizeMonsterPreviewData = (json: unknown): Monster => {
    const data = (json && typeof json === "object" ? json : {}) as Partial<Monster> & Record<string, unknown>

    return {
        _id: String(data._id || data.id || ""),
        id: String(data.id || data._id || ""),
        name: String(data.name || "Monstro"),
        originalName: data.originalName,
        source: String(data.source || ""),
        description: String(data.description || ""),
        image: typeof data.image === "string" ? data.image : undefined,
        status: data.status === "inactive" ? "inactive" : "active",
        type: data.type || "beast",
        size: data.size || "M",
        alignment: data.alignment || "unaligned",
        armorClass: data.armorClass ?? "—",
        initiative: data.initiative,
        hitPointsFormula: String(data.hitPointsFormula || "0"),
        speed: data.speed,
        flySpeed: data.flySpeed,
        swimSpeed: data.swimSpeed,
        climbSpeed: data.climbSpeed,
        attributes: {
            strength: data.attributes?.strength ?? 10,
            dexterity: data.attributes?.dexterity ?? 10,
            constitution: data.attributes?.constitution ?? 10,
            intelligence: data.attributes?.intelligence ?? 10,
            wisdom: data.attributes?.wisdom ?? 10,
            charisma: data.attributes?.charisma ?? 10,
        },
        savingThrows: data.savingThrows || {},
        skills: data.skills || {},
        senses: data.senses || {},
        sensesAndLanguages: Array.isArray(data.sensesAndLanguages) ? data.sensesAndLanguages : [],
        challengeRating: String(data.challengeRating || "0"),
        experience: data.experience,
        experienceOverride: data.experienceOverride,
        proficiencyBonusOverride: data.proficiencyBonusOverride,
        languages: String(data.languages || ""),
        damageVulnerabilities: Array.isArray(data.damageVulnerabilities) ? data.damageVulnerabilities : [],
        damageResistances: Array.isArray(data.damageResistances) ? data.damageResistances : [],
        damageImmunities: Array.isArray(data.damageImmunities) ? data.damageImmunities : [],
        conditionImmunities: Array.isArray(data.conditionImmunities) ? data.conditionImmunities : [],
        conditionImmunityNotes: data.conditionImmunityNotes,
        traits: Array.isArray(data.traits) ? data.traits : [],
        actions: Array.isArray(data.actions) ? data.actions : [],
        bonusActions: Array.isArray(data.bonusActions) ? data.bonusActions : [],
        reactions: Array.isArray(data.reactions) ? data.reactions : [],
        legendaryActions: Array.isArray(data.legendaryActions) ? data.legendaryActions : [],
        legendaryActionUses: data.legendaryActionUses,
        lairActions: Array.isArray(data.lairActions) ? data.lairActions : [],
        lairActionInitiative: data.lairActionInitiative,
        regionalEffects: Array.isArray(data.regionalEffects) ? data.regionalEffects : [],
        createdAt: String(data.createdAt || ""),
        updatedAt: String(data.updatedAt || ""),
    }
}

export const TraitPreview = ({ trait, showStatus = true, hideStatusChip = false, hideActionIcons = false }: TraitPreviewProps & { hideStatusChip?: boolean; hideActionIcons?: boolean }) => {
    const { addWindow } = useWindows()
    return (
        <div className="space-y-4 w-full">
            <div className="flex items-start justify-between gap-4">
                <div className="flex shrink-0 items-center justify-end gap-2">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Habilidade.badge)}>
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                        <EntityTitleLink name={trait.name} entityType="Habilidade" entity={trait} />
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Habilidade D&D</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!hideActionIcons && (
                        <EntityAIUnderstandButton entity={trait} entityId={String(trait._id || trait.name)} entityType="Habilidade" entityName={trait.name} />
                    )}
                    {!hideActionIcons && (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() =>
                                addWindow({
                                    title: trait.name || "Habilidade",
                                    content: null,
                                    item: trait,
                                    entityType: "Habilidade",
                                })
                            }
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            title="Abrir em nova janela"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </motion.button>
                    )}
                    {showStatus && !hideStatusChip && (
                        <Chip variant={trait.status === "active" ? "uncommon" : "common"} size="sm">
                            {trait.status === "active" ? "Ativa" : "Inativa"}
                        </Chip>
                    )}
                </div>
            </div>

            {trait.description && (
                <div className="relative">
                    <Quote className="absolute -top-1 -left-1 w-8 h-8 text-white/5 -z-10" />
                    <div className="text-xs text-white/70 pl-4 border-l border-white/10 py-1 break-words">
                        <MentionContent html={trait.description} mode="block" />
                    </div>
                </div>
            )}

            <ChargesPreview charges={trait.charges} />

            <EntitySource source={trait.source} originalName={trait.originalName} />
        </div>
    )
}

/**
 * RacePreview specialized for the tooltip with actions.
 */
export const RacePreviewWithActions = ({ race, showStatus = true }: { race: Race; showStatus?: boolean }) => {
    const { addWindow } = useWindows()
    return (
        <div className="space-y-4 w-full">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Raça.badge)}>
                        <Fingerprint className="w-4 h-4" />
                    </div>
                    <div>
                        <EntityTitleLink name={race.name} entityType="Raça" entity={race} />
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Raça D&D 5e</p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                    <EntityAIUnderstandButton entity={race} entityId={String(race._id || race.name)} entityType="Raça" entityName={race.name} />
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() =>
                            addWindow({
                                title: race.name || "Raça",
                                content: null,
                                item: race,
                                entityType: "Raça",
                            })
                        }
                        className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                        title="Abrir em nova janela"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </motion.button>
                    {showStatus && race.status === "inactive" && (
                        <Chip variant="common" size="sm" className="opacity-50">
                            Inativa
                        </Chip>
                    )}
                </div>
            </div>

            <RacePreview race={race} showStatus={false} hideActionIcons />
        </div>
    )
}

interface EntityPreviewTooltipProps {
    entityId: string
    entityType: string
    children: React.ReactNode
    side?: "top" | "right" | "bottom" | "left"
    delayDuration?: number
}

const getEntityPreviewEndpoint = (entityId: string, entityType: string) => {
    if (entityType === "Regra") {
        return `/api/rules/${entityId}`
    }

    if (entityType === "Habilidade") {
        return `/api/traits/${entityId}`
    }

    if (entityType === "Talento") {
        return `/api/feats/${entityId}`
    }

    if (entityType === "Magia") {
        return `/api/spells/${entityId}`
    }

    if (entityType === "Classe") {
        return `/api/classes/${entityId}`
    }

    if (entityType === "Subclasse") {
        const match = /^subclass:([^:]+):(.+)$/.exec(entityId)
        return match ? `/api/classes/${match[1]}` : ""
    }

    if (entityType === "Origem") {
        return `/api/backgrounds/${entityId}`
    }

    if (entityType === "Raça") {
        return `/api/races/${entityId}`
    }

    if (entityType === "Item") {
        return `/api/items/${entityId}`
    }

    if (entityType === "Monstro") {
        return `/api/monsters/${entityId}`
    }

    return `/api/core/${entityType.toLowerCase()}/${entityId}`
}

const normalizeEntityPreviewData = (entityId: string, entityType: string, json: unknown) => {
    if (entityType === "Monstro") {
        return normalizeMonsterPreviewData(json)
    }

    if (entityType !== "Subclasse") {
        return json
    }

    const parentData = json as SubclassParentData
    const match = /^subclass:([^:]+):(.+)$/.exec(entityId)
    const subclassId = match?.[2]
    const subclass = parentData.subclasses?.find((sub) => String(sub._id || sub.name) === subclassId) || null

    return { parentClass: parentData, subclass }
}

const buildEntityPreviewCacheKey = (entityId: string, entityType: string) => `${entityType}:${entityId}`

const useEntityPreviewData = ({ entityId, entityType, enabled }: { entityId: string; entityType: string; enabled: boolean }) => {
    const cacheRef = React.useRef(new Map<string, unknown>())
    const [data, setData] = React.useState<unknown>(null)
    const [loading, setLoading] = React.useState(false)
    const [reloadVersion, setReloadVersion] = React.useState(0)
    const cacheKey = React.useMemo(() => buildEntityPreviewCacheKey(entityId, entityType), [entityId, entityType])

    const invalidate = React.useCallback(() => {
        cacheRef.current.delete(cacheKey)
        setData(null)
        setReloadVersion((currentVersion) => currentVersion + 1)
    }, [cacheKey])

    React.useEffect(() => {
        if (!enabled) {
            return
        }

        const cachedData = cacheRef.current.get(cacheKey)
        if (cachedData) {
            setData(cachedData)
            setLoading(false)
            return
        }

        const endpoint = getEntityPreviewEndpoint(entityId, entityType)
        if (!endpoint) {
            setData(null)
            setLoading(false)
            return
        }

        let cancelled = false
        setData(null)
        setLoading(true)

        const run = async () => {
            try {
                const response = await fetch(endpoint)
                if (!response.ok) {
                    if (!cancelled) {
                        setData(null)
                    }
                    return
                }

                const json = await response.json()
                const normalizedData = normalizeEntityPreviewData(entityId, entityType, json)

                if (cancelled) {
                    return
                }

                cacheRef.current.set(cacheKey, normalizedData)
                setData(normalizedData)
            } catch (error) {
                console.error("Failed to fetch entity preview:", error)
                if (!cancelled) {
                    setData(null)
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        void run()

        return () => {
            cancelled = true
        }
    }, [cacheKey, enabled, entityId, entityType, reloadVersion])

    return { data, loading, invalidate }
}

interface EntityPreviewPanelProps {
    entityId: string
    entityType: string
    enabled?: boolean
}

export const EntityPreviewPanel = ({ entityId, entityType, enabled = true }: EntityPreviewPanelProps) => {
    const { isAdmin } = useAuth()
    const [generationOpen, setGenerationOpen] = React.useState(false)
    const { data, loading, invalidate } = useEntityPreviewData({ entityId, entityType, enabled })
    const canGenerateAI = isAdmin && (entityType === "Magia" || entityType === "Talento" || entityType === "Monstro")

    const content = React.useMemo(() => {
        if (loading) return <div className="p-4 text-xs text-white/40 animate-pulse text-center w-[200px]">Carregando detalhes...</div>
        if (!data) return <div className="p-4 text-xs text-white/40 text-center w-[200px]">Sem informações disponíveis</div>

        const generateAIButton = canGenerateAI ? (
            <button
                type="button"
                onClick={() => setGenerationOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-purple-300/25 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-100 transition-colors hover:bg-purple-500/15"
            >
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-purple-200" />
                <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-blue-300 bg-clip-text text-transparent">
                    Gerar com IA
                </span>
            </button>
        ) : null

        switch (entityType) {
            case "Regra":
                return <RulePreview rule={data as Reference} />
            case "Habilidade":
                return <TraitPreview trait={data as Trait} />
            case "Talento":
                return (
                    <div className="space-y-3">
                        {generateAIButton}
                        <FeatPreview feat={data as Feat} />
                    </div>
                )
            case "Magia":
                return (
                    <div className="space-y-3">
                        {generateAIButton}
                        <SpellPreview spell={data as Spell} />
                    </div>
                )
            case "Classe":
                return <ClassPreview characterClass={data as CharacterClass} showStatus={true} />
            case "Subclasse":
                if (!data || typeof data !== "object" || !("parentClass" in data) || !("subclass" in data) || !data.parentClass || !data.subclass) {
                    return <div className="p-4 text-xs text-white/40 text-center w-[200px]">Subclasse não encontrada</div>
                }
                return <SubclassPreview subclass={(data as SubclassPreviewData).subclass} parentClassName={(data as SubclassPreviewData).parentClass.name} linkToParentClass />
            case "Origem":
                return <BackgroundPreview background={data as Background} />
            case "Raça":
                return <RacePreviewWithActions race={data as Race} showStatus={true} />
            case "Item":
                return <ItemPreview item={data as Item} showStatus={true} />
            case "Monstro":
                return (
                    <div className="space-y-3">
                        {generateAIButton}
                        <MonsterPreview monster={data as Monster} showStatus={true} />
                    </div>
                )
            default: {
                const fallbackData = (data ?? {}) as Record<string, unknown>
                return (
                    <div className="p-4">
                        <p className="text-sm font-bold text-white">
                            <MentionContent html={String(fallbackData.name || fallbackData.label || entityId)} />
                        </p>
                        <p className="text-xs text-white/40">{entityType}</p>
                    </div>
                )
            }
        }
    }, [canGenerateAI, data, entityId, entityType, loading])

    return (
        <>
            {content}
            {entityType === "Magia" && (
                <EntityGenerationAIModal
                    open={generationOpen}
                    entity={(data as Spell | null) ?? null}
                    adapter={spellGenerationAdapter}
                    onOpenChange={setGenerationOpen}
                    onApplied={invalidate}
                />
            )}
            {entityType === "Talento" && (
                <EntityGenerationAIModal
                    open={generationOpen}
                    entity={(data as Feat | null) ?? null}
                    adapter={featGenerationAdapter}
                    onOpenChange={setGenerationOpen}
                    onApplied={invalidate}
                />
            )}
            {entityType === "Monstro" && (
                <EntityGenerationAIModal
                    open={generationOpen}
                    entity={(data as Monster | null) ?? null}
                    adapter={monsterGenerationAdapter}
                    onOpenChange={setGenerationOpen}
                    onApplied={invalidate}
                />
            )}
        </>
    )
}

export const EntityPreviewTooltip = ({ entityId, entityType, children, side = "top", delayDuration = 300 }: EntityPreviewTooltipProps) => {
    const [open, setOpen] = React.useState(false)
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
            setOpen(true)
        }, delayDuration)
    }

    const handleMouseLeave = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
            setOpen(false)
        }, 300)
    }

    React.useEffect(() => () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
        }
    }, [])

    return (
        <>
            <GlassPopover open={open} onOpenChange={setOpen}>
                <GlassPopoverTrigger asChild onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                    {children}
                </GlassPopoverTrigger>
                <GlassPopoverContent
                    data-mention-interaction-surface="entity-preview"
                    side={side}
                    className="w-[calc(100vw-2rem)] sm:w-auto max-w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[85vh] sm:max-h-[400px] overflow-y-auto glass-scrollbar pointer-events-auto"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onWheel={(e) => e.stopPropagation()}
                    style={{ isolation: "isolate" }}
                >
                    <EntityPreviewPanel entityId={entityId} entityType={entityType} enabled={open} />
                </GlassPopoverContent>
            </GlassPopover>
        </>
    )
}
