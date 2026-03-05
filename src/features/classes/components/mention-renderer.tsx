"use client";

import React, { useMemo } from "react";
import { Zap, ExternalLink } from "lucide-react"
import { motion } from "framer-motion"
import { useWindows } from "@/core/context/window-context"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { ENTITY_RENDERERS } from "@/features/rules/components/entity-renderers"

interface MentionRendererProps {
    item: {
        description: string
        _id?: string
        [key: string]: any
    }
    color?: string
    icon?: React.ReactNode
    hideStatusChip?: boolean
}

export function MentionRenderer({ item, color, icon, hideStatusChip = false }: MentionRendererProps) {
    const { addWindow } = useWindows()
    const mention = useMemo(() => {
        // Se o item já tiver um ID e um nome, e não tiver uma descrição rica,
        // podemos assumir que ele é uma referência direta a uma entidade (como Magia)
        if ((item._id || item.id) && item.name && !item.description) {
            return {
                id: item._id || item.id,
                type: "Magia", // Se vier de spells[], é Magia. Se vier de traits[], o item tem description.
            }
        }

        if (!item.description) return null

        const parser = new DOMParser()
        const doc = parser.parseFromString(item.description, "text/html")
        const link = doc.querySelector('span[data-type="mention"]')

        if (link) {
            return {
                id: link.getAttribute("data-id") || "",
                type: link.getAttribute("data-entity-type") || "Regra",
            }
        }

        const match = item.description.match(/@\[([^\]]+)\]\(([^)]+)\)/)
        if (match) {
            const parts = match[2].split(":")
            const typeMap: Record<string, string> = {
                traits: "Habilidade",
                rules: "Regra",
                feats: "Talento",
                spells: "Magia",
                classes: "Classe",
            }
            return {
                id: parts[1] || parts[0],
                type: typeMap[parts[0]] || parts[0],
            }
        }

        return null
    }, [item.description])

    if (mention) {
        const type = mention.type
        const renderer = ENTITY_RENDERERS[type]

        if (renderer) {
            // Se for Magia, passamos o objeto com ID.
            // O renderer de Magia usa useQuery para buscar.
            const renderData = type === "Habilidade" ? mention.id : { _id: mention.id }

            return (
                <div
                    className="rounded-xl border border-white/10 overflow-hidden group/item transition-all"
                    style={{
                        borderColor: color ? `${color}40` : undefined,
                        backgroundColor: color ? `${color}05` : undefined,
                    }}
                >
                    {renderer(renderData, { hideStatusChip })}
                </div>
            )
        }
    }

    return (
        <div
            className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 group/item hover:bg-white/[0.06] transition-all"
            style={{
                borderColor: color ? `${color}40` : undefined,
                backgroundColor: color ? `${color}05` : undefined,
            }}
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                    {icon || <Zap className="h-3 w-3" style={{ color: color || "#f59e0b" }} />}
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() =>
                            addWindow({
                                title: item.name || "Item",
                                content: null,
                                item: item,
                                entityType: "Magia", // Defaulting to Magia for spell lists
                            })
                        }
                        className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                        title="Abrir em nova janela"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </motion.button>
                </div>
                <MentionContent html={item.description} mode="block" className="[&_p]:text-[13px] [&_p]:text-white/80 [&_p]:leading-relaxed [&_ul]:my-1 [&_li]:text-[13px]" />
            </div>
        </div>
    )
}
