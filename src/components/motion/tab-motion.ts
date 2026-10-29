import { Variants, HTMLMotionProps } from "framer-motion"

/**
 * Shared motion configurations for tab transitions
 */
export const tabContentVariants: Variants = {
    initial: {
        opacity: 0,
        x: 10,
    },
    animate: {
        opacity: 1,
        x: 0,
        transition: {
            duration: 0.2,
            ease: "easeOut",
        },
    },
    exit: {
        opacity: 0,
        x: -10,
        transition: {
            duration: 0.15,
            ease: "easeIn",
        },
    },
}

export const tabMotionProps: HTMLMotionProps<"div"> = {
    variants: tabContentVariants,
    initial: "initial",
    animate: "animate",
    exit: "exit",
}

/**
 * Height animation wrapper props
 */
export const tabHeightMotion: HTMLMotionProps<"div"> = {
    initial: false,
    animate: { height: "auto" },
    transition: {
        height: {
            duration: 0.3,
            ease: [0.4, 0, 0.2, 1], // Standard easing
        },
    },
}
