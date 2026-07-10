"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { EntityRenderOptions } from "@/features/rules/components/entity-renderers"

export type WindowInstance = {
    id: string
    title: string
    content: React.ReactNode
    entityId?: string
    entityType?: string
    item?: unknown
    renderOptions?: EntityRenderOptions
    zIndex: number
    initialPosition?: { x: number, y: number }
    lastPosition?: { x: number, y: number }
    isMinimized?: boolean
    initialSize?: { width: number | string, height: number | string }
    minSize?: { width: number, height: number }
}

interface WindowContextType {
    windows: WindowInstance[]
    addWindow: (window: Omit<WindowInstance, "id" | "zIndex"> & { id?: string }) => void
    removeWindow: (id: string) => void
    bringToFront: (id: string) => void
    toggleMinimize: (id: string) => void
    updatePosition: (id: string, position: { x: number, y: number }) => void
}

const WindowContext = React.createContext<WindowContextType | undefined>(undefined)

export function WindowProvider({ children }: { children: React.ReactNode }) {
    const [windows, setWindows] = React.useState<WindowInstance[]>([])
    const [nextZIndex, setNextZIndex] = React.useState(10) // Lower base z-index

    const addWindow = React.useCallback((window: Omit<WindowInstance, "id" | "zIndex"> & { id?: string }) => {
        const targetId = window.id ?? Math.random().toString(36).substring(2, 9)
        setWindows((prev) => {
            const existing = prev.find((w) => w.id === targetId)
            if (existing) {
                return prev.map((w) => 
                    w.id === targetId 
                        ? { 
                            ...w, 
                            title: window.title,
                            content: window.content, 
                            isMinimized: false, 
                            zIndex: nextZIndex 
                          } 
                        : w
                )
            }
            const offset = prev.length * 30 // 30px offset per open window
            return [
                ...prev,
                { 
                    ...window, 
                    id: targetId, 
                    zIndex: nextZIndex,
                    initialPosition: window.initialPosition ?? { x: 50 + offset, y: 50 + offset },
                    isMinimized: false
                }
            ]
        })
        setNextZIndex((prev) => prev + 1)
    }, [nextZIndex])

    const removeWindow = React.useCallback((id: string) => {
        setWindows((prev) => prev.filter((w) => w.id !== id))
    }, [])

    const toggleMinimize = React.useCallback((id: string) => {
        setWindows((prev) => prev.map((w) => 
            w.id === id ? { ...w, isMinimized: !w.isMinimized } : w
        ))
    }, [])

    const updatePosition = React.useCallback((id: string, position: { x: number, y: number }) => {
        setWindows((prev) => prev.map((w) => 
            w.id === id ? { ...w, lastPosition: position } : w
        ))
    }, [])

    const bringToFront = React.useCallback((id: string) => {
        setWindows((prev) => {
            const window = prev.find((w) => w.id === id)
            if (!window || window.zIndex === nextZIndex - 1) return prev
            
            return prev.map((w) => 
                w.id === id ? { ...w, zIndex: nextZIndex } : w
            )
        })
        setNextZIndex((prev) => prev + 1)
    }, [nextZIndex])

    return (
        <WindowContext.Provider value={{ windows, addWindow, removeWindow, bringToFront, toggleMinimize, updatePosition }}>
            {children}
            <div className="fixed inset-0 pointer-events-none z-[10]">
                {/* Windows will be rendered here via a separate component or portal-like logic */}
                <div className="relative w-full h-full overflow-hidden">
                    <AnimatePresence>
                        {windows.map((window) => (
                            <WindowRenderer key={window.id} window={window} />
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            {/* Taskbar-like area for minimized windows */}
            <div className="fixed bottom-2 left-2 right-auto p-2 flex flex-wrap-reverse gap-2 pointer-events-none z-[11] items-end justify-start md:bottom-0 md:left-20 md:right-0">
                <AnimatePresence mode="popLayout">
                    {windows
                        .filter((w) => w.isMinimized)
                        .map((window) => (
                            <motion.div
                                key={`minimized-${window.id}`}
                                layout
                                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.8 }}
                                className="pointer-events-auto shrink-0"
                            >
                                <GlassWindow
                                    id={window.id}
                                    title={window.title}
                                    zIndex={1}
                                    onClose={() => removeWindow(window.id)}
                                    onFocus={() => {}}
                                    onMinimize={() => toggleMinimize(window.id)}
                                    item={window.item}
                                    entityType={window.entityType}
                                    renderOptions={window.renderOptions}
                                    isMinimized={true}
                                />
                            </motion.div>
                        ))}
                </AnimatePresence>
            </div>
        </WindowContext.Provider>
    )
}

export function useWindows() {
    const context = React.useContext(WindowContext)
    if (!context) {
        throw new Error("useWindows must be used within a WindowProvider")
    }
    return context
}

// Internal component for rendering each window
import { GlassWindow } from "@/components/ui/glass-window"

function WindowRenderer({ window }: { window: WindowInstance }) {
    const { removeWindow, bringToFront, toggleMinimize, updatePosition } = useWindows()
    
    if (window.isMinimized) return null

    return (
        <GlassWindow
            id={window.id}
            title={window.title}
            zIndex={window.zIndex}
            onClose={() => removeWindow(window.id)}
            onFocus={() => bringToFront(window.id)}
            onMinimize={() => toggleMinimize(window.id)}
            onPositionChange={(pos) => updatePosition(window.id, pos)}
            item={window.item}
            entityType={window.entityType}
            renderOptions={window.renderOptions}
            initialPosition={window.lastPosition || window.initialPosition}
            isMinimized={false}
            initialSize={window.initialSize}
            minSize={window.minSize}
        >
            {window.content}
        </GlassWindow>
    )
}
