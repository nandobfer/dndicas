"use client";

/**
 * @fileoverview LoadingState component for displaying loading indicators.
 * Features Liquid Glass styling with animated skeleton elements.
 *
 * @example
 * ```tsx
 * <LoadingState message="Carregando dados..." />
 * <LoadingState variant="skeleton" lines={3} />
 * <LoadingState variant="spinner" size="lg" />
 * ```
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { motionConfig } from '@/lib/config/motion-configs';

export interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Visual variant */
  variant?: 'spinner' | 'skeleton' | 'dots';
  /** Size of the loading indicator */
  size?: 'sm' | 'md' | 'lg';
  /** Number of skeleton lines (for skeleton variant) */
  lines?: number;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show in a card container */
  card?: boolean;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

/**
 * Spinner loading indicator with rotation animation.
 */
const Spinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => (
  <Loader2
    className={cn(sizeClasses[size], 'animate-spin text-white/60')}
    aria-hidden="true"
  />
);

/**
 * Skeleton loading lines with shimmer effect.
 */
const SkeletonLines = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-3 w-full">
    {Array.from({ length: lines }).map((_, i) => (
      <motion.div
        key={i}
        className={cn(
          'h-4 rounded bg-white/10',
          i === lines - 1 ? 'w-2/3' : 'w-full'
        )}
        variants={motionConfig.variants.pulse}
        animate="animate"
        style={{ animationDelay: `${i * 0.1}s` }}
      />
    ))}
  </div>
);

/**
 * Animated dots loading indicator.
 */
const LoadingDots = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const dotSize = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-3 w-3',
  };

  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={cn(dotSize[size], 'rounded-full bg-white/60')}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
};

/**
 * Loading state component with multiple variants.
 * Displays a loading indicator with optional message.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  message,
  variant = 'spinner',
  size = 'md',
  lines = 3,
  className,
  card = false,
}) => {
  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-8',
        className
      )}
      role="status"
      aria-label={message || 'Carregando...'}
    >
      {variant === 'spinner' && <Spinner size={size} />}
      {variant === 'skeleton' && <SkeletonLines lines={lines} />}
      {variant === 'dots' && <LoadingDots size={size} />}

      {message && variant !== 'skeleton' && (
        <p className={cn('text-white/60', textSizeClasses[size])}>
          {message}
        </p>
      )}

      <span className="sr-only">{message || 'Carregando...'}</span>
    </div>
  );

  if (card) {
    return (
      <motion.div
        className={cn(
          'rounded-xl p-6',
          glassConfig.card.blur,
          glassConfig.card.background,
          glassConfig.card.border
        )}
        variants={motionConfig.variants.fadeInUp}
        initial="initial"
        animate="animate"
      >
        {content}
      </motion.div>
    );
  }

  return content;
};

LoadingState.displayName = 'LoadingState';
