"use client"

import * as React from "react"
import { GlassCard } from "@/components/ui/glass-card"
import { Chip } from "@/components/ui/chip"
import { ScrollText, BookOpen, Quote, Sparkles, ExternalLink, Fingerprint } from "lucide-react"
import { cn } from "@/core/utils"
import { entityColors } from "@/lib/config/colors"
import { Reference } from "../types/rules.types"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { EntityTitleLink, MentionContent } from "./mention-badge"
import { GlassPopover, GlassPopoverTrigger, GlassPopoverContent } from "@/components/ui/glass-popover"
import { FeatPreview } from "@/features/feats/components/feat-preview"
import { SpellPreview } from "@/features/spells/components/spell-preview"
import { ClassPreview } from "@/features/classes/components/class-preview"
import { SubclassPreview } from "@/features/classes/components/subclass-preview"
import { BackgroundPreview } from "@/features/backgrounds/components/background-preview"
import { RacePreview } from "@/features/races/components/race-preview"
import { ItemPreview } from "@/features/items/components/item-preview"
import { useWindows } from "@/core/context/window-context"
import { motion, AnimatePresence } from "framer-motion"
import { EntitySource } from "./entity-source"

interface RulePreviewProps {
    rule: Reference
    showStatus?: boolean
}

export const RulePreview = ({ rule, showStatus = true }: RulePreviewProps) => {
    const { addWindow } = useWindows()
    return (
        <div className="space-y-4 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg border flex-shrink-0", entityColors.Regra.badge)}>
                        <ScrollText className="w-4 h-4" />
                    </div>
                    <div>
                        <EntityTitleLink name={rule.name} entityType="Regra" />
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Regra do Sistema</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    {showStatus && (
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

            <EntitySource source={rule.source} />
        </div>
    )
}

/**
 * T041: Added Trait preview component for Habilidade entity type.
 */
interface TraitPreviewProps {
    trait: any // Trait type from features/traits
    showStatus?: boolean
}

export const TraitPreview = ({ trait, showStatus = true, hideStatusChip = false, hideActionIcons = false }: TraitPreviewProps & { hideStatusChip?: boolean; hideActionIcons?: boolean }) => {
    const { addWindow } = useWindows()
    return (
        <div className="space-y-4 w-full">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Habilidade.badge)}>
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                        <EntityTitleLink name={trait.name} entityType="Habilidade" />
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Habilidade D&D</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
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

            <EntitySource source={trait.source} />
        </div>
    )
}

/**
 * RacePreview specialized for the tooltip with actions.
 */
export const RacePreviewWithActions = ({ race, showStatus = true }: { race: any; showStatus?: boolean }) => {
    const { addWindow } = useWindows()
    return (
        <div className="space-y-4 w-full">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Raça.badge)}>
                        <Fingerprint className="w-4 h-4" />
                    </div>
                    <div>
                        <EntityTitleLink name={race.name} entityType="Raça" />
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Raça D&D 5e</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
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

            <RacePreview race={race} showStatus={false} />
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

export const EntityPreviewTooltip = ({ entityId, entityType, children, side = "top", delayDuration = 300 }: EntityPreviewTooltipProps) => {
    const [data, setData] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(false)
    const [open, setOpen] = React.useState(false)
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    const fetchData = React.useCallback(async () => {
        if (data || loading) return

        setLoading(true)
        try {
            // T041: Updated endpoint logic to support Habilidade via /api/traits and Talento via /api/feats
            let endpoint = `/api/core/${entityType.toLowerCase()}/${entityId}`
            if (entityType === "Regra") {
                endpoint = `/api/rules/${entityId}`
            } else if (entityType === "Habilidade") {
                endpoint = `/api/traits/${entityId}`
            } else if (entityType === "Talento") {
                endpoint = `/api/feats/${entityId}`
            } else if (entityType === "Magia") {
                endpoint = `/api/spells/${entityId}`
            } else if (entityType === "Classe") {
                endpoint = `/api/classes/${entityId}`
            } else if (entityType === "Subclasse") {
                const match = /^subclass:([^:]+):(.+)$/.exec(entityId)
                endpoint = match ? `/api/classes/${match[1]}` : ""
            } else if (entityType === "Origem") {
                endpoint = `/api/backgrounds/${entityId}`
            } else if (entityType === "Raça") {
                endpoint = `/api/races/${entityId}`
            } else if (entityType === "Item") {
                endpoint = `/api/items/${entityId}`
            }

            if (!endpoint) return

            const res = await fetch(endpoint)
            if (res.ok) {
                const json = await res.json()
                if (entityType === "Subclasse") {
                    const match = /^subclass:([^:]+):(.+)$/.exec(entityId)
                    const subclassId = match?.[2]
                    const subclass = json?.subclasses?.find((sub: any) => String(sub._id || sub.name) === subclassId) || null
                    setData({ parentClass: json, subclass })
                } else {
                    setData(json)
                }
            }
        } catch (e) {
            console.error("Failed to fetch entity preview:", e)
        } finally {
            setLoading(false)
        }
    }, [entityId, entityType, data, loading])

    // Fetch data when popover opens, ensuring mobile clicks and desktop hovers both trigger loading
    React.useEffect(() => {
        if (open) {
            fetchData()
        }
    }, [open, fetchData])

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
        }, 300) // Small delay to allow moving between trigger and content
    }

    const content = React.useMemo(() => {
        if (loading) return <div className="p-4 text-xs text-white/40 animate-pulse text-center w-[200px]">Carregando detalhes...</div>
        if (!data) return <div className="p-4 text-xs text-white/40 text-center w-[200px]">Sem informações disponíveis</div>

        switch (entityType) {
            case "Regra":
                return <RulePreview rule={data} />
            case "Habilidade":
                return <TraitPreview trait={data} />
            case "Talento":
                return <FeatPreview feat={data} />
            case "Magia":
                return <SpellPreview spell={data} />
            case "Classe":
                return <ClassPreview characterClass={data} showStatus={true} />
            case "Subclasse":
                if (!data?.parentClass || !data?.subclass) {
                    return <div className="p-4 text-xs text-white/40 text-center w-[200px]">Subclasse não encontrada</div>
                }
                return <SubclassPreview subclass={data.subclass} parentClassName={data.parentClass.name} linkToParentClass />
            case "Origem":
                return <BackgroundPreview background={data} />
            case "Raça":
                return <RacePreviewWithActions race={data} showStatus={true} />
            case "Item":
                return <ItemPreview item={data} showStatus={true} />
            default:
                return (
                    <div className="p-4">
                        <p className="text-sm font-bold text-white">
                            <MentionContent html={data.name || data.label || entityId} />
                        </p>
                        <p className="text-xs text-white/40">{entityType}</p>
                    </div>
                )
        }
    }, [entityType, data, loading, entityId])

    return (
        <GlassPopover open={open} onOpenChange={setOpen}>
            <GlassPopoverTrigger asChild onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                {children}
            </GlassPopoverTrigger>
            <GlassPopoverContent
                side={side}
                className="w-[calc(100vw-2rem)] sm:w-auto max-w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[85vh] sm:max-h-[400px] overflow-y-auto glass-scrollbar pointer-events-auto"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onWheel={(e) => e.stopPropagation()}
                style={{ isolation: "isolate" }}
            >
                {content}
            </GlassPopoverContent>
        </GlassPopover>
    )
}
