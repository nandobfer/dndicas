"use client";

import * as React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/core/utils";

interface GlassInlineEmptyStateProps extends Omit<HTMLMotionProps<"div">, "children"> {
    message: string;
    className?: string;
}

/**
 * Minimalist empty state for within forms or lists with glassmorphism effects.
 * Displays a message centered inside a dashed border container.
 */
export function GlassInlineEmptyState({ message, className, ...props }: GlassInlineEmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
                "text-sm text-white/40 italic text-center py-4 bg-white/5 border border-dashed border-white/10 rounded-xl",
                className
            )}
            {...props}
        >
            {message}
        </motion.div>
    );
}

GlassInlineEmptyState.displayName = "GlassInlineEmptyState";
