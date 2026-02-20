"use client";

/**
 * @fileoverview GlassInput component with Liquid Glass styling.
 * Standardized input for forms and search with icon and error support.
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { glassConfig } from '@/lib/config/glass-config';

export interface GlassInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label text */
  label?: string;
  /** Error message */
  error?: string;
  /** Icon shown on the left */
  icon?: React.ReactNode;
  /** Element shown on the right (buttons, etc) */
  rightElement?: React.ReactNode;
  /** Container class name */
  containerClassName?: string;
  /** Whether the field is required (shows asterisk) */
  required?: boolean;
}

/**
 * GlassInput component with glassmorphism effects and error handling.
 */
const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  (
    {
      label,
      error,
      icon,
      rightElement,
      required,
      className,
      containerClassName,
      id,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn("space-y-2 w-full", containerClassName)}>
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-white/80"
          >
            {label} {required && <span className="text-rose-400">*</span>}
          </label>
        )}
        
        <div className="relative group">
          {/* Left Icon */}
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-blue-400 transition-colors z-10 pointer-events-none">
              {React.isValidElement(icon) ? (
                React.cloneElement(icon as React.ReactElement<any>, { className: cn("h-4 w-4", (icon as any).props.className) })
              ) : icon}
            </div>
          )}

          {/* Input */}
          <input
            id={id}
            ref={ref}
            className={cn(
              "w-full h-10 rounded-lg text-sm transition-all outline-none",
              "text-white placeholder:text-white/40",
              glassConfig.input.background,
              glassConfig.input.blur,
              glassConfig.input.border,
              "focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
              icon ? "pl-10" : "pl-4",
              rightElement ? "pr-10" : "pr-4",
              error && "border-rose-500/50 focus:ring-rose-500/30",
              className
            )}
            {...props}
          />

          {/* Right Element (Loading, Clear button, etc) */}
          {rightElement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center z-10">
              {rightElement}
            </div>
          )}

          {/* Additional children (bars, overlays, etc) */}
          {children}
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-xs text-rose-400 font-medium"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

GlassInput.displayName = 'GlassInput';

export { GlassInput };
