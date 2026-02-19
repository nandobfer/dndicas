"use client";

/**
 * @fileoverview GlassTooltip component with Liquid Glass styling.
 * Provides accessible tooltip with glassmorphism effects.
 */

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';

/**
 * TooltipProvider wrapper - must wrap components using tooltips.
 */
const GlassTooltipProvider = TooltipPrimitive.Provider;

/**
 * Tooltip root component.
 */
const GlassTooltip = TooltipPrimitive.Root;

/**
 * Tooltip trigger - the element that triggers the tooltip on hover.
 */
const GlassTooltipTrigger = TooltipPrimitive.Trigger;

/**
 * Glass-styled tooltip content with glassmorphism effects.
 *
 * @example
 * ```tsx
 * <GlassTooltipProvider>
 *   <GlassTooltip>
 *     <GlassTooltipTrigger asChild>
 *       <button>Hover me</button>
 *     </GlassTooltipTrigger>
 *     <GlassTooltipContent>
 *       <p>Tooltip content</p>
 *     </GlassTooltipContent>
 *   </GlassTooltip>
 * </GlassTooltipProvider>
 * ```
 */
const GlassTooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-lg px-3 py-1.5 text-sm',
        glassConfig.tooltip.blur,
        glassConfig.tooltip.background,
        glassConfig.tooltip.border,
        glassConfig.tooltip.text,
        'animate-in fade-in-0 zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2',
        'data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2',
        'data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
GlassTooltipContent.displayName = 'GlassTooltipContent';

/**
 * Convenience component that provides a complete tooltip setup.
 * Use this when you need a simple tooltip without much customization.
 */
interface SimpleGlassTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
  className?: string;
}

const SimpleGlassTooltip = ({
  content,
  children,
  side = 'top',
  delayDuration = 200,
  className,
}: SimpleGlassTooltipProps) => (
  <GlassTooltip delayDuration={delayDuration}>
    <GlassTooltipTrigger asChild>{children}</GlassTooltipTrigger>
    <GlassTooltipContent side={side} className={className}>
      {content}
    </GlassTooltipContent>
  </GlassTooltip>
);
SimpleGlassTooltip.displayName = 'SimpleGlassTooltip';

export {
  GlassTooltip,
  GlassTooltipTrigger,
  GlassTooltipContent,
  GlassTooltipProvider,
  SimpleGlassTooltip,
};
