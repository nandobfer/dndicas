"use client"

import * as React from "react"
import { motion, useDragControls, AnimatePresence } from "framer-motion"
import { X, GripHorizontal, Maximize2, Minus } from "lucide-react"
import { GlassCard, GlassCardContent } from "./glass-card"
import { cn } from "@/core/utils"
import { renderEntity } from "@/features/rules/components/entity-renderers"

interface GlassWindowProps {
    id: string
    title: string
    children?: React.ReactNode
    onClose: () => void
    onFocus: () => void
    onMinimize: () => void
    onPositionChange?: (position: { x: number, y: number }) => void
    zIndex: number
    item?: any
    entityType?: string
    initialPosition?: { x: number, y: number }
    isMinimized?: boolean
}

export function GlassWindow({ 
    id, 
    title, 
    children, 
    onClose, 
    onFocus, 
    onMinimize,
    onPositionChange,
    zIndex, 
    item, 
    entityType, 
    initialPosition,
    isMinimized = false
}: GlassWindowProps) {
    const dragControls = useDragControls()
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [pos, setPos] = React.useState({ 
        x: initialPosition?.x ?? 50, 
        y: initialPosition?.y ?? 50 
    })
    
    // Sync local state when initialPosition changes externally (e.g. multi-tasking windows)
    React.useEffect(() => {
        if (initialPosition) {
            setPos(initialPosition)
        }
    }, [initialPosition])

    const [size, setSize] = React.useState<{ width: number | string, height: number | string }>({ 
        width: isMinimized ? 200 : "auto", 
        height: isMinimized ? "auto" : "auto" 
    })
    const [isResizing, setIsResizing] = React.useState(false)
    // Constraints logic
    const [constraints, setConstraints] = React.useState<{ left: number; right: number; top: number; bottom: number }>({
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    })

    const updateConstraints = React.useCallback(() => {
        if (typeof window === "undefined") return

        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const edgeThreshold = 100
        const sidebarWidth = 72 // Minimum sidebar width when collapsed

        // The handler (header) must stay within vertical limits (top 0 to bottom viewportHeight - headerHeight)
        // Horizontally, the left limit is sidebarWidth, and right is viewportWidth - edgeThreshold
        setConstraints({
            left: sidebarWidth, 
            right: viewportWidth - edgeThreshold,
            top: 0,
            bottom: viewportHeight - 40, // 40px is approximate header height
        })
    }, [])

    React.useEffect(() => {
        updateConstraints()
        window.addEventListener("resize", updateConstraints)
        return () => window.removeEventListener("resize", updateConstraints)
    }, [updateConstraints])
    const handleResize = (e: React.PointerEvent) => {
        e.stopPropagation()
        e.preventDefault() // Prevent text selection
        setIsResizing(true)
        onFocus()

        // Add class to body to prevent selection globally during resize
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'nwse-resize'

        const startX = e.clientX
        const startY = e.clientY
        
        // Get current pixel size if auto
        const rect = containerRef.current?.parentElement?.parentElement?.getBoundingClientRect()
        const startWidth = rect?.width || 450
        const startHeight = rect?.height || 300

        const onPointerMove = (moveEvent: PointerEvent) => {
            const newWidth = Math.max(150, startWidth + (moveEvent.clientX - startX))
            const newHeight = Math.max(100, startHeight + (moveEvent.clientY - startY))
            setSize({ width: newWidth, height: newHeight })
        }

        const onPointerUp = () => {
            setIsResizing(false)
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
            document.removeEventListener("pointermove", onPointerMove)
            document.removeEventListener("pointerup", onPointerUp)
        }

        document.addEventListener("pointermove", onPointerMove)
        document.addEventListener("pointerup", onPointerUp)
    }

    return (
        <motion.div
            drag={!isMinimized}
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={constraints}
            dragElastic={0}
            onDragStart={() => {
                onFocus()
                document.body.style.userSelect = "none"
            }}
            onDragEnd={(e, info) => {
                document.body.style.userSelect = ""
                
                // Calculate final position relative to total offset since drag start
                const finalX = pos.x + info.offset.x
                const finalY = pos.y + info.offset.y
                const finalPos = { x: finalX, y: finalY }

                setPos(finalPos) // Update local UI
                if (!isMinimized && onPositionChange) {
                    onPositionChange(finalPos) // Persist in context
                }
            }}
            initial={isMinimized ? false : { 
                scale: 0, 
                opacity: 0, 
                x: pos.x, 
                y: pos.y 
            }}
            animate={isMinimized ? { 
                scale: 1, 
                opacity: 1,
                x: 0,
                y: 0,
                width: "auto",
                height: "auto",
                position: "static" as any
            } : { 
                scale: 1, 
                opacity: 1,
                width: size.width,
                height: size.height,
                x: pos.x,
                y: pos.y
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 30 
            }}
            style={{ 
                zIndex, 
                position: isMinimized ? "static" : "absolute",
                maxWidth: isMinimized ? "fit-content" : "90vw",
                maxHeight: isMinimized ? "40px" : "90vh",
                pointerEvents: "auto",
                userSelect: isResizing ? 'none' : 'auto'
            }}
            onPointerDown={onFocus}
            className={cn("group", isMinimized && "relative min-w-[120px]")}
        >
            <GlassCard className={cn(
                "h-full border-white/20 shadow-2xl backdrop-blur-xl bg-black/40 flex flex-col overflow-hidden select-none active:select-none",
                isMinimized ? "h-10 w-auto inline-flex" : "w-full"
            )}>
                {/* Header/Drag Handle */}
                <div 
                    onPointerDown={(e) => {
                        if (isMinimized) return
                        e.preventDefault() // Prevent focus/selection triggers
                        dragControls.start(e)
                    }}
                    className={cn(
                        "flex items-center justify-between p-2 pl-4 border-b border-white/10 shrink-0 select-none bg-white/5",
                        !isMinimized ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                    )}
                >
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <GripHorizontal className={cn("w-4 h-4 text-white/20", isMinimized && "hidden")} />
                        <span className="text-[10px] font-bold text-white/60 truncate uppercase tracking-widest leading-none pt-0.5">{title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onMinimize();
                            }}
                            className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        >
                            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className="p-1 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {!isMinimized && (
                    <div 
                        ref={containerRef}
                        className="p-4 flex-1 overflow-y-auto glass-scrollbar pointer-events-auto"
                    >
                        <div onPointerDown={(e) => e.stopPropagation()}>
                            {item && entityType ? renderEntity(item, entityType) : children}
                        </div>
                    </div>
                )}

                {/* Resize Handle */}
                {!isMinimized && (
                    <div 
                        className="absolute bottom-1 right-1 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 z-50 group-hover:opacity-100 transition-opacity"
                        onPointerDown={handleResize}
                    >
                        <div className="w-3 h-3 border-r-2 border-b-2 border-white/30 rounded-br-sm" />
                    </div>
                )}
            </GlassCard>
        </motion.div>
    )
}

