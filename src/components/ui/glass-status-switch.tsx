/**
 * @fileoverview Reusable status switch component following the glassmorphism pattern.
 * Renders a container with entity label, description, and a toggle switch.
 *
 * Used in all form modals (rules, traits, feats, spells) for the status field.
 */

"use client";

import { cn } from "@/core/utils";
import { GlassSwitch } from "@/components/ui/glass-switch";

export interface GlassStatusSwitchProps {
    /** Label text shown above description, e.g. "Status da Regra" */
    entityLabel: string;
    /** Description text shown below the label */
    description: string;
    /** Whether the switch is checked (active) */
    checked: boolean;
    /** Callback when the switch is toggled */
    onCheckedChange: (checked: boolean) => void;
    /** Whether the switch is disabled */
    disabled?: boolean;
    /** Additional class names for the container */
    className?: string;
}

/**
 * GlassStatusSwitch
 *
 * A consistent status switch container used across all entity form modals.
 *
 * @example
 * ```tsx
 * <GlassStatusSwitch
 *   entityLabel="Status da Regra"
 *   description="Regras inativas não aparecem nas buscas públicas"
 *   checked={watch("status") === "active"}
 *   onCheckedChange={(checked) => setValue("status", checked ? "active" : "inactive")}
 *   disabled={isSubmitting}
 * />
 * ```
 */
export function GlassStatusSwitch({
    entityLabel,
    description,
    checked,
    onCheckedChange,
    disabled,
    className,
}: GlassStatusSwitchProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10",
                className,
            )}
        >
            <div className="space-y-0.5">
                <label className="text-sm font-medium text-white">{entityLabel}</label>
                <p className="text-xs text-white/60">{description}</p>
            </div>
            <GlassSwitch
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
            />
        </div>
    );
}
