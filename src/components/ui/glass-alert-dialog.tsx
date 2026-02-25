"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/core/utils";
import { buttonVariants } from "@/core/ui/button";
import { GlassBackdrop } from "./glass-backdrop";

const GlassAlertDialog = AlertDialogPrimitive.Root;
const GlassAlertDialogTrigger = AlertDialogPrimitive.Trigger;
const GlassAlertDialogPortal = AlertDialogPrimitive.Portal;

const GlassAlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
GlassAlertDialogOverlay.displayName = "GlassAlertDialogOverlay";

const GlassAlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <GlassAlertDialogPortal>
    <GlassAlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-white/10 bg-zinc-950/40 p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl overflow-hidden",
        className
      )}
      {...props}
    >
      <GlassBackdrop />
      <div className="relative z-10">{props.children}</div>
    </AlertDialogPrimitive.Content>
  </GlassAlertDialogPortal>
));
GlassAlertDialogContent.displayName = "GlassAlertDialogContent";

const GlassAlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left relative z-10",
      className
    )}
    {...props}
  />
);
GlassAlertDialogHeader.displayName = "GlassAlertDialogHeader";

const GlassAlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 relative z-10",
      className
    )}
    {...props}
  />
);
GlassAlertDialogFooter.displayName = "GlassAlertDialogFooter";

const GlassAlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-bold text-white", className)}
    {...props}
  />
));
GlassAlertDialogTitle.displayName = "GlassAlertDialogTitle";

const GlassAlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-white/60", className)}
    {...props}
  />
));
GlassAlertDialogDescription.displayName = "GlassAlertDialogDescription";

const GlassAlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
));
GlassAlertDialogAction.displayName = "GlassAlertDialogAction";

const GlassAlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      buttonVariants({ variant: "outline" }),
      "mt-2 sm:mt-0 border-white/10 hover:bg-white/5",
      className
    )}
    {...props}
  />
));
GlassAlertDialogCancel.displayName = "GlassAlertDialogCancel";

export {
  GlassAlertDialog,
  GlassAlertDialogTrigger,
  GlassAlertDialogContent,
  GlassAlertDialogHeader,
  GlassAlertDialogFooter,
  GlassAlertDialogTitle,
  GlassAlertDialogDescription,
  GlassAlertDialogAction,
  GlassAlertDialogCancel,
};
