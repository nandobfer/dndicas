"use client";

/**
 * @fileoverview SidebarToggleButton for expanding/collapsing the sidebar.
 * Used in the topbar/header area.
 *
 * @example
 * ```tsx
 * <SidebarToggleButton isExpanded={isExpanded} onToggle={toggle} />
 * ```
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { Menu, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/core/utils';
import { Button } from '@/core/ui/button';
import { motionConfig } from '@/lib/config/motion-configs';

export interface SidebarToggleButtonProps {
  /** Whether sidebar is currently expanded */
  isExpanded: boolean;
  /** Toggle callback */
  onToggle: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Variant for different contexts */
  variant?: 'default' | 'mobile';
}

/**
 * Button to toggle sidebar expand/collapse state.
 * Shows different icons based on current state.
 */
export const SidebarToggleButton: React.FC<SidebarToggleButtonProps> = ({
  isExpanded,
  onToggle,
  className,
  variant = 'default',
}) => {
  // Choose icon based on state
  const Icon = variant === 'mobile' ? Menu : isExpanded ? PanelLeftClose : PanelLeft;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className={cn(
        'h-9 w-9 shrink-0',
        'hover:bg-white/10',
        'text-white/70 hover:text-white',
        className
      )}
      aria-label={isExpanded ? 'Recolher menu' : 'Expandir menu'}
      aria-expanded={isExpanded}
    >
      <motion.div
        key={isExpanded ? 'expanded' : 'collapsed'}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        exit={{ rotate: 90, opacity: 0 }}
        transition={motionConfig.transitions.fast}
      >
        <Icon className="h-5 w-5" />
      </motion.div>
    </Button>
  );
};

SidebarToggleButton.displayName = 'SidebarToggleButton';
