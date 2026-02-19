"use client";

/**
 * @fileoverview ErrorState component for displaying error messages with retry option.
 * Features Liquid Glass styling with error icon and clear messaging.
 *
 * @example
 * ```tsx
 * <ErrorState
 *   title="Erro ao carregar dados"
 *   description="Não foi possível conectar ao servidor."
 *   onRetry={() => refetch()}
 * />
 * ```
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { motionConfig } from '@/lib/config/motion-configs';
import { Button } from '@/core/ui/button';
import { colors } from '@/lib/config/colors';

export interface ErrorStateProps {
  /** Error title */
  title?: string;
  /** Error description or message */
  description?: string;
  /** Error object (will extract message) */
  error?: Error | { message: string } | null;
  /** Retry callback */
  onRetry?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
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
 * Error state component with retry functionality.
 * Displays error information and provides a way to retry the failed operation.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Algo deu errado',
  description,
  error,
  onRetry,
  isRetrying = false,
  size = 'md',
  className,
  card = false,
}) => {
  const sizes = sizeClasses[size];
  const errorMessage = error?.message || description;

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
      role="alert"
      aria-live="assertive"
    >
      <motion.div
        className={cn(
          'rounded-full p-4',
          glassConfig.card.blur,
          'bg-red-500/10',
          'border border-red-500/20'
        )}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, ...motionConfig.transitions.normal }}
      >
        <AlertCircle
          className={cn(sizes.icon)}
          style={{ color: colors.rarity.artifact }}
          aria-hidden="true"
        />
      </motion.div>

      <div className="space-y-1">
        <h3 className={cn('font-semibold text-white', sizes.title)}>
          {title}
        </h3>
        {errorMessage && (
          <p className={cn('text-white/60 max-w-sm', sizes.description)}>
            {errorMessage}
          </p>
        )}
      </div>

      {onRetry && (
        <Button
          variant="outline"
          onClick={onRetry}
          disabled={isRetrying}
          className="mt-2 gap-2"
        >
          <RefreshCw
            className={cn('h-4 w-4', isRetrying && 'animate-spin')}
            aria-hidden="true"
          />
          {isRetrying ? 'Tentando novamente...' : 'Tentar novamente'}
        </Button>
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

ErrorState.displayName = 'ErrorState';
