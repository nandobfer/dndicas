"use client"

import { motion } from "framer-motion"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { Card, CardContent } from "@/components/ui/opex/card"
import { fadeUp } from "@/components/motion/presets"

export interface DashboardKpiItem { label: string; hint: string; value: number; formatter: (value: number) => string }

/** Literal portal KPI presentation; only imports are local to DnDicas. */
export function DashboardKpis({ items }: { items: readonly DashboardKpiItem[] }) {
    return (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {items.map((item) => (
                <Card key={item.label}>
                    <CardContent className="flex flex-col gap-1 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                        <p className="font-mono text-xl font-bold text-foreground"><AnimatedNumber value={item.value} formatter={item.formatter} /></p>
                        <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                    </CardContent>
                </Card>
            ))}
        </motion.div>
    )
}
