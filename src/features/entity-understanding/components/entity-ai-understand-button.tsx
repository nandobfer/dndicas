"use client"

import type { MouseEvent } from "react"
import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"
import { cn } from "@/core/utils"
import { GlassTooltipProvider, SimpleGlassTooltip } from "@/components/ui/glass-tooltip"
import { useWindows } from "@/core/context/window-context"
import { EntityAIChatWindowContent } from "./entity-ai-chat-window-content"

interface EntityAIUnderstandButtonProps {
    entity: unknown
    entityId: string
    entityType: string
    entityName: string
    className?: string
}

const buildEntityUnderstandingWindowId = (entityType: string, entityId: string) =>
    `entity-understanding:${entityType}:${entityId}`

export function EntityAIUnderstandButton({ entity, entityId, entityType, entityName, className }: EntityAIUnderstandButtonProps) {
    const { addWindow } = useWindows()

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()

        addWindow({
            id: buildEntityUnderstandingWindowId(entityType, entityId),
            title: `Entender com IA: ${entityName || entityType}`,
            content: (
                <EntityAIChatWindowContent
                    entity={entity}
                    entityId={entityId}
                    entityType={entityType}
                    entityName={entityName}
                />
            ),
            initialSize: { width: "min(520px, 92vw)", height: "min(640px, 82vh)" },
            minSize: { width: 360, height: 420 },
        })
    }

    return (
        <GlassTooltipProvider>
            <SimpleGlassTooltip content="Entender com IA" side="top" className="z-[10000]">
                <motion.button
                    type="button"
                    onClick={handleClick}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    className={cn(
                        "group relative h-7 w-7 rounded-lg p-[1.5px] shadow-lg shadow-blue-500/10",
                        "bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 bg-[length:200%_auto] animate-gradient",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500/40",
                        className,
                    )}
                    aria-label={`Entender ${entityName} com IA`}
                >
                    <span className="grid h-full w-full place-items-center rounded-[7px] bg-black/40 backdrop-blur-[4px] transition-colors group-hover:bg-slate-900/40">
                        <Sparkles className="h-3.5 w-3.5 text-blue-400 transition-colors group-hover:text-white" />
                    </span>
                </motion.button>
            </SimpleGlassTooltip>
        </GlassTooltipProvider>
    )
}
