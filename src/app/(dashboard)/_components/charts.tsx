"use client"

import * as React from "react"
import { motion } from "framer-motion"

/**
 * Simple animated bar chart component for a modern look.
 */
export function MiniBarChart({ data, color }: { data: Array<{ count: number }>; color: string }) {
    const max = Math.max(...data.map((d) => d.count), 1)

    return (
        <div className="flex items-end gap-1 h-12 w-full">
            {data.map((d, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.count / max) * 100}%` }}
                    transition={{ delay: i * 0.05, duration: 0.5 }}
                    style={{ backgroundColor: color }}
                    className="flex-1 rounded-t-sm opacity-60"
                />
            ))}
        </div>
    )
}

/**
 * Simple animated line chart using SVG.
 */
export function MiniLineChart({ data, color }: { data: Array<{ count: number }>; color: string }) {
    const max = Math.max(...data.map((d) => d.count), 1)
    const points = data
        .map((d, i) => {
            const x = (i / (data.length - 1)) * 100
            const y = 100 - (d.count / max) * 100
            return `${x},${y}`
        })
        .join(" ")

    return (
        <div className="h-12 w-full pt-2">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                <motion.polyline
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.8 }}
                    transition={{ duration: 1, ease: "easeOut" }}
                />
            </svg>
        </div>
    )
}
