import type { Transition, Variants } from "framer-motion"

/** Durações e presets de animação do app (≈150–300 ms, sem bloquear a interação). */
export const DURATION = { fast: 0.15, base: 0.2, slow: 0.3 } as const

export const easeOut: Transition = { duration: DURATION.base, ease: "easeOut" }

export const fadeUp: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: easeOut },
    exit: { opacity: 0, y: -6, transition: { duration: DURATION.fast } },
}

export const listContainer: Variants = {
    visible: { transition: { staggerChildren: 0.04 } },
}

export const listItem: Variants = {
    hidden: { opacity: 0, y: 6 },
    visible: { opacity: 1, y: 0, transition: easeOut },
    exit: { opacity: 0, x: -8, transition: { duration: DURATION.fast } },
}

/** Troca de abas/etapas (`AnimatePresence mode="wait"`). */
export const tabSwap: Variants = {
    hidden: { opacity: 0, x: 12 },
    visible: { opacity: 1, x: 0, transition: easeOut },
    exit: { opacity: 0, x: -12, transition: { duration: DURATION.fast } },
}

/** Reversão animada de resposta otimista que falhou. */
export const shakeOnError = { x: [0, -6, 6, -4, 4, 0], transition: { duration: DURATION.slow } }
