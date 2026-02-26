"use client";

/**
 * @fileoverview GlassDropdownMenu wrapper applying Liquid Glass styling.
 * Re-exports core DropdownMenu with glassmorphism customization.
 */

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion"
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { GlassBackdrop } from "./glass-backdrop"

const GlassDropdownMenu = DropdownMenuPrimitive.Root
const GlassDropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const GlassDropdownMenuGroup = DropdownMenuPrimitive.Group
const GlassDropdownMenuPortal = DropdownMenuPrimitive.Portal
const GlassDropdownMenuSub = DropdownMenuPrimitive.Sub
const GlassDropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

/**
 * Glass-styled dropdown menu content.
 */
const GlassDropdownMenuContent = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, children, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                "z-50 min-w-[8rem] overflow-hidden rounded-xl p-1 relative backdrop-blur-md",
                "border border-white/10 shadow-2xl shadow-black/50",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                "data-[side=bottom]:slide-in-from-top-4 data-[side=left]:slide-in-from-right-4",
                "data-[side=right]:slide-in-from-left-4 data-[side=top]:slide-in-from-bottom-4",
                "duration-300 ease-out",
                className
            )}
            {...props}
        >
            <GlassBackdrop />
            <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                    mass: 0.5
                }}
            >
                {children}
            </motion.div>
        </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
))
GlassDropdownMenuContent.displayName = 'GlassDropdownMenuContent';

/**
 * Glass-styled dropdown menu item.
 */
const GlassDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/80 outline-none transition-colors',
      'focus:bg-white/10 focus:text-white',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      '[&>svg]:size-4 [&>svg]:shrink-0',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
));
GlassDropdownMenuItem.displayName = 'GlassDropdownMenuItem';

/**
 * Glass dropdown menu checkbox item.
 */
const GlassDropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm text-white/80 outline-none transition-colors',
      'focus:bg-white/10 focus:text-white',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
GlassDropdownMenuCheckboxItem.displayName = 'GlassDropdownMenuCheckboxItem';

/**
 * Glass dropdown radio item.
 */
const GlassDropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm text-white/80 outline-none transition-colors',
      'focus:bg-white/10 focus:text-white',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
GlassDropdownMenuRadioItem.displayName = 'GlassDropdownMenuRadioItem';

/**
 * Glass dropdown label.
 */
const GlassDropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-2 py-1.5 text-xs font-semibold text-white/40 uppercase tracking-wider',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
));
GlassDropdownMenuLabel.displayName = 'GlassDropdownMenuLabel';

/**
 * Glass dropdown separator.
 */
const GlassDropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-white/10', className)}
    {...props}
  />
));
GlassDropdownMenuSeparator.displayName = 'GlassDropdownMenuSeparator';

/**
 * Glass dropdown shortcut text.
 */
const GlassDropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn('ml-auto text-xs tracking-widest text-white/40', className)}
    {...props}
  />
);
GlassDropdownMenuShortcut.displayName = 'GlassDropdownMenuShortcut';

/**
 * Glass dropdown sub-trigger.
 */
const GlassDropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/80 outline-none',
      'focus:bg-white/10 data-[state=open]:bg-white/10',
      '[&>svg]:size-4 [&>svg]:shrink-0',
      inset && 'pl-8',
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubTrigger>
));
GlassDropdownMenuSubTrigger.displayName = 'GlassDropdownMenuSubTrigger';

/**
 * Glass dropdown sub-content.
 */
const GlassDropdownMenuSubContent = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.SubContent
        ref={ref}
        className={cn(
            "z-50 min-w-[8rem] overflow-hidden rounded-xl p-1 backdrop-blur-md relative",
            "border border-white/10 shadow-2xl shadow-black/50",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-4 data-[side=left]:slide-in-from-right-4",
            "data-[side=right]:slide-in-from-left-4 data-[side=top]:slide-in-from-bottom-4",
            "duration-300 ease-out",
            className
        )}
        {...props}
    >
        <GlassBackdrop />
        <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
                mass: 0.5
            }}
        >
            {children}
        </motion.div>
    </DropdownMenuPrimitive.SubContent>
))
GlassDropdownMenuSubContent.displayName = 'GlassDropdownMenuSubContent';

export {
  GlassDropdownMenu,
  GlassDropdownMenuTrigger,
  GlassDropdownMenuContent,
  GlassDropdownMenuItem,
  GlassDropdownMenuCheckboxItem,
  GlassDropdownMenuRadioItem,
  GlassDropdownMenuLabel,
  GlassDropdownMenuSeparator,
  GlassDropdownMenuShortcut,
  GlassDropdownMenuGroup,
  GlassDropdownMenuPortal,
  GlassDropdownMenuSub,
  GlassDropdownMenuSubContent,
  GlassDropdownMenuSubTrigger,
  GlassDropdownMenuRadioGroup,
};
