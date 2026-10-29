"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { fadeUp } from "@/components/motion/presets"
import { cn } from "@/lib/utils"

/** Cartão de um gráfico: título, descrição e conteúdo, com entrada animada (Framer Motion). */
export function ChartCard({
    title,
    description,
    children,
    footer,
    className,
}: {
    title: string
    description?: string
    children: ReactNode
    footer?: ReactNode
    className?: string
}) {
    return (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className={className}>
            <Card className="flex h-full flex-col">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{title}</CardTitle>
                    {description && <CardDescription className="text-xs">{description}</CardDescription>}
                </CardHeader>
                <CardContent className={cn("flex-1 pt-2")}>{children}</CardContent>
                {footer && <div className="px-6 pb-6 text-[11px] leading-snug text-muted-foreground">{footer}</div>}
            </Card>
        </motion.div>
    )
}
