import type { MotionProps } from "framer-motion";

export const dialogPanelMotion: MotionProps = {
    initial: { opacity: 0, y: 10, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.98 },
    transition: { duration: 0.25 },
};
