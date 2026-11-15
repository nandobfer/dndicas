"use client"

import * as React from "react"
import { motion, useDragControls } from "framer-motion"
import { X, GripHorizontal, Maximize2, Minus } from "lucide-react"
import { GlassCard } from "./glass-card"
import { cn } from "@/core/utils"
import { renderEntity } from "@/features/rules/components/entity-renderers"
import type { EntityRenderOptions } from "@/features/rules/components/entity-renderers"
import {
    HEADER_FALLBACK_HEIGHT,
    clampWindowPosition,
    getHeaderBottom,
    getMaxWindowHeight,
    getWindowDragBounds,
    type WindowDragBounds,
} from "./glass-window-bounds"

const MOBILE_BREAKPOINT = 768
const MOBILE_MARGIN = 12
const MOBILE_HEADER_HEIGHT = 64
const MOBILE_TOP_MARGIN = MOBILE_HEADER_HEIGHT + MOBILE_MARGIN

interface GlassWindowProps {
    id: string
    title: string
    children?: React.ReactNode
    onClose: () => void
    onFocus: () => void
    onMinimize: () => void
    onPositionChange?: (position: { x: number, y: number }) => void
    zIndex: number
    item?: unknown
    entityType?: string
    renderOptions?: EntityRenderOptions
    initialPosition?: { x: number, y: number }
    isMinimized?: boolean
    initialSize?: { width: number | string, height: number | string }
    minSize?: { width: number, height: number }
}

