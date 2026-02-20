/**
 * @fileoverview Glassmorphism (Liquid Glass) configuration for UI components.
 * Defines blur, opacity, border, and shadow settings for different component types.
 *
 * Uses Tailwind CSS classes that can be applied directly to components.
 * Requires backdrop-filter support (~95% browser coverage as of 2026).
 *
 * @see specs/000/research.md - Decision 1
 */

/**
 * Glass configuration for overlay components (modals, popovers, dropdowns).
 * Highest blur and opacity for maximum contrast against background.
 */
export const overlayGlass = {
  /** Heavy blur effect (24px) for overlays */
  blur: 'backdrop-blur-xl',
  /** 40% black background for readability */
  background: 'bg-black/40',
  /** Subtle white border */
  border: 'border border-white/10',
  /** Deep shadow for elevation */
  shadow: 'shadow-2xl shadow-black/20',
} as const;

/**
 * Glass configuration for card components.
 * Medium blur with lighter opacity for inline content.
 */
export const cardGlass = {
  /** Medium blur effect (12px) for cards */
  blur: 'backdrop-blur-md',
  /** 5% white background - very subtle */
  background: 'bg-white/5',
  /** Very subtle border */
  border: 'border border-white/5',
  /** Soft glow ring */
  glow: 'ring-1 ring-white/10',
} as const;

/**
 * Glass configuration for sidebar component.
 * Strong blur with higher opacity for persistent navigation.
 */
export const sidebarGlass = {
  /** Large blur effect (16px) for sidebar */
  blur: 'backdrop-blur-lg',
  /** 60% black background for contrast against page */
  background: 'bg-black/60',
  /** Right border separator */
  border: 'border-r border-white/5',
} as const;

/**
 * Glass configuration for input components.
 * Subtle glass effect to blend with forms.
 */
export const inputGlass = {
  /** Light blur effect (8px) for inputs */
  blur: 'backdrop-blur-sm',
  /** 10% white background */
  background: 'bg-white/10',
  /** Standard border with focus state support */
  border: 'border border-white/10 focus-within:border-white/20',
} as const;

/**
 * Glass configuration for tooltip components.
 * Similar to overlay but smaller scale.
 */
export const tooltipGlass = {
  /** Heavy blur for tooltips */
  blur: 'backdrop-blur-xl',
  /** Dark background for contrast */
  background: 'bg-black/80',
  /** Visible border */
  border: 'border border-white/15',
  /** Small shadow */
  shadow: 'shadow-lg shadow-black/30',
  /** Text color */
  text: 'text-white',
} as const;

/**
 * Combined glass classes for quick application.
 * Joins all relevant classes for each component type.
 */
export const glassClasses = {
  overlay: `${overlayGlass.blur} ${overlayGlass.background} ${overlayGlass.border} ${overlayGlass.shadow}`,
  card: `${cardGlass.blur} ${cardGlass.background} ${cardGlass.border} ${cardGlass.glow}`,
  sidebar: `${sidebarGlass.blur} ${sidebarGlass.background} ${sidebarGlass.border}`,
  input: `${inputGlass.blur} ${inputGlass.background} ${inputGlass.border}`,
  tooltip: `${tooltipGlass.blur} ${tooltipGlass.background} ${tooltipGlass.border} ${tooltipGlass.shadow}`,
} as const;

/**
 * Complete glassmorphism configuration object.
 */
export const glassConfig = {
  overlay: overlayGlass,
  card: cardGlass,
  sidebar: sidebarGlass,
  input: inputGlass,
  tooltip: tooltipGlass,
  classes: glassClasses,
} as const;
