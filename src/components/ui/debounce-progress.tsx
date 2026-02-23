"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/core/utils"

interface DebounceProgressProps {
    /** Whether the debounce/loading is active */
    isAnimating: boolean
    /** Duration in milliseconds */
    duration: number
    /** Optional custom key for the animation (e.g. current query) */
    animationKey?: string
    /** Additional CSS classes */
    className?: string
}

/**
 * A reusable progress bar for debounce periods.
 * Uses a linear motion animation to reflect the wait time.
 */
export function DebounceProgress({ 
    isAnimating, 
    duration, 
    animationKey,
    className 
}: DebounceProgressProps) {
    return (
        <AnimatePresence>
            {isAnimating && (
                <motion.div
                    key={animationKey}
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: duration / 1000, ease: "linear" }}
                    className={cn(
                        "absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 origin-left z-20",
                        className
                    )}
                />
            )}
        </AnimatePresence>
    )
}
