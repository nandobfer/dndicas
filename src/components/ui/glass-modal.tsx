"use client";

/**
 * @fileoverview GlassModal component with Liquid Glass styling.
 * Wraps Radix Dialog with glassmorphism effects and Framer Motion animations.
 *
 * @example
 * ```tsx
 * <GlassModal open={open} onOpenChange={setOpen}>
 *   <GlassModalTrigger asChild>
 *     <Button>Open Modal</Button>
 *   </GlassModalTrigger>
 *   <GlassModalContent>
 *     <GlassModalHeader>
 *       <GlassModalTitle>Title</GlassModalTitle>
 *       <GlassModalDescription>Description</GlassModalDescription>
 *     </GlassModalHeader>
 *     <div>Content</div>
 *     <GlassModalFooter>
 *       <Button>Action</Button>
 *     </GlassModalFooter>
 *   </GlassModalContent>
 * </GlassModal>
 * ```
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { motionConfig } from '@/lib/config/motion-configs';
import { GlassBackdrop } from './glass-backdrop';

const GlassModal = DialogPrimitive.Root;

const GlassModalTrigger = DialogPrimitive.Trigger;

/**
 * Portal wrapper that centers modal content.
 */
const GlassModalPortal = ({ children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>) => (
  <DialogPrimitive.Portal {...props}>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {children}
    </div>
  </DialogPrimitive.Portal>
);

const GlassModalClose = DialogPrimitive.Close;

/**
 * Overlay backdrop with blur effect.
 */
const GlassModalOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay ref={ref} asChild {...props}>
        <motion.div
            className={cn("fixed inset-0 backdrop-blur-[2px]", className)}
            variants={motionConfig.variants.fade}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
        />
    </DialogPrimitive.Overlay>
))
GlassModalOverlay.displayName = "GlassModalOverlay"

export interface GlassModalContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    /** Hide the close button */
    hideCloseButton?: boolean
    /** Size variant */
    size?: "sm" | "md" | "lg" | "xl" | "full"
}

const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-4xl",
}

/**
 * Modal content with Liquid Glass styling.
 */
const GlassModalContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, GlassModalContentProps>(
    ({ className, children, hideCloseButton = false, size = "lg", ...props }, ref) => (
        <GlassModalPortal>
            <GlassModalOverlay />
            <DialogPrimitive.Content ref={ref} asChild {...props}>
                <motion.div
                    className={cn(
                        "w-full p-6 rounded-xl relative overflow-y-auto backdrop-blur-sm",
                        "border border-white/10 max-h-[90vh] custom-scrollbar",
                        sizeClasses[size],
                        className,
                    )}
                    variants={motionConfig.variants.scaleUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                >
                    <GlassBackdrop />
                    {children}
                    {!hideCloseButton && (
                        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm p-1 opacity-70 ring-offset-transparent transition-all hover:opacity-100 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 disabled:pointer-events-none">
                            <X className="h-4 w-4 text-white" />
                            <span className="sr-only">Fechar</span>
                        </DialogPrimitive.Close>
                    )}
                </motion.div>
            </DialogPrimitive.Content>
        </GlassModalPortal>
    ),
)
GlassModalContent.displayName = 'GlassModalContent';

/**
 * Header section for modal.
 */
const GlassModalHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
    {...props}
  />
);
GlassModalHeader.displayName = 'GlassModalHeader';

/**
 * Footer section for modal.
 */
const GlassModalFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className
    )}
    {...props}
  />
);
GlassModalFooter.displayName = 'GlassModalFooter';

/**
 * Modal title.
 */
const GlassModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-white', className)}
    {...props}
  />
));
GlassModalTitle.displayName = 'GlassModalTitle';

/**
 * Modal description.
 */
const GlassModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-white/60', className)}
    {...props}
  />
));
GlassModalDescription.displayName = 'GlassModalDescription';

export {
  GlassModal,
  GlassModalTrigger,
  GlassModalPortal,
  GlassModalClose,
  GlassModalOverlay,
  GlassModalContent,
  GlassModalHeader,
  GlassModalFooter,
  GlassModalTitle,
  GlassModalDescription,
};
