/**
 * @fileoverview Aggregated theme configuration for Liquid Glass + D&D design system.
 * Combines colors, glassmorphism, and motion configs into a single export.
 *
 * Use this as the primary import for theme-related configuration.
 *
 * @example
 * import { themeConfig } from '@/lib/config/theme-config';
 *
 * const cardClass = themeConfig.glass.classes.card;
 * const adminColor = themeConfig.colors.role.admin;
 */

import { colors, primaryColor, type RarityColor, type ActionColor, type RoleColor } from './colors';
import { glassConfig, glassClasses } from './glass-config';
import { motionConfig, transitions, easings } from './motion-configs';
import { buttons } from './button-styles';

/**
 * Spacing constants for layout components.
 */
export const spacing = {
  /** Sidebar dimensions */
  sidebar: {
    /** Width when expanded (px) */
    expanded: 280,
    /** Width when collapsed (px) */
    collapsed: 72,
    /** Transition duration (ms) */
    transitionMs: 350,
  },
  /** Page layout spacing */
  page: {
    /** Main content padding (px) */
    padding: 24,
    /** Gap between sections (px) */
    gap: 16,
  },
  /** Table component spacing */
  table: {
    /** Rows per page default */
    rowsPerPage: 10,
    /** Cell padding */
    cellPadding: 12,
  },
} as const;

/**
 * Z-index layers for proper stacking context.
 */
export const zIndex = {
  /** Base content */
  base: 0,
  /** Elevated cards */
  elevated: 10,
  /** Sticky headers */
  sticky: 20,
  /** Sidebar */
  sidebar: 30,
  /** Dropdowns, popovers */
  dropdown: 40,
  /** Modals, dialogs */
  modal: 50,
  /** Tooltips */
  tooltip: 60,
  /** Toast notifications */
  toast: 70,
} as const;

/**
 * Breakpoints for responsive design (Tailwind defaults).
 */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/**
 * Animation durations in milliseconds.
 * Used for setTimeout/setInterval and CSS custom properties.
 */
export const durations = {
  /** Debounce delay for search inputs (FR-019) */
  debounce: 500,
  /** Fast micro-interactions */
  fast: 150,
  /** Normal transitions */
  normal: 200,
  /** Slow transitions */
  slow: 300,
  /** Page/modal transitions */
  page: 350,
  /** Sidebar animation (under SC-002 target of 400ms) */
  sidebar: 350,
} as const;

/**
 * Complete theme configuration object.
 * This is the main export for theme-related values.
 */
export const themeConfig = {
  colors,
  buttons,
  glass: glassConfig,
  motion: motionConfig,
  spacing,
  zIndex,
  breakpoints,
  durations,
} as const;

// Re-export sub-configs for convenience
export { colors, primaryColor, glassConfig, glassClasses, motionConfig, transitions, easings, buttons };

// Re-export types
export type { RarityColor, ActionColor, RoleColor };
