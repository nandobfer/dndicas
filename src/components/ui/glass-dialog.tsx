"use client";

/**
 * @fileoverview GlassDialog wrapper applying Liquid Glass styling to Dialog.
 * Re-exports core Dialog with glassmorphism customization.
 *
 * This is a convenience re-export that provides pre-styled glass variants.
 * For full customization, use the GlassModal component instead.
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';

// Re-export base components
const GlassDialog = DialogPrimitive.Root;
const GlassDialogTrigger = DialogPrimitive.Trigger;
const GlassDialogPortal = DialogPrimitive.Portal;
const GlassDialogClose = DialogPrimitive.Close;

/**
 * Glass-styled dialog overlay with blur effect.
 */
const GlassDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
GlassDialogOverlay.displayName = 'GlassDialogOverlay';

/**
 * Glass-styled dialog content with glassmorphism effects.
 */
const GlassDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <GlassDialogPortal>
    <GlassDialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 p-6 rounded-xl',
        glassConfig.overlay.blur,
        glassConfig.overlay.background,
        glassConfig.overlay.border,
        glassConfig.overlay.shadow,
        'duration-200',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
        'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-transparent transition-all hover:opacity-100 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:pointer-events-none">
        <X className="h-4 w-4 text-white" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </GlassDialogPortal>
));
GlassDialogContent.displayName = 'GlassDialogContent';

/**
 * Glass dialog header.
 */
const GlassDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
    {...props}
  />
);
GlassDialogHeader.displayName = 'GlassDialogHeader';

/**
 * Glass dialog footer.
 */
const GlassDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);
GlassDialogFooter.displayName = 'GlassDialogFooter';

/**
 * Glass dialog title.
 */
const GlassDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-white', className)}
    {...props}
  />
));
GlassDialogTitle.displayName = 'GlassDialogTitle';

/**
 * Glass dialog description.
 */
const GlassDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-white/60', className)}
    {...props}
  />
));
GlassDialogDescription.displayName = 'GlassDialogDescription';

export {
  GlassDialog,
  GlassDialogTrigger,
  GlassDialogPortal,
  GlassDialogClose,
  GlassDialogOverlay,
  GlassDialogContent,
  GlassDialogHeader,
  GlassDialogFooter,
  GlassDialogTitle,
  GlassDialogDescription,
};
