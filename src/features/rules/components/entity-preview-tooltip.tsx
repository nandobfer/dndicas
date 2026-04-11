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
import { useWindows } from "@/core/context/window-context"
import { motion } from "framer-motion"
import { EntitySource } from "./entity-source"
import { GlassDiceValue } from "@/components/ui/glass-dice-value"
import type { Trait } from "@/features/traits/types/traits.types"
import { parseTraitChargeDice, sortTraitChargeRows } from "@/features/traits/utils/trait-charges"

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

function renderChargeValue(value: string) {
    const dice = parseTraitChargeDice(value)
    if (dice) {
        return <GlassDiceValue value={dice} className="text-xs" />
    }

    return <span className="font-mono text-xs text-white/70">{value}</span>
}

function TraitChargesPreview({ trait }: { trait: Trait }) {
    if (!trait.charges) return null

    if (trait.charges.mode === "fixed") {
        return (
            <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/35">Cargas</p>
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="text-xs text-white/45">Fixa</span>
                    {renderChargeValue(trait.charges.value)}
                </div>
            </div>
        )
    }

    const rows = sortTraitChargeRows(trait.charges.values)

    return (
        <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/35">Cargas por nível</p>
            <div className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.02]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[220px] border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.03]">
                                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-white/30">Nível</th>
                                <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-[0.15em] text-white/30">Cargas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.level} className="border-b border-white/5 last:border-b-0">
                                    <td className="px-3 py-2 text-xs font-semibold text-white/70">{row.level}</td>
                                    <td className="px-3 py-2">{renderChargeValue(row.value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
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

            <TraitChargesPreview trait={trait} />

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
    const [data, setData] = React.useState<unknown>(null)
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
                    const parentData = json as SubclassParentData
                    const match = /^subclass:([^:]+):(.+)$/.exec(entityId)
                    const subclassId = match?.[2]
                    const subclass = parentData.subclasses?.find((sub) => String(sub._id || sub.name) === subclassId) || null
                    setData({ parentClass: parentData, subclass })
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
                return <RulePreview rule={data as Reference} />
            case "Habilidade":
                return <TraitPreview trait={data as Trait} />
            case "Talento":
                return <FeatPreview feat={data as Feat} />
            case "Magia":
                return <SpellPreview spell={data as Spell} />
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
