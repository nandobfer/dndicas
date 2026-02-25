"use client";

import { Zap, BookOpen, Info, Trophy, PlusCircle } from "lucide-react"
import { Chip } from "@/components/ui/chip"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { getLevelRarityVariant } from "./feats-table"
import { attributeColors, AttributeType } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { Feat } from "../types/feats.types"

export interface FeatPreviewProps {
    feat: Feat
}

export function FeatPreview({ feat }: FeatPreviewProps) {
    const rarityVariant = getLevelRarityVariant(feat.level)

    return (
        <div className="space-y-4 min-w-[320px] max-w-[500px]">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10">
                        <Zap className="h-4 w-4 text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white leading-tight">{feat.name}</h3>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Talento de Personagem</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <Chip variant={rarityVariant} size="sm">
                        Nv. {feat.level}
                    </Chip>
                    {feat.status === "inactive" && (
                        <Chip variant="common" size="sm" className="opacity-50">
                            Inativo
                        </Chip>
                    )}
                </div>
            </div>

            {/* Prerequisites */}
            {feat.prerequisites && feat.prerequisites.length > 0 && (
                <div className="space-y-2 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Trophy className="h-3 w-3" />
                        <span>Requisitos</span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        {feat.prerequisites.map((prereq, index) => (
                            <div key={index} className="inline-flex items-center min-h-[24px] px-1 py-0.5 rounded-md bg-white/5 border border-white/10 text-[12px] text-white/80">
                                <MentionContent html={prereq} mode="inline" className="[&_p]:inline [&_p]:m-0 align-middle" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Attribute Bonuses */}
            {feat.attributeBonuses && feat.attributeBonuses.length > 0 && (
                <div className="space-y-2 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <PlusCircle className="h-3 w-3" />
                        <span>Bônus de Atributo</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {feat.attributeBonuses.map((bonus, index) => {
                            const config = attributeColors[bonus.attribute as AttributeType]
                            return (
                                <div key={index} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border", config?.bgAlpha || "bg-white/5", config?.border || "border-white/10")}>
                                    <span className={cn("text-xs font-bold", config?.text || "text-white")}>{bonus.attribute}</span>
                                    <div className="h-4 w-[1px] bg-white/10" />
                                    <span className="text-xs font-black text-white">+{bonus.value}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Description */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Info className="h-3 w-3" />
                    <span>Descrição</span>
                </div>
                <div className="text-sm text-white/80 leading-relaxed">
                    <MentionContent html={feat.description} mode="block" className="[&_p]:text-sm [&_p]:text-white/80 [&_ul]:text-sm [&_ol]:text-sm" />
                </div>
            </div>

            {/* Source */}
            <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-white/40">
                <BookOpen className="h-3.5 w-3.5" />
                <span>Fonte: {feat.source}</span>
            </div>
        </div>
    )
}
