"use client";

/**
 * @fileoverview GlassSheet wrapper applying Liquid Glass styling to Sheet.
 * Re-exports core Sheet with glassmorphism customization.
 */

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { GlassBackdrop } from "./glass-backdrop"

const GlassSheet = SheetPrimitive.Root
const GlassSheetTrigger = SheetPrimitive.Trigger
const GlassSheetClose = SheetPrimitive.Close
const GlassSheetPortal = SheetPrimitive.Portal

/**
 * Glass sheet overlay.
 */
const GlassSheetOverlay = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>>(({ className, ...props }, ref) => (
    <SheetPrimitive.Overlay
        className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            className,
        )}
        {...props}
        ref={ref}
    />
))
GlassSheetOverlay.displayName = "GlassSheetOverlay"

const sheetVariants = cva(
    cn("fixed z-50 gap-4 p-6 transition ease-in-out relative", "data-[state=closed]:duration-300 data-[state=open]:duration-500", "data-[state=open]:animate-in data-[state=closed]:animate-out"),
    {
        variants: {
            side: {
                top: "inset-x-0 top-0 border-b border-white/5 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
                bottom: "inset-x-0 bottom-0 border-t border-white/5 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                left: "inset-y-0 left-0 h-full w-3/4 border-r border-white/5 sm:max-w-sm data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
                right: "inset-y-0 right-0 h-full w-3/4 border-l border-white/5 sm:max-w-sm data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            },
        },
        defaultVariants: {
            side: "right",
        },
    },
)

export interface GlassSheetContentProps extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>, VariantProps<typeof sheetVariants> {
    hideCloseButton?: boolean
}

/**
 * Glass-styled sheet content.
 */
const GlassSheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, GlassSheetContentProps>(
    ({ side = "right", className, children, hideCloseButton = false, ...props }, ref) => (
        <GlassSheetPortal>
            <GlassSheetOverlay />
            <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
                <GlassBackdrop />
                {!hideCloseButton && (
                    <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-transparent transition-all hover:opacity-100 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:pointer-events-none">
                        <X className="h-4 w-4 text-white" />
                        <span className="sr-only">Fechar</span>
                    </SheetPrimitive.Close>
                )}
                {children}
            </SheetPrimitive.Content>
        </GlassSheetPortal>
    ),
)
GlassSheetContent.displayName = 'GlassSheetContent';

/**
 * Glass sheet header.
 */
const GlassSheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-2 text-center sm:text-left', className)}
    {...props}
  />
);
GlassSheetHeader.displayName = 'GlassSheetHeader';

/**
 * Glass sheet footer.
 */
const GlassSheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);
GlassSheetFooter.displayName = 'GlassSheetFooter';

/**
 * Glass sheet title.
 */
const GlassSheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-white', className)}
    {...props}
  />
));
GlassSheetTitle.displayName = 'GlassSheetTitle';

/**
 * Glass sheet description.
 */
const GlassSheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-white/60', className)}
    {...props}
  />
));
GlassSheetDescription.displayName = 'GlassSheetDescription';

export {
  GlassSheet,
  GlassSheetTrigger,
  GlassSheetClose,
  GlassSheetPortal,
  GlassSheetOverlay,
  GlassSheetContent,
  GlassSheetHeader,
  GlassSheetFooter,
  GlassSheetTitle,
  GlassSheetDescription,
};
