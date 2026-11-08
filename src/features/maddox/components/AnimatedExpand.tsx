"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { cn } from "@/lib/utils"

const EASE = [0.22, 1, 0.36, 1] as const

interface Props {
    children: ReactNode
    /** Altura recolhida em px; o conteúdo menor que ela não é cortado nem ganha botão. */
    collapsedHeight?: number
    expandLabel?: string
    collapseLabel?: string
    className?: string
    /** Classes do degradê que indica o corte (a cor de fundo do cartão). */
    fadeClassName?: string
    "data-testid"?: string
}

/**
 * "Ver mais" animado: a altura vai da recolhida até `auto` (e volta) com `framer-motion`, sem corte seco por `max-h`.
 * O botão só aparece quando o conteúdo passa da altura recolhida (medido com `ResizeObserver`).
 */
export function AnimatedExpand({ children, collapsedHeight = 176, expandLabel = "Ver mais", collapseLabel = "Mostrar menos", className, fadeClassName, "data-testid": testId }: Props) {
    const id = useId()
    const innerRef = useRef<HTMLDivElement>(null)
    const reduceMotion = useReducedMotion()
    const [expanded, setExpanded] = useState(false)
    const [overflows, setOverflows] = useState(false)

    useEffect(() => {
        const element = innerRef.current
        if (!element) return
        const measure = () => setOverflows(element.scrollHeight > collapsedHeight + 4)
        measure()
        if (typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [collapsedHeight])

    const collapsed = overflows && !expanded
    return (
        <div className={cn("space-y-2", className)} data-testid={testId}>
            <motion.div
                id={id}
                className="relative overflow-hidden"
                initial={false}
                animate={{ height: collapsed ? collapsedHeight : "auto" }}
                transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
                data-expanded={expanded || !overflows}
            >
                <div ref={innerRef}>{children}</div>
                <AnimatePresence initial={false}>
                    {collapsed && (
                        <motion.div
                            key="fade"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.25 }}
                            className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background/95 to-transparent", fadeClassName)}
                            aria-hidden
                        />
                    )}
                </AnimatePresence>
            </motion.div>
            {overflows && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={id}>
                    <ChevronDown className={cn("transition-transform duration-300", expanded && "rotate-180")} aria-hidden /> {expanded ? collapseLabel : expandLabel}
                </Button>
            )}
        </div>
    )
}
