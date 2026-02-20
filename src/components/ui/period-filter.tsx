"use client";

/**
 * @fileoverview PeriodFilter component for date range selection.
 * Displays a button that opens a popover with date inputs and quick presets.
 */

import * as React from 'react';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/core/utils';
import {
  GlassPopover,
  GlassPopoverContent,
  GlassPopoverTrigger,
} from '@/components/ui/glass-popover';
import { GlassInput } from '@/components/ui/glass-input';
import { glassConfig } from '@/lib/config/glass-config';

export interface PeriodFilterProps {
  /** Start date (ISO string or empty) */
  startDate?: string;
  /** End date (ISO string or empty) */
  endDate?: string;
  /** Callback when dates change */
  onChange: (startDate?: string, endDate?: string) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Quick preset options for date range selection.
 */
const presets = [
    {
        label: "Hoje",
        getRange: () => {
            const d = new Date()
            const year = d.getFullYear()
            const month = String(d.getMonth() + 1).padStart(2, "0")
            const day = String(d.getDate()).padStart(2, "0")
            const localStr = `${year}-${month}-${day}`
            return {
                start: localStr,
                end: localStr,
            }
        },
    },
    {
        label: "Última Semana",
        getRange: () => {
            const now = new Date()
            const start = new Date()
            start.setDate(now.getDate() - 7)

            const toISO = (d: Date) => {
                const y = d.getFullYear()
                const m = String(d.getMonth() + 1).padStart(2, "0")
                const day = String(d.getDate()).padStart(2, "0")
                return `${y}-${m}-${day}`
            }

            return {
                start: toISO(start),
                end: toISO(now),
            }
        },
    },
    {
        label: "Último Mês",
        getRange: () => {
            const now = new Date()
            const start = new Date()
            start.setMonth(now.getMonth() - 1)

            const toISO = (d: Date) => {
                const y = d.getFullYear()
                const m = String(d.getMonth() + 1).padStart(2, "0")
                const day = String(d.getDate()).padStart(2, "0")
                return `${y}-${m}-${day}`
            }

            return {
                start: toISO(start),
                end: toISO(now),
            }
        },
    },
]

/**
 * Format date for display (simple version without date-fns).
 */
function formatDate(dateStr: string): string {
    try {
        const [year, month, day] = dateStr.split("-").map(Number)
        const date = new Date(year, month - 1, day)
        return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    } catch {
        return dateStr
    }
}

/**
 * Format date range for display.
 */
function formatDateRange(startDate?: string, endDate?: string): string {
  if (!startDate && !endDate) return 'Período';
  
  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }
  
  if (startDate) {
    return `A partir de ${formatDate(startDate)}`;
  }
  
  if (endDate) {
    return `Até ${formatDate(endDate)}`;
  }
  
  return 'Período';
}

/**
 * PeriodFilter component with date range selection and quick presets.
 *
 * @example
 * ```tsx
 * <PeriodFilter
 *   startDate={filters.startDate}
 *   endDate={filters.endDate}
 *   onChange={(start, end) => setFilters({ ...filters, startDate: start, endDate: end })}
 * />
 * ```
 */
export function PeriodFilter({
  startDate,
  endDate,
  onChange,
  className,
}: PeriodFilterProps) {
  const [localStartDate, setLocalStartDate] = React.useState(startDate || '');
  const [localEndDate, setLocalEndDate] = React.useState(endDate || '');
  const [isOpen, setIsOpen] = React.useState(false);

  // Sync local state with props
  React.useEffect(() => {
    setLocalStartDate(startDate || '');
    setLocalEndDate(endDate || '');
  }, [startDate, endDate]);

  const handleApply = () => {
    onChange(localStartDate || undefined, localEndDate || undefined);
    setIsOpen(false);
  };

  const handlePreset = (preset: typeof presets[0]) => {
    const range = preset.getRange();
    setLocalStartDate(range.start);
    setLocalEndDate(range.end);
    onChange(range.start, range.end);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalStartDate('');
    setLocalEndDate('');
    onChange(undefined, undefined);
  };

  const hasValue = !!startDate || !!endDate;

  return (
    <GlassPopover open={isOpen} onOpenChange={setIsOpen}>
      <GlassPopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            'flex items-center gap-2',
            glassConfig.input.blur,
            glassConfig.input.background,
            glassConfig.input.border,
            'hover:border-white/20',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
            hasValue ? 'text-white' : 'text-white/60',
            className
          )}
        >
          <Calendar className="h-4 w-4" />
          <span>{formatDateRange(startDate, endDate)}</span>
          {hasValue && (
            <X
              className="h-3 w-3 ml-1 hover:text-rose-400"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            />
          )}
        </button>
      </GlassPopoverTrigger>
      <GlassPopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <GlassInput
            id="period-start"
            label="De"
            type="date"
            value={localStartDate}
            onChange={(e) => setLocalStartDate(e.target.value)}
            className="h-9"
          />

          <GlassInput
            id="period-end"
            label="Até"
            type="date"
            value={localEndDate}
            onChange={(e) => setLocalEndDate(e.target.value)}
            className="h-9"
          />

          <div className="pt-2 border-t border-white/10">
            <p className="text-xs font-medium text-white/60 mb-2">Seleção Rápida</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium',
                    'bg-white/5 text-white/70 border border-white/10',
                    'hover:bg-white/10 hover:text-white',
                    'transition-colors'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-md text-sm text-white/60 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3 py-1.5 rounded-md text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      </GlassPopoverContent>
    </GlassPopover>
  );
}
