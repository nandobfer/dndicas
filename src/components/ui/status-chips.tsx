"use client";

/**
 * @fileoverview StatusChips component for filtering by active/inactive status.
 * Uses chip-style buttons with color indicators.
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import { motion } from 'framer-motion';

export type StatusFilter = 'all' | 'active' | 'inactive';

export interface StatusChipsProps {
  /** Current selected status */
  value: StatusFilter;
  /** Callback when status changes */
  onChange: (status: StatusFilter) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Chip configuration.
 */
const chips: Array<{
  value: StatusFilter;
  label: string;
  activeColor: string;
  dotColor: string;
}> = [
  {
    value: 'all',
    label: 'Todos',
    activeColor: 'bg-purple-500/20',
    dotColor: 'bg-purple-400',
  },
  {
    value: 'active',
    label: 'Ativos',
    activeColor: 'bg-emerald-500/20',
    dotColor: 'bg-emerald-400',
  },
  {
    value: 'inactive',
    label: 'Inativos',
    activeColor: 'bg-gray-500/20',
    dotColor: 'bg-gray-400',
  },
];

/**
 * StatusChips component for filtering by status.
 *
 * @example
 * ```tsx
 * const [status, setStatus] = useState<StatusFilter>('active');
 * <StatusChips value={status} onChange={setStatus} />
 * ```
 */
export function StatusChips({ value, onChange, className }: StatusChipsProps) {
  return (
    <div
      className={cn(
        'inline-flex p-1 rounded-lg bg-white/5 border border-white/10',
        className
      )}
      role="group"
      aria-label="Filtrar por status"
    >
      {chips.map((chip) => {
        const isSelected = value === chip.value;

        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onChange(chip.value)}
            className={cn(
              'relative px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
              'flex items-center gap-2',
              isSelected
                ? 'text-white'
                : 'text-white/50 hover:text-white/70'
            )}
          >
            {isSelected && (
              <motion.div
                layoutId="status-chips-indicator"
                className={cn('absolute inset-0 rounded-md', chip.activeColor)}
                transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
              />
            )}
            <span
              className={cn(
                'relative z-10 w-2 h-2 rounded-full',
                chip.dotColor
              )}
            />
            <span className="relative z-10">{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}
