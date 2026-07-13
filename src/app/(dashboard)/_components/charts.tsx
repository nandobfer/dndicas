"use client"

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
    if (!data || data.length === 0) return <div className="h-12 w-full" />

    const max = Math.max(...data.map((d) => d.count), 1)

    // Se todos os valores forem iguais e maiores que zero, ajustamos a visualização
    // para que a linha não fique colada no topo (o que acontece quando count === max)
    const allSameAndNonZero = data.length > 0 && data.every((d) => d.count === data[0].count && d.count > 0)
    const displayMax = allSameAndNonZero ? max * 2 : max

    const points = data
        .map((d, i) => {
            const x = (i / (data.length - 1)) * 100
            const y = 100 - (d.count / displayMax) * 100
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

/**
 * Compact animated usage chart for dashboard entity cards.
 */
export function MiniUsageChart({ data, color }: { data: Array<{ context: string; count: number }>; color: string }) {
    const visibleData = data.filter((item) => item.count > 0)
    const chartData = visibleData.length > 0 ? visibleData : data
    const max = Math.max(...chartData.map((item) => item.count), 1)

    if (chartData.length === 0) {
        return <div className="h-12 w-full" />
    }

    return (
        <div className="h-12 w-full flex flex-col justify-end gap-1.5">
            {chartData.slice(0, 3).map((item, index) => {
                const width = item.count === 0 ? 8 : Math.max((item.count / max) * 100, 12)

                return (
                    <div key={item.context} className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${width}%` }}
                                transition={{ delay: index * 0.08, duration: 0.55, ease: "easeOut" }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: color, opacity: item.count === 0 ? 0.25 : 0.85 }}
                            />
                        </div>
                        <span className="w-14 truncate text-[9px] font-medium uppercase tracking-[0.12em] text-white/35">{item.context}</span>
                    </div>
                )
            })}
        </div>
    )
}
