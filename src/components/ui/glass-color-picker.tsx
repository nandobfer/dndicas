"use client";

import * as React from "react";
import { Check, Palette } from "lucide-react";
import { rarityColors } from "@/lib/config/colors";
import { cn } from "@/core/utils";
import { motion, AnimatePresence } from "framer-motion";
import { GlassPopover, GlassPopoverTrigger, GlassPopoverContent } from "./glass-popover";

interface GlassColorPickerProps {
    value?: string;
    onChange: (color: string) => void;
    label?: string;
    disabled?: boolean;
    className?: string;
}

/**
 * Modern Glass Color Picker using GlassPopover and Liquid Glass design.
 */
export function GlassColorPicker({ value, onChange, label, disabled = false, className }: GlassColorPickerProps) {
    const colors = Object.entries(rarityColors).map(([name, hex]) => ({
        name,
        hex,
    }));

    const currentColor = colors.find(c => c.hex === value) || colors[0];

    return (
        <div className={cn("space-y-1.5", className)}>
            {label && (
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">
                    {label}
                </label>
            )}
            
            <GlassPopover>
                <GlassPopoverTrigger asChild>
                    <button
                        type="button"
                        disabled={disabled}
                        className={cn(
                            "flex items-center gap-2 px-2.5 h-10 rounded-lg border transition-all text-left min-w-[40px]",
                            "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
                            "focus:outline-none focus:ring-1 focus:ring-white/20",
                            disabled && "opacity-50 cursor-not-allowed"
                        )}
                        title={currentColor.name}
                    >
                        <div 
                            className="h-4 w-4 rounded-full border border-white/20 shadow-inner shrink-0" 
                            style={{ 
                                backgroundColor: value || rarityColors.common,
                                boxShadow: `0 0 10px ${value}40`
                            }}
                        />
                        <Palette className="h-3.5 w-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
                    </button>
                </GlassPopoverTrigger>

                <GlassPopoverContent align="start" className="w-[180px] p-3">
                    <div className="grid grid-cols-4 gap-2">
                        {colors.map((color) => (
                            <button
                                key={color.name}
                                type="button"
                                title={color.name}
                                onClick={() => onChange(color.hex)}
                                className={cn(
                                    "aspect-square rounded-full border-2 transition-all flex items-center justify-center relative group",
                                    value === color.hex ? "border-white/60 scale-110" : "border-white/5 hover:border-white/20 hover:scale-105"
                                )}
                                style={{ 
                                    backgroundColor: color.hex,
                                    boxShadow: value === color.hex ? `0 0 12px ${color.hex}60` : 'none'
                                }}
                            >
                                <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 bg-white/10 transition-opacity" />
                                {value === color.hex && (
                                    <Check className="h-3 w-3 text-white drop-shadow-md z-10" />
                                )}
                            </button>
                        ))}
                    </div>
                </GlassPopoverContent>
            </GlassPopover>
        </div>
    );
}
