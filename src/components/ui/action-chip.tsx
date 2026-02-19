'use client';

/**
 * @fileoverview ActionChip component for displaying audit log actions.
 * Provides color-coded chips for CREATE (green), UPDATE (blue), DELETE (red).
 *
 * @example
 * ```tsx
 * <ActionChip action="CREATE" />
 * <ActionChip action="UPDATE" showLabel={false} />
 * ```
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const actionChipVariants = cva(
  'inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors',
  {
    variants: {
      action: {
        CREATE: 'bg-green-500/20 text-green-400 border border-green-500/30',
        UPDATE: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
        DELETE: 'bg-red-500/20 text-red-400 border border-red-500/30',
      },
    },
    defaultVariants: {
      action: 'CREATE',
    },
  }
);

/** Audit action types */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

/** Localized labels for actions */
const actionLabels: Record<AuditAction, string> = {
  CREATE: 'Criado',
  UPDATE: 'Editado',
  DELETE: 'Excluído',
};

export interface ActionChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof actionChipVariants> {
  action: AuditAction;
  showLabel?: boolean;
}

export function ActionChip({
  action,
  showLabel = true,
  className,
  ...props
}: ActionChipProps) {
  return (
    <span
      className={cn(actionChipVariants({ action }), className)}
      {...props}
    >
      {showLabel ? actionLabels[action] : action}
    </span>
  );
}

ActionChip.displayName = 'ActionChip';
