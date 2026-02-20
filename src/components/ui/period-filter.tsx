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
    label: 'Hoje',
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        start: today.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'Última Semana',
    getRange: () => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
  {
    label: 'Último Mês',
    getRange: () => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      };
    },
  },
];

/**
 * Format date for display (simple version without date-fns).
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return dateStr;
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
          <div className="space-y-2">
            <label htmlFor="period-start" className="text-xs font-medium text-white/60">
              De
            </label>
            <input
              id="period-start"
              type="date"
              value={localStartDate}
              onChange={(e) => setLocalStartDate(e.target.value)}
              className={cn(
                'w-full h-9 px-3 rounded-lg text-sm',
                'text-white placeholder:text-white/40',
                glassConfig.input.blur,
                glassConfig.input.background,
                glassConfig.input.border,
                'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
              )}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="period-end" className="text-xs font-medium text-white/60">
              Até
            </label>
            <input
              id="period-end"
              type="date"
              value={localEndDate}
              onChange={(e) => setLocalEndDate(e.target.value)}
              className={cn(
                'w-full h-9 px-3 rounded-lg text-sm',
                'text-white placeholder:text-white/40',
                glassConfig.input.blur,
                glassConfig.input.background,
                glassConfig.input.border,
                'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
              )}
            />
          </div>

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
