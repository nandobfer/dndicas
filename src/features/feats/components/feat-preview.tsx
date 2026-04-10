"use client";

import { Zap, BookOpen, Info, Trophy, PlusCircle, ExternalLink, Tag } from "lucide-react"
import { Chip } from "@/components/ui/chip"
import { motion } from "framer-motion"
import { useWindows } from "@/core/context/window-context"
import { MentionContent, EntityTitleLink } from "@/features/rules/components/mention-badge"
import { getLevelRarityVariant } from "./feats-table"
import { attributeColors, AttributeType, featCategoryColors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { Feat } from "../types/feats.types"
import type { FeatCategoryColorKey } from "@/lib/config/colors"
import { EntitySource } from "@/features/rules/components/entity-source"

export interface FeatPreviewProps {
    feat: Feat
    showStatus?: boolean
}

export function FeatPreview({ feat, showStatus = true, hideStatusChip = false, hideActionIcons = false }: FeatPreviewProps & { hideStatusChip?: boolean; hideActionIcons?: boolean }) {
    const rarityVariant = getLevelRarityVariant(feat.level)
    const { addWindow } = useWindows()

    return (
        <div className="space-y-4 w-full">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10">
                        <Zap className="h-4 w-4 text-amber-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <EntityTitleLink name={feat.name} entityType="Talento" />
                            <Chip variant={rarityVariant} size="sm">
                                Nv. {feat.level}
                            </Chip>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] uppercase font-bold tracking-widest text-white/40">Talento de Personagem</p>
                            {feat.category && (() => {
                                const config = featCategoryColors[feat.category as FeatCategoryColorKey]
                                return (
                                    <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded border", config.bgAlpha, config.border)}>
                                        <Tag className={cn("h-2.5 w-2.5", config.text)} />
                                        <span className={cn("text-[9px] uppercase font-bold tracking-widest", config.text)}>{feat.category}</span>
                                    </div>
                                )
                            })()}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!hideActionIcons && (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() =>
                                addWindow({
                                    title: feat.name || "Talento",
                                    content: null,
                                    item: feat,
                                    entityType: "Talento",
                                })
                            }
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            title="Abrir em nova janela"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </motion.button>
                    )}
                    {showStatus && !hideStatusChip && feat.status === "inactive" && (
                        <div className="flex flex-col items-end">
                            <Chip variant="common" size="sm" className="opacity-50">
                                Inativo
                            </Chip>
                        </div>
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
                <div className="text-sm text-white/80 leading-relaxed break-words">
                    <MentionContent html={feat.description} mode="block" className="[&_p]:text-sm [&_p]:text-white/80 [&_ul]:text-sm [&_ol]:text-sm" />
                </div>
            </div>

            {/* Source */}
            <EntitySource source={feat.source} originalName={feat.originalName} />
        </div>
    )
}
