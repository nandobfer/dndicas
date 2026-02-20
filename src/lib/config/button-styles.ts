/**
 * @fileoverview Centralized button style configurations.
 * All buttons should use these styles for consistency.
 * 
 * To change the primary color across the entire app, update colors.ts
 */

import { primaryColor } from './colors';

/**
 * Primary button styles (main actions)
 * Uses the primary blue color from colors.ts
 */
export const buttonStyles = {
  primary: {
    /** Base Tailwind classes for primary buttons */
    classes: 'bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors',
    /** Hex color values for non-Tailwind use cases */
    bg: primaryColor,
    bgHover: '#2563EB', // blue-600
    text: '#FFFFFF',
  },
  
  secondary: {
    classes: 'bg-white/5 text-white hover:bg-white/10 border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors',
    bg: 'rgba(255, 255, 255, 0.05)',
    bgHover: 'rgba(255, 255, 255, 0.1)',
    text: '#FFFFFF',
  },
  
  danger: {
    classes: 'bg-rose-500 text-white hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-colors',
    bg: '#EF4444',
    bgHover: '#DC2626',
    text: '#FFFFFF',
  },
  
  ghost: {
    classes: 'text-white/60 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors',
    bg: 'transparent',
    bgHover: 'rgba(255, 255, 255, 0.1)',
    text: 'rgba(255, 255, 255, 0.6)',
  },
} as const;

/**
 * Button size variants
 */
export const buttonSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
} as const;

/**
 * Get complete button class string
 * 
 * @example
 * ```tsx
 * <button className={getButtonClasses('primary', 'md')}>
 *   Click me
 * </button>
 * ```
 */
export function getButtonClasses(
  variant: keyof typeof buttonStyles = 'primary',
  size: keyof typeof buttonSizes = 'md',
  additionalClasses?: string
): string {
  const classes = [
    buttonStyles[variant].classes,
    buttonSizes[size],
    'rounded-lg font-medium',
    additionalClasses,
  ].filter(Boolean).join(' ');
  
  return classes;
}

/**
 * Export button config for easy import
 */
export const buttons = {
  styles: buttonStyles,
  sizes: buttonSizes,
  getClasses: getButtonClasses,
} as const;
