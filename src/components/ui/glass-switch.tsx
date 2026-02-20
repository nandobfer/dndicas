"use client";

/**
 * @fileoverview GlassSwitch component with Liquid Glass styling.
 * emerald-500 = active, white/5 = inactive.
 *
 * @see src/lib/config/glass-config.ts
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/core/utils';

export interface GlassSwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    /** Whether the switch is checked */
    checked?: boolean;
    /** Callback when status changes */
    onCheckedChange?: (checked: boolean) => void;
    /** Optional label */
    label?: string;
    /** Optional description */
    description?: string;
}

/**
 * A highly componentized switch with glassmorphism effects and Framer Motion animations.
 */
export const GlassSwitch = React.forwardRef<HTMLInputElement, GlassSwitchProps>(
    ({ checked = false, onCheckedChange, label, description, className, disabled, ...props }, ref) => {
        return (
            <div className={cn(
                "flex items-center gap-3 select-none",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}>
                <label className="relative inline-flex items-center cursor-pointer group">
                    <input
                        type="checkbox"
                        ref={ref}
                        className="sr-only"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => onCheckedChange?.(e.target.checked)}
                        {...props}
                    />
                    
                    {/* Track */}
                    <div className={cn(
                        "w-11 h-6 rounded-full transition-all duration-300 backdrop-blur-sm border",
                        checked 
                            ? "bg-emerald-500/20 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                            : "bg-white/5 border-white/10"
                    )}>
                        {/* Internal Glow when checked */}
                        {checked && (
                            <div className="absolute inset-0 rounded-full bg-emerald-500/5 blur-[2px]" />
                        )}
                    </div>

                    {/* Thumb */}
                    <motion.div
                        className={cn(
                            "absolute top-1 left-1 w-4 h-4 rounded-full shadow-lg z-10",
                            checked 
                                ? "bg-emerald-400 shadow-emerald-500/40" 
                                : "bg-white/40 shadow-black/20"
                        )}
                        initial={false}
                        animate={{
                            x: checked ? 20 : 0,
                        }}
                        transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 30
                        }}
                    >
                        {/* Visual highlight on thumb */}
                        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/0 to-white/30" />
                    </motion.div>
                </label>

                {(label || description) && (
                    <div className="flex flex-col">
                        {label && (
                            <span className="text-sm font-medium text-white/80 transition-colors">
                                {label}
                            </span>
                        )}
                        {description && (
                            <span className="text-xs text-white/40">
                                {description}
                            </span>
                        )}
                    </div>
                )}
            </div>
        );
    }
);

GlassSwitch.displayName = "GlassSwitch";
