"use client"

import { useEffect, useState } from "react"
import { animate, useMotionValue, useReducedMotion } from "framer-motion"

interface AnimatedNumberProps {
    value: number
    formatter?: (value: number) => string
    className?: string
    duration?: number
}

const defaultFormatter = (value: number) => Math.round(value).toLocaleString("pt-BR")

/** Número que anima entre valores (copiado do Smart Desk); respeita movimento reduzido. */
export function AnimatedNumber({ value, formatter = defaultFormatter, className, duration = 0.45 }: AnimatedNumberProps) {
    const motionValue = useMotionValue(value)
    const reduceMotion = useReducedMotion()
    const [displayValue, setDisplayValue] = useState(value)

    useEffect(() => {
        const controls = animate(motionValue, value, {
            duration: reduceMotion ? 0 : duration,
            ease: "easeOut",
            onUpdate: (latest) => setDisplayValue(latest),
        })
        return () => controls.stop()
    }, [value, duration, motionValue, reduceMotion])

    return <span className={className}>{formatter(displayValue)}</span>
}
