"use client";

/**
 * @fileoverview GlassCard component with Liquid Glass styling.
 * Extends the core Card component with glassmorphism effects.
 *
 * @example
 * ```tsx
 * <GlassCard>
 *   <GlassCardHeader>
 *     <GlassCardTitle>Title</GlassCardTitle>
 *   </GlassCardHeader>
 *   <GlassCardContent>Content</GlassCardContent>
 * </GlassCard>
 * ```
 */

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { motionConfig } from '@/lib/config/motion-configs';

export interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Content to render inside the card */
  children?: React.ReactNode;
  /** Whether to animate on mount */
  animate?: boolean;
  /** Whether to show glow effect on hover */
  glowOnHover?: boolean;
}

/**
 * Card component with Liquid Glass glassmorphism effect.
 * Uses backdrop-blur with subtle transparency and glow borders.
 */
const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, animate = true, glowOnHover = true, children, ...props }, ref) => {
    const cardClasses = cn(
      'rounded-xl',
      glassConfig.card.blur,
      glassConfig.card.background,
      glassConfig.card.border,
      glassConfig.card.glow,
      glowOnHover && 'transition-shadow hover:ring-2 hover:ring-white/15',
      className
    );

    if (animate) {
      return (
        <motion.div
          ref={ref}
          className={cardClasses}
          variants={motionConfig.variants.fadeInUp}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={motionConfig.transitions.normal}
          whileHover={glowOnHover ? motionConfig.hover : undefined}
          {...props}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <div ref={ref} className={cardClasses} {...(props as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }
);
GlassCard.displayName = 'GlassCard';

/**
 * Header section for GlassCard.
 */
const GlassCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
GlassCardHeader.displayName = 'GlassCardHeader';

/**
 * Title for GlassCard header.
 */
const GlassCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'font-semibold leading-none tracking-tight text-white',
      className
    )}
    {...props}
  />
));
GlassCardTitle.displayName = 'GlassCardTitle';

/**
 * Description text for GlassCard header.
 */
const GlassCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-white/60', className)}
    {...props}
  />
));
GlassCardDescription.displayName = 'GlassCardDescription';

/**
 * Main content area for GlassCard.
 */
const GlassCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
GlassCardContent.displayName = 'GlassCardContent';

/**
 * Footer section for GlassCard.
 */
const GlassCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
GlassCardFooter.displayName = 'GlassCardFooter';

export {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardDescription,
  GlassCardContent,
  GlassCardFooter,
};
