/**
 * @fileoverview Background preview component for lists and tables.
 * Displays a summarized view of the background using shared UI patterns.
 */

"use client";

import * as React from "react";
import { ShieldCheck, ScrollText, Package, Sparkle, Info, BookOpen, Star, Zap, GraduationCap, Sword } from "lucide-react"
import { cn } from "@/core/utils"
import { Chip } from "@/components/ui/chip"
import { EntityTitleLink } from "@/features/rules/components/entity-title-link"
import { GlassAttributeChip } from "@/components/ui/glass-attribute-chip"
import { AttributeType, entityColors, attributeColors } from "@/lib/config/colors"
import type { Background } from "../types/backgrounds.types"
import { MentionContent } from "@/features/rules/components/mention-badge";
import { ENTITY_RENDERERS } from "@/features/rules/components/entity-renderers"
import { EntitySource } from "@/features/rules/components/entity-source"

interface BackgroundPreviewProps {
    background: Background
    showStatus?: boolean
    className?: string
}

const SKILL_TO_ATTR: Record<string, string> = {
    Atletismo: "Força",
    Acrobacia: "Destreza",
    Furtividade: "Destreza",
    Prestidigitação: "Destreza",
    Arcanismo: "Inteligência",
    História: "Inteligência",
    Investigação: "Inteligência",
    Natureza: "Inteligência",
    Religião: "Inteligência",
    "Lidar com Animais": "Sabedoria",
    Intuição: "Sabedoria",
    Medicina: "Sabedoria",
    Percepção: "Sabedoria",
    Sobrevivência: "Sabedoria",
    Enganação: "Carisma",
    Intimidação: "Carisma",
    Atuação: "Carisma",
    Persuasão: "Carisma",
}

function BackgroundVisualHeader({ image, name, description }: { image?: string; name: string; description: string }) {
    return (
        <div className="flex flex-col md:flex-row gap-4 py-3 border-y border-white/5">
            <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Info className="h-3 w-3" />
                    <span>Descrição</span>
                </div>
                <div className="text-sm text-white/80 leading-relaxed pr-2">
                    <MentionContent html={description} mode="block" className="[&_p]:text-sm [&_p]:text-white/80 [&_ul]:text-sm [&_ol]:text-sm [&_p]:leading-relaxed" />
                </div>
            </div>
            {image && (
                <div className="w-full md:w-2/5 shrink-0">
                    <div className="aspect-square rounded-xl bg-white/5 overflow-hidden shadow-2xl group/image relative bg-[image:var(--background-image-paper-texture)] bg-cover bg-center">
                        <img src={image} alt={name} className="w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-110 mix-blend-multiply" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />
                    </div>
                </div>
            )}
        </div>
    )
}

export function BackgroundPreview({ background, showStatus = true, className }: BackgroundPreviewProps) {
    if (!background) return null

    // Debug to check data flow
    console.log("[BackgroundPreview] rendering:", { name: background.name, featId: background.featId })

    return (
        <div className={cn("space-y-4 w-full text-left", className)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            "p-1.5 rounded-lg border",
                            entityColors.Origem?.badge || "bg-blue-500/10",
                            entityColors.Origem?.border || "border-blue-500/20"
                        )}
                    >
                        <ShieldCheck className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <EntityTitleLink name={background.name} entityType="Origem" />
                        </div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">Origem D&D 5e</p>
                    </div>
                </div>
                {showStatus && background.status === "inactive" && (
                    <Chip variant="common" size="sm" className="opacity-50">
                        Inativa
                    </Chip>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4 pb-2 border-b border-white/5">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        <Star className="h-3 w-3" />
                        <span>Bônus de Atributo</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {(background.suggestedAttributes || []).map((attr) => (
                            <GlassAttributeChip key={attr} attribute={attr as AttributeType} size="sm" showFull />
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-2 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <BackgroundSword className="h-3 w-3" />
                    <span>Proficiência nas Perícias</span>
                </div>
                <div className="space-y-2">
                    {(background.skillProficiencies || []).length > 0 ? (
                        background.skillProficiencies.map((skill) => {
                            const attr = SKILL_TO_ATTR[skill] || "Sabedoria"
                            const config = attributeColors[attr as keyof typeof attributeColors]
                            return (
                                <div
                                    key={skill}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-medium transition-all group/chip mr-1.5 mb-1.5",
                                        config.bgAlpha,
                                        config.border,
                                        config.text
                                    )}
                                >
                                    <span className="opacity-70 group-hover/chip:opacity-100">{skill}</span>
                                    <span className="text-[8px] font-bold px-1 rounded bg-black/20 border border-white/5 opacity-50 uppercase">
                                        {config.abbreviation}
                                    </span>
                                </div>
                            )
                        })
                    ) : (
                        <span className="text-[10px] text-white/20 italic">Nenhuma perícia selecionada</span>
                    )}
                </div>
            </div>

            <BackgroundVisualHeader name={background.name} description={background.description} image={background.image} />

            <div className="space-y-3 pb-2 border-b border-white/5">
                {background.featId && (
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                            <Star className="h-3 w-3 text-amber-400" />
                            <span>Talento de Origem</span>
                        </div>
                        <div className="rounded-xl border border-white/10 overflow-hidden group/item transition-all bg-white/[0.02] hover:bg-white/[0.05]">
                            {ENTITY_RENDERERS.Talento(background.featId, { hideStatusChip: true })}
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-4 pt-2 border-b border-white/5 pb-6">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <BackgroundZap className="h-3 w-3 text-blue-400" />
                    <span>Habilidades de Origem</span>
                </div>

                <div className="space-y-3">
                    {(background.traits || []).length > 0 ? (
                        (background.traits || []).map((trait, idx) => (
                            <div
                                key={trait._id || idx}
                                className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden hover:bg-white/[0.05] transition-all"
                            >
                                {ENTITY_RENDERERS.Habilidade(trait, { hideStatusChip: true })}
                            </div>
                        ))
                    ) : (
                        <div className="py-8 text-center bg-black/20 rounded-xl border border-dashed border-white/5 flex flex-col items-center justify-center gap-2">
                            <Sparkle className="h-5 w-5 text-white/10" />
                            <span className="text-xs text-white/20 italic">Nenhuma característica extra configurada</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <Package className="h-3 w-3" />
                    <span>Equipamento Inicial</span>
                </div>
                <div className="p-4 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 bg-white/[0.01]">
                    <Package className="h-4 w-4 text-white/10" />
                    <span className="text-[10px] text-white/20 uppercase font-bold tracking-widest italic">Inventory system coming soon</span>
                </div>
            </div>

            <EntitySource source={background.source} />
        </div>
    )
}

function BackgroundSword({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
            <line x1="13" y1="19" x2="19" y2="13" />
            <line x1="16" y1="16" x2="20" y2="20" />
            <line x1="19" y1="21" x2="20" y2="20" />
            <line x1="14.5" y1="17.5" x2="18" y2="21" />
        </svg>
    )
}

function BackgroundZap({ className, style }: { className?: string; style?: React.CSSProperties }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            style={style}
        >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
    )
}
