"use client"

import Image from "next/image"
import { motion, useReducedMotion } from "framer-motion"
import { DURATION } from "@/components/motion/presets"
import { LiquidGlassBackground } from "@/components/ui/glass-background"

const DOTS = [0, 1, 2] as const

/**
 * Loading da validação da sessão (`/api/me`), adaptado do ciliar: fundo com os feixes de luz do app,
 * logo pulsando, anel azul/roxo girando e reticências animadas. Com movimento reduzido fica estático,
 * só com o fade de entrada.
 */
export function AccessLoadingScreen() {
    const reducedMotion = useReducedMotion()
    const pulse = { duration: 2, repeat: Infinity, repeatType: "reverse" as const, ease: "easeInOut" as const }
    return (
        <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4">
            <LiquidGlassBackground />
            <motion.div
                role="status"
                aria-live="polite"
                aria-busy="true"
                aria-label="Carregando acesso"
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: DURATION.slow, ease: "easeOut" }}
                className="relative z-10 flex flex-col items-center gap-6"
            >
                <motion.div
                    className="relative aspect-[2/1] w-56 sm:w-72"
                    animate={reducedMotion ? undefined : { opacity: [0.75, 1] }}
                    transition={reducedMotion ? undefined : pulse}
                >
                    <Image src="/dndicas-logo.webp" alt="Dungeons & Dicas" fill sizes="(min-width: 640px) 288px, 224px" className="object-contain" priority />
                </motion.div>
                <div className="relative h-14 w-14 sm:h-16 sm:w-16" aria-hidden="true" data-testid="access-loading-ring">
                    <motion.div
                        className="absolute inset-0 rounded-full shadow-[0_0_50px_-14px_rgba(59,130,246,0.7)]"
                        animate={reducedMotion ? undefined : { opacity: [0.5, 1], scale: [0.95, 1.05] }}
                        transition={reducedMotion ? undefined : pulse}
                    />
                    <div className="absolute inset-0 rounded-full border-4 border-white/10" />
                    <motion.div
                        className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-400 border-r-purple-500/70"
                        animate={reducedMotion ? undefined : { rotate: 360 }}
                        transition={reducedMotion ? undefined : { duration: 1.1, repeat: Infinity, ease: "linear" }}
                    />
                </div>
                <p className="text-sm text-white/60 sm:text-base">
                    Carregando acesso
                    <span aria-hidden="true" data-testid="access-loading-dots">
                        {DOTS.map((index) => (
                            <motion.span
                                key={index}
                                animate={reducedMotion ? undefined : { opacity: [0.2, 1, 0.2] }}
                                transition={reducedMotion ? undefined : { duration: 1.2, repeat: Infinity, delay: index * 0.2 }}
                            >
                                .
                            </motion.span>
                        ))}
                    </span>
                </p>
            </motion.div>
        </main>
    )
}
