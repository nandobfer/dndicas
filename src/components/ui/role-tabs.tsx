"use client";

/**
 * @fileoverview RoleTabs selector for filtering by user role.
 * Admin = red (artifact), User = purple (veryRare).
 *
 * @see specs/000/spec.md - FR-014
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import { GlassSelector } from "./glass-selector"

export type RoleFilter = "all" | "admin" | "user"

export interface RoleTabsProps {
    /** Current selected role */
    value: RoleFilter
    /** Callback when role changes */
    onChange: (role: RoleFilter) => void
    /** Show "all" option (default: true) */
    showAll?: boolean
    /** Whether the tabs should take full width */
    fullWidth?: boolean
    /** Whether the component is disabled */
    disabled?: boolean
    /** Additional class names */
    className?: string
}

/**
 * Tab configuration with D&D rarity colors.
 */
const tabs: Array<{
    value: RoleFilter
    label: string
    activeColor: string
    textColor: string
}> = [
    {
        value: "all",
        label: "Todos",
        activeColor: "bg-white/15",
        textColor: "text-white",
    },
    {
        value: "admin",
        label: "Admin",
        activeColor: "bg-rose-500/20",
        textColor: "text-rose-400",
    },
    {
        value: "user",
        label: "User",
        activeColor: "bg-purple-500/20",
        textColor: "text-purple-400",
    },
]

/**
 * RoleTabs component for filtering users by role.
 *
 * @example
 * ```tsx
 * const [role, setRole] = useState<RoleFilter>('all');
 * <RoleTabs value={role} onChange={setRole} />
 * ```
 */
export function RoleTabs({ value, onChange, showAll = true, fullWidth = false, disabled = false, className }: RoleTabsProps) {
    const visibleTabs = showAll ? tabs : tabs.filter((tab) => tab.value !== "all")

    return (
        <GlassSelector
            value={value}
            onChange={(val) => onChange(val as RoleFilter)}
            options={visibleTabs}
            fullWidth={fullWidth}
            disabled={disabled}
            className={className}
            layoutId="role-tabs-indicator"
        />
    )
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
