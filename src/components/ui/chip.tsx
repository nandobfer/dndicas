"use client";

/**
 * @fileoverview Chip component with D&D rarity color variants.
 * Used for status badges, tags, and small indicators.
 *
 * @see specs/000/spec.md - FR-017
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/core/utils';

/**
 * Chip variant styles using D&D rarity colors.
 */
const chipVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-full text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        /** Common - neutral gray */
        common: 'bg-gray-400/20 text-gray-400 border border-gray-400/30',
        /** Uncommon - success green */
        uncommon: 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30',
        /** Rare - info blue */
        rare: 'bg-blue-400/20 text-blue-400 border border-blue-400/30',
        /** Very Rare - highlight purple */
        veryRare: 'bg-purple-400/20 text-purple-400 border border-purple-400/30',
        /** Legendary - warning amber */
        legendary: 'bg-amber-400/20 text-amber-400 border border-amber-400/30',
        /** Artifact - danger red */
        artifact: 'bg-rose-400/20 text-rose-400 border border-rose-400/30',
        /** Outline - subtle bordered */
        outline: 'bg-transparent text-white/60 border border-white/20',
        /** Ghost - no background */
        ghost: 'bg-white/5 text-white/80 border border-transparent',
      },
      size: {
        sm: 'h-5 px-2 text-[10px]',
        md: 'h-6 px-2.5 text-xs',
        lg: 'h-7 px-3 text-sm',
      },
    },
    defaultVariants: {
      variant: 'common',
      size: 'md',
    },
  }
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  /** Icon to display before text */
  icon?: React.ReactNode;
  /** Whether the chip is interactive (clickable) */
  interactive?: boolean;
  /** Remove action callback */
  onRemove?: () => void;
}

/**
 * Chip component for displaying small status badges and tags.
 *
 * @example
 * ```tsx
 * <Chip variant="uncommon">CREATE</Chip>
 * <Chip variant="artifact" size="lg">Admin</Chip>
 * <Chip variant="rare" icon={<UserIcon />}>Active</Chip>
 * ```
 */
const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  (
    {
      className,
      variant,
      size,
      icon,
      interactive,
      onRemove,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cn(
          chipVariants({ variant, size }),
          interactive && 'cursor-pointer hover:opacity-80',
          className
        )}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="ml-0.5 -mr-1 h-4 w-4 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            aria-label="Remove"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </span>
    );
  }
);
Chip.displayName = 'Chip';

/**
 * Chip variant helper for mapping status/role to variant.
 */
export const chipVariantMap = {
  // Status mapping
  active: 'uncommon',
  inactive: 'common',
  pending: 'legendary',
  error: 'artifact',
  
  // Role mapping
  admin: 'artifact',
  user: 'veryRare',
  
  // Action mapping
  create: 'uncommon',
  update: 'rare',
  delete: 'artifact',
} as const;

export { Chip, chipVariants };