export function GlassWindow({ 
    title, 
    children, 
    onClose, 
    onFocus, 
    onMinimize,
    onPositionChange,
    zIndex, 
    item, 
    entityType, 
    renderOptions,
    initialPosition,
    isMinimized = false,
    initialSize,
    minSize
}: GlassWindowProps) {
    const dragControls = useDragControls()
    const windowRef = React.useRef<HTMLDivElement>(null)
    const [isMobile, setIsMobile] = React.useState(() => (
        typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
    ))
    // Limites medidos: X de 0 até (tela − largura real da janela); Y travado no fim do header.
    const [bounds, setBounds] = React.useState<WindowDragBounds>(() => getWindowDragBounds({
        viewportWidth: typeof window === "undefined" ? 0 : window.innerWidth,
        windowWidth: 0,
        headerBottom: HEADER_FALLBACK_HEIGHT,
    }))
    const boundsRef = React.useRef(bounds)
    boundsRef.current = bounds
    const normalizeDesktopPosition = React.useCallback(
        (position: { x: number, y: number }) => clampWindowPosition(position, boundsRef.current),
        []
    )
    const [pos, setPos] = React.useState(() => clampWindowPosition(
        { x: initialPosition?.x ?? 0, y: 0 },
        bounds
    ))
    const posRef = React.useRef(pos)
    posRef.current = pos
    const onPositionChangeRef = React.useRef(onPositionChange)
    onPositionChangeRef.current = onPositionChange

    React.useEffect(() => {
        if (typeof window === "undefined") return

        const updateViewportMode = () => {
            setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
        }

        window.addEventListener("resize", updateViewportMode)
        return () => window.removeEventListener("resize", updateViewportMode)
    }, [])
     
    // Sync local state when initialPosition changes externally (e.g. multi-tasking windows)
    React.useEffect(() => {
        if (!initialPosition) return

        const frame = window.requestAnimationFrame(() => {
            setPos(normalizeDesktopPosition(initialPosition))
        })

        return () => window.cancelAnimationFrame(frame)
    }, [initialPosition, normalizeDesktopPosition])

    const [size, setSize] = React.useState<{ width: number | string, height: number | string }>(() => ({ 
        width: isMinimized ? 200 : (initialSize?.width ?? "min(450px, 35vw)"), 
        height: isMinimized ? "auto" : (initialSize?.height ?? "min(400px, 40vh)") 
    }))
    const [isResizing, setIsResizing] = React.useState(false)
    const isMobileMinimized = isMinimized && isMobile
    const isDesktopWindow = !isMinimized && !isMobile

    const measureBounds = React.useCallback(() => {
        if (typeof window === "undefined") return
        // offsetWidth ignora o scale da animação de entrada; getBoundingClientRect mediria a janela encolhida.
        const next = getWindowDragBounds({
            viewportWidth: window.innerWidth,
            windowWidth: windowRef.current?.offsetWidth ?? 0,
            headerBottom: getHeaderBottom(),
        })
        setBounds((prev) => (
            prev.left === next.left && prev.right === next.right && prev.top === next.top && prev.bottom === next.bottom
                ? prev
                : next
        ))
    }, [])

    React.useLayoutEffect(() => {
        measureBounds()
    }, [measureBounds, isMobile, isMinimized])

    React.useEffect(() => {
        window.addEventListener("resize", measureBounds)
        const element = windowRef.current
        const observer = element && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measureBounds()) : null
        if (element) observer?.observe(element)
        return () => {
            window.removeEventListener("resize", measureBounds)
            observer?.disconnect()
        }
    }, [measureBounds])

    // A tela ou a janela mudou de tamanho: traz a janela de volta para dentro dos limites e grava a posição corrigida.
    React.useEffect(() => {
        if (!isDesktopWindow) return
        const current = posRef.current
        const next = clampWindowPosition(current, bounds)
        if (next.x === current.x && next.y === current.y) return
        setPos(next)
        onPositionChangeRef.current?.(next)
    }, [bounds, isDesktopWindow])
    const handleResize = (e: React.PointerEvent, corner: "br" | "bl" = "br") => {
        e.stopPropagation()
        e.preventDefault() // Prevent text selection
        setIsResizing(true)
        onFocus()

        // Add class to body to prevent selection globally during resize
        document.body.style.userSelect = 'none'
        document.body.style.cursor = corner === "bl" ? 'nesw-resize' : 'nwse-resize'

        const startX = e.clientX
        const startY = e.clientY
        const startPosX = pos.x
        let lastPosX = startPosX
        
        // offsetWidth/offsetHeight dão o tamanho real em px mesmo quando o tamanho é "auto" ou em vw/vh.
        const startWidth = windowRef.current?.offsetWidth || 450
        const startHeight = windowRef.current?.offsetHeight || 300
        const viewportWidth = window.innerWidth
        const maxHeight = Math.max(0, window.innerHeight - bounds.top)

        const onPointerMove = (moveEvent: PointerEvent) => {
            const minW = minSize?.width ?? 150
            const minH = minSize?.height ?? 100
            
            let newWidth = startWidth
            let newPosX = startPosX
            
            if (corner === "br") {
                // A borda direita não passa da tela.
                const maxWidth = Math.max(minW, viewportWidth - startPosX)
                newWidth = Math.max(minW, Math.min(startWidth + (moveEvent.clientX - startX), maxWidth))
            } else if (corner === "bl") {
                // A borda direita fica parada; a esquerda vai no máximo até x = 0 e a largura não fica abaixo do mínimo.
                const deltaX = Math.min(Math.max(moveEvent.clientX - startX, -startPosX), Math.max(0, startWidth - minW))
                newWidth = startWidth - deltaX
                newPosX = startPosX + deltaX
            }
            
            const newHeight = Math.max(minH, Math.min(startHeight + (moveEvent.clientY - startY), maxHeight))
            
            setSize({ width: newWidth, height: newHeight })
            if (corner === "bl") {
                lastPosX = newPosX
                setPos(prev => ({ ...prev, x: newPosX }))
            }
        }

        const onPointerUp = () => {
            setIsResizing(false)
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
            document.removeEventListener("pointermove", onPointerMove)
            document.removeEventListener("pointerup", onPointerUp)
            if (corner === "bl" && lastPosX !== startPosX) {
                onPositionChangeRef.current?.(clampWindowPosition({ x: lastPosX, y: 0 }, boundsRef.current))
            }
            measureBounds()
        }

        document.addEventListener("pointermove", onPointerMove)
        document.addEventListener("pointerup", onPointerUp)
    }

    return (
        <motion.div
            ref={windowRef}
            data-glass-window
            drag={isDesktopWindow ? "x" : false}
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={bounds}
            dragElastic={0}
            onDragStart={() => {
                onFocus()
                document.body.style.userSelect = "none"
            }}
            onDragEnd={(_, info) => {
                document.body.style.userSelect = ""
                if (isMobile) return
                
                // Só o X se move; o Y fica travado no fim do header.
                const finalPos = clampWindowPosition({ x: pos.x + info.offset.x, y: 0 }, bounds)

                setPos(finalPos) // Update local UI
                if (!isMinimized && onPositionChange) {
                    onPositionChange(finalPos) // Persist in context
                }
            }}
            initial={isMinimized ? false : { 
                scale: 0, 
                opacity: 0, 
                x: isMobile ? MOBILE_MARGIN : pos.x,
                y: isMobile ? MOBILE_TOP_MARGIN : bounds.top,
            }}
            animate={isMinimized ? { 
                scale: 1, 
                opacity: 1,
                x: 0,
                y: 0,
                width: "auto",
                height: "auto",
            } : { 
                scale: 1, 
                opacity: 1,
                width: isMobile ? `calc(100vw - ${MOBILE_MARGIN * 2}px)` : size.width,
                height: isMobile ? `calc(100dvh - ${MOBILE_TOP_MARGIN + MOBILE_MARGIN}px)` : size.height,
                x: isMobile ? MOBILE_MARGIN : pos.x,
                y: isMobile ? MOBILE_TOP_MARGIN : bounds.top,
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
                maxWidth: isMobileMinimized ? "150px" : isMinimized ? "fit-content" : isMobile ? `calc(100vw - ${MOBILE_MARGIN * 2}px)` : "90vw",
                maxHeight: isMobileMinimized ? "32px" : isMinimized ? "40px" : isMobile ? `calc(100dvh - ${MOBILE_TOP_MARGIN + MOBILE_MARGIN}px)` : getMaxWindowHeight(bounds.top),
                pointerEvents: "auto",
                userSelect: isResizing ? 'none' : 'auto'
            }}
            onPointerDown={onFocus}
            className={cn("group", isMinimized && (isMobile ? "relative min-w-0" : "relative min-w-[120px]"))}
        >
            <GlassCard className={cn(
                "h-full border-white/20 shadow-2xl backdrop-blur-xl bg-black/40 flex flex-col overflow-hidden select-none active:select-none",
                isMobileMinimized ? "h-8 w-auto max-w-[150px] inline-flex" : isMinimized ? "h-10 w-auto inline-flex" : "w-full"
            )}>
                {/* Header/Drag Handle */}
                <div 
                    onPointerDown={(e) => {
                        if (isMinimized || isMobile) return
                        e.preventDefault() // Prevent focus/selection triggers
                        dragControls.start(e)
                    }}
                    className={cn(
                        "flex items-center justify-between border-b border-white/10 shrink-0 select-none bg-white/5",
                        isMobileMinimized ? "h-8 gap-1 px-2 py-1" : "p-2 pl-4",
                        !isMinimized && !isMobile ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                    )}
                >
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <GripHorizontal className={cn("w-4 h-4 text-white/20", isMinimized && "hidden")} />
                        <span className={cn(
                            "text-[10px] font-bold text-white/60 truncate uppercase tracking-widest leading-none pt-0.5",
                            isMobileMinimized && "max-w-[64px] text-[9px] tracking-wide"
                        )}>{title}</span>
                    </div>
                    <div className={cn("flex items-center gap-1 shrink-0", isMobileMinimized ? "ml-0" : "ml-2")}>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onMinimize();
                            }}
                            className={cn(
                                "rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors",
                                isMobileMinimized ? "p-0.5" : "p-1"
                            )}
                        >
                            {isMinimized ? <Maximize2 className={cn(isMobileMinimized ? "w-3 h-3" : "w-3.5 h-3.5")} /> : <Minus className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className={cn(
                                "rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors",
                                isMobileMinimized ? "p-0.5" : "p-1"
                            )}
                        >
                            <X className={cn(isMobileMinimized ? "w-3 h-3" : "w-3.5 h-3.5")} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {!isMinimized && (
                    <div 
                        className="p-4 flex-1 overflow-y-auto glass-scrollbar pointer-events-auto"
                    >
                        <div className="h-full" onPointerDown={(e) => e.stopPropagation()}>
                            {item && entityType ? renderEntity(item, entityType, renderOptions) : children}
                        </div>
                    </div>
                )}

                {/* Resize Handles */}
                {!isMinimized && !isMobile && (
                    <>
                        <div 
                            className="absolute bottom-1 right-1 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 z-50 group-hover:opacity-100 transition-opacity"
                            onPointerDown={(e) => handleResize(e, "br")}
                        >
                            <div className="w-3 h-3 border-r-2 border-b-2 border-white/30 rounded-br-sm" />
                        </div>
                        <div 
                            className="absolute bottom-1 left-1 w-6 h-6 cursor-nesw-resize flex items-end justify-start p-1 z-50 group-hover:opacity-100 transition-opacity"
                            onPointerDown={(e) => handleResize(e, "bl")}
                        >
                            <div className="w-3 h-3 border-l-2 border-b-2 border-white/30 rounded-bl-sm" />
                        </div>
                    </>
                )}
            </GlassCard>
        </motion.div>
    )
}
