"use client";

/**
 * @fileoverview EmptyState component for displaying when no data is available.
 * Features Liquid Glass styling with icon and descriptive text.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={Users}
 *   title="Nenhum usuário encontrado"
 *   description="Tente ajustar os filtros ou adicione um novo usuário."
 *   action={{ label: "Adicionar Usuário", onClick: handleAdd }}
 * />
 * ```
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { type LucideIcon, FileQuestion } from 'lucide-react';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { motionConfig } from '@/lib/config/motion-configs';
import { Button } from '@/core/ui/button';

export interface EmptyStateAction {
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Button variant */
  variant?: 'default' | 'outline' | 'ghost';
}

export interface EmptyStateProps {
  /** Icon to display */
  icon?: LucideIcon;
  /** Main title */
  title: string;
  /** Descriptive text */
  description?: string;
  /** Optional action button */
  action?: EmptyStateAction;
  /** Secondary action button */
  secondaryAction?: EmptyStateAction;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Whether to show in a card container */
  card?: boolean;
}

const sizeClasses = {
  sm: {
    icon: 'h-8 w-8',
    title: 'text-base',
    description: 'text-xs',
    padding: 'py-6',
  },
  md: {
    icon: 'h-12 w-12',
    title: 'text-lg',
    description: 'text-sm',
    padding: 'py-8',
  },
  lg: {
    icon: 'h-16 w-16',
    title: 'text-xl',
    description: 'text-base',
    padding: 'py-12',
  },
};

/**
 * Empty state component for displaying when no data is available.
 * Provides clear messaging and optional actions.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className,
  card = false,
}) => {
  const sizes = sizeClasses[size];

  const content = (
    <motion.div
      className={cn(
        'flex flex-col items-center justify-center gap-4 text-center',
        sizes.padding,
        className
      )}
      variants={motionConfig.variants.fadeInUp}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={motionConfig.transitions.normal}
    >
      <motion.div
        className={cn(
          'rounded-full p-4',
          glassConfig.card.blur,
          glassConfig.card.background,
          glassConfig.card.border
        )}
        whileHover={{ scale: 1.05 }}
        transition={motionConfig.transitions.fast}
      >
        <Icon className={cn(sizes.icon, 'text-white/40')} aria-hidden="true" />
      </motion.div>

      <div className="space-y-1">
        <h3 className={cn('font-semibold text-white', sizes.title)}>
          {title}
        </h3>
        {description && (
          <p className={cn('text-white/60 max-w-sm', sizes.description)}>
            {description}
          </p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          {action && (
            <Button
              variant={action.variant || 'default'}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || 'outline'}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );

  if (card) {
    return (
      <div
        className={cn(
          'rounded-xl p-6',
          glassConfig.card.blur,
          glassConfig.card.background,
          glassConfig.card.border
        )}
      >
        {content}
      </div>
    );
  }

  return content;
};

EmptyState.displayName = 'EmptyState';
