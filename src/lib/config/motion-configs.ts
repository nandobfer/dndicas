/**
 * @fileoverview Framer Motion animation variants for Liquid Glass theme.
 * Centralized configuration ensures consistent animations across the app.
 *
 * Performance targets:
 * - Sidebar animation: < 400ms (SC-002)
 * - Page transitions: 300ms
 * - Micro-interactions: 150-200ms
 *
 * @see specs/000/research.md - Decision 2
 */

import type { Variants, Transition } from 'framer-motion';

/**
 * Standard easing curves for different animation types.
 */
export const easings = {
  /** Smooth deceleration - good for entrances */
  easeOut: [0, 0, 0.2, 1],
  /** Smooth acceleration - good for exits */
  easeIn: [0.4, 0, 1, 1],
  /** Natural feel - good for most transitions */
  easeInOut: [0.4, 0, 0.2, 1],
  /** Bouncy - good for playful interactions */
  bounce: [0.68, -0.55, 0.265, 1.55],
} as const;

/**
 * Fade in from bottom - used for modals, pages, cards.
 */
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

/**
 * Fade in from top - used for dropdowns, tooltips.
 */
export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

/**
 * Simple fade - used for overlays, backdrops.
 */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Scale up - used for dialogs, popovers.
 */
export const scaleUp: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/**
 * Sidebar expand/collapse animation.
 * Transition duration: 350ms (under SC-002 target of 400ms).
 */
export const sidebarVariants: Variants = {
    expanded: { width: 280, minWidth: 280 },
    collapsed: { width: 72, minWidth: 72 },
}

/**
 * Sidebar transition configuration.
 * Switched to heavy-mass spring for premium "liquid" feel.
 * Increased damping to 22 and normalized mass for a stable, premium feel.
 */
export const sidebarTransition: Transition = {
    type: "spring",
    stiffness: 60,
    damping: 10,
    mass: 0.5,
    restDelta: 0.05,
}

/**
 * Table row animation for list transitions.
 */
export const tableRowVariants: Variants = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 },
};

/**
 * Stagger children animation for lists.
 */
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

/**
 * Hover scale effect for interactive elements.
 */
export const hoverScale = {
  scale: 1.02,
  transition: { duration: 0.15 },
};

/**
 * Press/tap effect for buttons.
 */
export const tapScale = {
  scale: 0.98,
};

/**
 * Pulse animation for loading states.
 */
export const pulseVariants: Variants = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Skeleton loading shimmer effect.
 */
export const shimmerVariants: Variants = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Standard transition presets for common durations.
 */
export const transitions = {
  /** Fast micro-interactions (150ms) */
  fast: { duration: 0.15, ease: easings.easeOut },
  /** Normal transitions (200ms) */
  normal: { duration: 0.2, ease: easings.easeOut },
  /** Slow transitions (300ms) */
  slow: { duration: 0.3, ease: easings.easeOut },
  /** Page/modal transitions (350ms) */
  page: { duration: 0.35, ease: easings.easeInOut },
} as const;

/**
 * Complete motion configuration object.
 */
export const motionConfig = {
  variants: {
    fadeInUp,
    fadeInDown,
    fade,
    scaleUp,
    sidebar: sidebarVariants,
    tableRow: tableRowVariants,
    staggerContainer,
    pulse: pulseVariants,
    shimmer: shimmerVariants,
  },
  transitions,
  easings,
  hover: hoverScale,
  tap: tapScale,
  sidebarTransition,
} as const;
