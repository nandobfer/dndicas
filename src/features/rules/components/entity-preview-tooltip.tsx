"use client"

import * as React from "react"
import { GlassCard } from "@/components/ui/glass-card"
import { Chip } from "@/components/ui/chip"
import { ScrollText, BookOpen, Quote, Sparkles } from "lucide-react"
import { cn } from "@/core/utils"
import { entityColors } from "@/lib/config/colors"
import { Reference } from "../types/rules.types"
import { SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { MentionContent } from "./mention-badge"
import { GlassPopover, GlassPopoverTrigger, GlassPopoverContent } from "@/components/ui/glass-popover"

interface RulePreviewProps {
    rule: Reference
}

const RulePreview = ({ rule }: RulePreviewProps) => {
    return (
        <div className="space-y-4 min-w-[400px] max-w-[650px]">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Regra.badge)}>
                        <ScrollText className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-white leading-tight">{rule.name}</h4>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Regra do Sistema</p>
                    </div>
                </div>
                <Chip variant={rule.status === "active" ? "uncommon" : "common"} size="sm">
                    {rule.status === "active" ? "Ativa" : "Inativa"}
                </Chip>
            </div>

            {rule.description && (
                <div className="relative">
                    <Quote className="absolute -top-1 -left-1 w-8 h-8 text-white/5 -z-10" />
                    <div className="text-xs text-white/70 pl-4 border-l border-white/10 py-1">
                        <MentionContent html={rule.description} mode="block" />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4 pt-2 border-t border-white/5 text-[10px] font-medium text-white/40">
                <div className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    <span>
                        Fonte: <span className="text-white/60">{rule.source}</span>
                    </span>
                </div>
            </div>
        </div>
    )
}

/**
 * T041: Added Trait preview component for Habilidade entity type.
 */
interface TraitPreviewProps {
    trait: any // Trait type from features/traits
}

const TraitPreview = ({ trait }: TraitPreviewProps) => {
    return (
        <div className="space-y-4 min-w-[400px] max-w-[650px]">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg border", entityColors.Habilidade.badge)}>
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-white leading-tight">{trait.name}</h4>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Habilidade D&D</p>
                    </div>
                </div>
                <Chip variant={trait.status === "active" ? "uncommon" : "common"} size="sm">
                    {trait.status === "active" ? "Ativa" : "Inativa"}
                </Chip>
            </div>

            {trait.description && (
                <div className="relative">
                    <Quote className="absolute -top-1 -left-1 w-8 h-8 text-white/5 -z-10" />
                    <div className="text-xs text-white/70 pl-4 border-l border-white/10 py-1">
                        <MentionContent html={trait.description} mode="block" />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4 pt-2 border-t border-white/5 text-[10px] font-medium text-white/40">
                <div className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    <span>
                        Fonte: <span className="text-white/60">{trait.source}</span>
                    </span>
                </div>
            </div>
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
            // T041: Updated endpoint logic to support Habilidade via /api/traits
            let endpoint = `/api/core/${entityType.toLowerCase()}/${entityId}`
            if (entityType === "Regra") {
                endpoint = `/api/rules/${entityId}`
            } else if (entityType === "Habilidade") {
                endpoint = `/api/traits/${entityId}`
            }

            const res = await fetch(endpoint)
            if (res.ok) {
                const json = await res.json()
                setData(json)
            }
        } catch (e) {
            console.error("Failed to fetch entity preview:", e)
        } finally {
            setLoading(false)
        }
    }, [entityId, entityType, data, loading])

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
            setOpen(true)
            fetchData()
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
            <GlassPopoverContent side={side} className="w-auto p-4 max-w-none" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onOpenAutoFocus={(e) => e.preventDefault()}>
                {content}
            </GlassPopoverContent>
        </GlassPopover>
    )
}
