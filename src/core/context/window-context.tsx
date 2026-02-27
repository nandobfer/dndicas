"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"

export type WindowInstance = {
    id: string
    title: string
    content: React.ReactNode
    entityId?: string
    entityType?: string
    item?: any
    zIndex: number
    initialPosition?: { x: number, y: number }
    lastPosition?: { x: number, y: number }
    isMinimized?: boolean
}

interface WindowContextType {
    windows: WindowInstance[]
    addWindow: (window: Omit<WindowInstance, "id" | "zIndex">) => void
    removeWindow: (id: string) => void
    bringToFront: (id: string) => void
    toggleMinimize: (id: string) => void
    updatePosition: (id: string, position: { x: number, y: number }) => void
}

const WindowContext = React.createContext<WindowContextType | undefined>(undefined)

export function WindowProvider({ children }: { children: React.ReactNode }) {
    const [windows, setWindows] = React.useState<WindowInstance[]>([])
    const [nextZIndex, setNextZIndex] = React.useState(10) // Lower base z-index

    const addWindow = React.useCallback((window: Omit<WindowInstance, "id" | "zIndex">) => {
        const id = Math.random().toString(36).substring(2, 9)
        const offset = windows.length * 30 // 30px offset per open window
        setWindows((prev) => [
            ...prev,
            { 
                ...window, 
                id, 
                zIndex: nextZIndex,
                initialPosition: { x: 50 + offset, y: 50 + offset },
                isMinimized: false
            }
        ])
        setNextZIndex((prev) => prev + 1)
    }, [nextZIndex, windows.length])

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
            <div className="fixed bottom-0 left-20 right-0 p-2 flex flex-wrap-reverse gap-2 pointer-events-none z-[11] items-end justify-start">
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
            initialPosition={window.lastPosition || window.initialPosition}
            isMinimized={false}
        >
            {window.content}
        </GlassWindow>
    )
}
