"use client"

import { useCallback, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/core/utils"
import { GlassBackdrop } from "@/components/ui/glass-backdrop"

interface PointerTooltipProps {
    content: React.ReactNode
    children: React.ReactNode
    className?: string
}

export function PointerTooltip({ content, children, className }: PointerTooltipProps) {
    const [visible, setVisible] = useState(false)
    const [pos, setPos] = useState({ x: 0, y: 0 })

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        setPos({ x: e.clientX, y: e.clientY })
    }, [])

    return (
        <span
            className={cn("inline-flex", className)}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            onMouseMove={handleMouseMove}
        >
            {children}
            {visible && typeof document !== "undefined" && createPortal(
                <div
                    style={{ position: "fixed", left: pos.x + 14, top: pos.y + 14, zIndex: 9999 }}
                    className="pointer-events-none rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-sm"
                >
                    <GlassBackdrop />
                    <div className="relative z-10 whitespace-nowrap">{content}</div>
                </div>,
                document.body
            )}
        </span>
    )
}
