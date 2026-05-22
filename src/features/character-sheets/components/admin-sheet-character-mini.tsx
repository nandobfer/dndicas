"use client"

import { ScrollText } from "lucide-react"
import { cn } from "@/core/utils"

interface AdminSheetCharacterMiniProps {
    name: string
    photo?: string | null
    size?: "sm" | "md"
}

export function AdminSheetCharacterMini({ name, photo: _photo, size = "md" }: AdminSheetCharacterMiniProps) {
    return (
        <div className="flex items-center gap-3 min-w-0">
            <div
                className={cn(
                    "flex-shrink-0 rounded-2xl border border-dashed border-white/15 bg-white/[0.04] text-white/50 flex items-center justify-center",
                    size === "md" ? "h-11 w-11" : "h-9 w-9",
                )}
                data-avatar-ready={_photo ? "true" : "false"}
                aria-hidden="true"
            >
                <ScrollText className={size === "md" ? "h-5 w-5" : "h-4 w-4"} />
            </div>
            <div className="min-w-0">
                <span className={cn("font-semibold text-white truncate block", size === "md" ? "text-sm" : "text-xs")}>{name}</span>
                <span className="text-[11px] text-white/35 uppercase tracking-[0.2em]">Avatar pendente</span>
            </div>
        </div>
    )
}
