"use client"

import { Dices, Swords, RotateCcw } from "lucide-react"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { cn } from "@/core/utils"
import type { NpcParam } from "../types/monsters.types"

export function NpcParamPreview({ param, compact = false }: { param: NpcParam; compact?: boolean }) {
    return (
        <div className={cn("rounded-lg border border-white/10 bg-white/[0.03] p-3", compact && "p-2")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-white/85">{param.label}</h4>
                <div className="flex flex-wrap gap-1.5">
                    {param.attackRoll !== undefined && (
                        <span className="inline-flex items-center gap-1 rounded border border-red-400/20 bg-red-400/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                            <Swords className="h-3 w-3" />
                            {param.attackRoll >= 0 ? `+${param.attackRoll}` : param.attackRoll}
                        </span>
                    )}
                    {param.hitRoll && (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                            <Dices className="h-3 w-3" />
                            {param.hitRoll}
                        </span>
                    )}
                    {(param.recharge || param.usage) && (
                        <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/50">
                            <RotateCcw className="h-3 w-3" />
                            {param.recharge || param.usage}
                        </span>
                    )}
                </div>
            </div>
            <MentionContent html={param.description} mode="block" className="mt-2 text-sm text-white/75 [&_p]:text-sm [&_p]:text-white/75 [&_p]:leading-relaxed" />
        </div>
    )
}
