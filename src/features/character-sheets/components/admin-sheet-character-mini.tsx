"use client"

import { ScrollText } from "lucide-react"
import { cn } from "@/core/utils"
import { GlassImage } from "@/components/ui/glass-image"

interface AdminSheetCharacterMiniProps {
    name: string
    photo?: string | null
    level?: number | null
    size?: "sm" | "md"
}

function formatLevel(level?: number | null): string {
    return level != null ? `Nível ${level}` : "Nível —"
}

export function AdminSheetCharacterMini({ name, photo, level, size = "md" }: AdminSheetCharacterMiniProps) {
    return (
        <div className="flex items-center gap-3 min-w-0">
            <div
                className="flex-shrink-0"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
            >
                {photo ? (
                    <GlassImage
                        src={photo}
                        alt={`Foto de ${name}`}
                        className={cn(
                            "overflow-hidden rounded-2xl shadow-none",
                            size === "md" ? "h-11 w-11" : "h-9 w-9"
                        )}
                        imageClassName="object-cover mix-blend-normal"
                        showOverlay={false}
                        dialogClassName="max-w-4xl"
                        expandLabel={`Abrir foto ampliada de ${name}`}
                    />
                ) : (
                    <div
                        className={cn(
                            "rounded-2xl border border-dashed border-white/15 bg-white/[0.04] text-white/50 flex items-center justify-center",
                            size === "md" ? "h-11 w-11" : "h-9 w-9",
                        )}
                        data-avatar-ready="false"
                        aria-hidden="true"
                    >
                        <ScrollText className={size === "md" ? "h-5 w-5" : "h-4 w-4"} />
                    </div>
                )}
            </div>
            <div className="min-w-0">
                <span className={cn("font-semibold text-white truncate block", size === "md" ? "text-sm" : "text-xs")}>{name}</span>
                <span className="text-[11px] text-white/35 uppercase tracking-[0.2em]">{formatLevel(level)}</span>
            </div>
        </div>
    )
}
