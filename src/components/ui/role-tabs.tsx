"use client";

/**
 * @fileoverview RoleTabs selector for filtering by user role.
 * Admin = red (artifact), User = purple (veryRare).
 *
 * @see specs/000/spec.md - FR-014
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import { motion } from 'framer-motion';

export type RoleFilter = 'all' | 'admin' | 'user';

export interface RoleTabsProps {
  /** Current selected role */
  value: RoleFilter;
  /** Callback when role changes */
  onChange: (role: RoleFilter) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Tab configuration with D&D rarity colors.
 */
const tabs: Array<{
  value: RoleFilter;
  label: string;
  activeColor: string;
  textColor: string;
}> = [
  {
    value: 'all',
    label: 'Todos',
    activeColor: 'bg-white/15',
    textColor: 'text-white',
  },
  {
    value: 'admin',
    label: 'Admin',
    activeColor: 'bg-rose-500/20',
    textColor: 'text-rose-400',
  },
  {
    value: 'user',
    label: 'User',
    activeColor: 'bg-purple-500/20',
    textColor: 'text-purple-400',
  },
];

/**
 * RoleTabs component for filtering users by role.
 *
 * @example
 * ```tsx
 * const [role, setRole] = useState<RoleFilter>('all');
 * <RoleTabs value={role} onChange={setRole} />
 * ```
 */
export function RoleTabs({ value, onChange, className }: RoleTabsProps) {
  return (
    <div
      className={cn(
        'inline-flex p-1 rounded-lg bg-white/5 border border-white/10',
        className
      )}
      role="tablist"
      aria-label="Filtrar por função"
    >
      {tabs.map((tab) => {
        const isSelected = value === tab.value;

        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
              isSelected ? tab.textColor : 'text-white/50 hover:text-white/70'
            )}
          >
            {isSelected && (
              <motion.div
                layoutId="role-tabs-indicator"
                className={cn(
                  'absolute inset-0 rounded-md',
                  tab.activeColor
                )}
                transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Get display text for role filter.
 */
export function getRoleFilterText(role: RoleFilter): string {
  switch (role) {
    case 'admin':
      return 'Administradores';
    case 'user':
      return 'Usuários';
    default:
      return 'Todos';
  }
}
