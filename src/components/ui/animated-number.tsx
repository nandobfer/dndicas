'use client';

import { useEffect, useState } from "react"
import { animate, useMotionValue } from "framer-motion"

interface AnimatedNumberProps {
  value: number
  formatter: (value: number) => string
  className?: string
  duration?: number
}

export function AnimatedNumber({
  value,
  formatter,
  className,
  duration = 0.45,
}: AnimatedNumberProps): React.ReactElement {
  const motionValue = useMotionValue(value)
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setDisplayValue(latest),
    })

    return () => controls.stop()
  }, [value, duration, motionValue])

  return <span className={className}>{formatter(displayValue)}</span>
}
