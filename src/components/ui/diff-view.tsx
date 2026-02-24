'use client';

/**
 * @fileoverview DiffView component for displaying data differences.
 * Shows side-by-side comparison of before/after data with color-coded changes.
 *
 * Features:
 * - Auto-computes changes from previousData and newData
 * - Supports added (green), removed (red), changed (blue) states
 * - Filters internal fields (_id, createdAt, updatedAt)
 * - Provides localized field labels
 *
 * @example
 * ```tsx
 * <DiffView
 *   previousData={{ name: 'John', role: 'user' }}
 *   newData={{ name: 'John', role: 'admin' }}
 * />
 * ```
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import { glassClasses } from '@/lib/config/glass-config';

export interface DiffChange {
  field: string;
  before: unknown;
  after: unknown;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface DiffViewProps {
    previousData?: Record<string, unknown>
    newData?: Record<string, unknown>
    changes?: DiffChange[]
    className?: string
    renderValue?: (value: unknown, field: string) => React.ReactNode
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function computeChanges(
  previousData?: Record<string, unknown>,
  newData?: Record<string, unknown>
): DiffChange[] {
  const changes: DiffChange[] = [];
  const allKeys = new Set([
    ...Object.keys(previousData || {}),
    ...Object.keys(newData || {}),
  ]);

  for (const key of allKeys) {
    // Skip internal fields
    if (key.startsWith('_') || key === 'createdAt' || key === 'updatedAt') {
      continue;
    }

    const before = previousData?.[key];
    const after = newData?.[key];

    if (before === undefined && after !== undefined) {
      changes.push({ field: key, before, after, type: 'added' });
    } else if (before !== undefined && after === undefined) {
      changes.push({ field: key, before, after, type: 'removed' });
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ field: key, before, after, type: 'changed' });
    }
  }

  return changes;
}

const fieldLabels: Record<string, string> = {
  name: 'Nome',
  email: 'Email',
  role: 'Papel',
  status: 'Status',
  imageUrl: 'Avatar',
  clerkId: 'Clerk ID',
};

function getFieldLabel(field: string): string {
  return fieldLabels[field] || field;
}

export function DiffView({ previousData, newData, changes: providedChanges, className, renderValue }: DiffViewProps) {
    const changes = providedChanges || computeChanges(previousData, newData)

    if (changes.length === 0) {
        return <div className={cn("text-center text-muted-foreground py-6", className)}>Nenhuma alteração detectada</div>
    }

    return (
        <div className={cn("space-y-3", className)}>
            {changes.map((change) => (
                <div key={change.field} className={`${glassClasses.card} p-3 rounded-lg`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">{getFieldLabel(change.field)}</span>
                        <DiffBadge type={change.type} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Before */}
                        <div
                            className={cn(
                                "p-2 rounded text-sm font-mono",
                                change.type === "added"
                                    ? "bg-transparent text-muted-foreground/50"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                            )}
                        >
                            {change.type === "added" ? (
                                <span className="italic">vazio</span>
                            ) : renderValue ? (
                                renderValue(change.before, change.field)
                            ) : (
                                formatValue(change.before)
                            )}
                        </div>

                        {/* After */}
                        <div
                            className={cn(
                                "p-2 rounded text-sm font-mono",
                                change.type === "removed"
                                    ? "bg-transparent text-muted-foreground/50"
                                    : "bg-green-500/10 text-green-400 border border-green-500/20"
                            )}
                        >
                            {change.type === "removed" ? (
                                <span className="italic">removido</span>
                            ) : renderValue ? (
                                renderValue(change.after, change.field)
                            ) : (
                                formatValue(change.after)
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

function DiffBadge({ type }: { type: DiffChange['type'] }) {
  const config = {
    added: { label: 'Adicionado', className: 'bg-green-500/20 text-green-400' },
    removed: { label: 'Removido', className: 'bg-red-500/20 text-red-400' },
    changed: { label: 'Alterado', className: 'bg-blue-500/20 text-blue-400' },
    unchanged: { label: 'Inalterado', className: 'bg-gray-500/20 text-gray-400' },
  };

  const { label, className } = config[type];

  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full', className)}>
      {label}
    </span>
  );
}

DiffView.displayName = 'DiffView';
