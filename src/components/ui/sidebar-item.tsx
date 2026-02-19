"use client";

/**
 * @fileoverview SidebarItem component with tooltip support for collapsed state.
 * Displays icon + label when expanded, icon-only with tooltip when collapsed.
 *
 * @example
 * ```tsx
 * <SidebarItem
 *   href="/users"
 *   icon={Users}
 *   label="Usuários"
 *   isExpanded={isExpanded}
 *   isActive={pathname === '/users'}
 * />
 * ```
 */

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/core/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/core/ui/tooltip';
import { glassConfig } from '@/lib/config/glass-config';
import { motionConfig } from '@/lib/config/motion-configs';

export interface SidebarItemProps {
  /** Navigation href */
  href: string;
  /** Icon component */
  icon: LucideIcon;
  /** Display label */
  label: string;
  /** Whether sidebar is expanded */
  isExpanded: boolean;
  /** Whether this item is active/selected */
  isActive?: boolean;
  /** Optional badge count */
  badge?: number;
  /** Click handler (optional, used for non-navigation items) */
  onClick?: () => void;
}

/**
 * Sidebar navigation item with collapse/expand animation.
 * Shows tooltip with label when sidebar is collapsed.
 */
export const SidebarItem: React.FC<SidebarItemProps> = ({
  href,
  icon: Icon,
  label,
  isExpanded,
  isActive = false,
  badge,
  onClick,
}) => {
  const itemContent = (
    <motion.div
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        'hover:bg-white/10',
        isActive
          ? 'bg-white/15 text-white'
          : 'text-white/70 hover:text-white',
        !isExpanded && 'justify-center px-2'
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={motionConfig.transitions.fast}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />

      <AnimatePresence mode="wait">
        {isExpanded && (
          <motion.span
            className="flex-1 truncate"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={motionConfig.transitions.fast}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>

      {badge !== undefined && badge > 0 && isExpanded && (
        <motion.span
          className={cn(
            'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
            'bg-white/20 text-white'
          )}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={motionConfig.transitions.fast}
        >
          {badge > 99 ? '99+' : badge}
        </motion.span>
      )}
    </motion.div>
  );

  // Wrap in tooltip when collapsed
  const wrappedContent = !isExpanded ? (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>
        {onClick ? (
          <button onClick={onClick} className="w-full">
            {itemContent}
          </button>
        ) : (
          <Link href={href}>{itemContent}</Link>
        )}
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className={cn(
          'z-50',
          glassConfig.tooltip.blur,
          glassConfig.tooltip.background,
          glassConfig.tooltip.border
        )}
      >
        <p className="text-white text-sm">{label}</p>
      </TooltipContent>
    </Tooltip>
  ) : onClick ? (
    <button onClick={onClick} className="w-full">
      {itemContent}
    </button>
  ) : (
    <Link href={href}>{itemContent}</Link>
  );

  return wrappedContent;
};

SidebarItem.displayName = 'SidebarItem';

/**
 * Sidebar section header with collapse animation.
 */
export interface SidebarSectionProps {
  /** Section title */
  title: string;
  /** Whether sidebar is expanded */
  isExpanded: boolean;
  /** Child items */
  children: React.ReactNode;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  title,
  isExpanded,
  children,
}) => {
  return (
    <div className="space-y-1">
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.h4
            className="mb-2 px-3 text-xs font-semibold text-white/40 uppercase tracking-wider"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionConfig.transitions.fast}
          >
            {title}
          </motion.h4>
        ) : (
          <motion.div
            className="mx-auto my-2 h-px w-8 bg-white/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionConfig.transitions.fast}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      {children}
    </div>
  );
};

SidebarSection.displayName = 'SidebarSection';
