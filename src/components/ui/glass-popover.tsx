"use client";

/**
 * @fileoverview GlassPopover wrapper applying Liquid Glass styling to Popover.
 * Re-exports core Popover with glassmorphism customization.
 */

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { GlassBackdrop } from "./glass-backdrop"

const GlassPopover = PopoverPrimitive.Root
const GlassPopoverTrigger = PopoverPrimitive.Trigger
const GlassPopoverAnchor = PopoverPrimitive.Anchor

/**
 * Glass-styled popover content with glassmorphism effects.
 */
const GlassPopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(
    ({ className, align = "center", sideOffset = 4, children, ...props }, ref) => (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                ref={ref}
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    "z-50 w-72 rounded-xl p-4 outline-none relative",
                    "border border-white/10",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out",
                    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
                    "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                    className,
                )}
                {...props}
            >
                <GlassBackdrop />
                {children}
            </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
    ),
)
GlassPopoverContent.displayName = 'GlassPopoverContent';

export { GlassPopover, GlassPopoverTrigger, GlassPopoverAnchor, GlassPopoverContent };
