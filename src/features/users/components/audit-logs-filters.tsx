'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { ActionMultiSelect } from '@/components/ui/action-multiselect';
import { PeriodFilter } from '@/components/ui/period-filter';
import { glassConfig } from '@/lib/config/glass-config';
import { fade } from '@/lib/config/motion-configs';
import { cn } from '@/core/utils';
import type { AuditAction } from '../types/audit.types';
import type { AuditLogsFilterState } from '../hooks/useAuditLogsFilters';

interface AuditLogsFiltersProps {
  filters: AuditLogsFilterState;
  onActionsChange: (actions: AuditAction[]) => void;
  onActorEmailChange: (email: string | undefined) => void;
  onDateRangeChange: (startDate?: string, endDate?: string) => void;
  onReset: () => void;
}

export function AuditLogsFilters({
  filters,
  onActionsChange,
  onActorEmailChange,
  onDateRangeChange,
  onReset,
}: AuditLogsFiltersProps) {
  const hasActiveFilters = !!(
    (filters.actions && filters.actions.length > 0) ||
    filters.actorEmail ||
    filters.startDate ||
    filters.endDate
  );

  return (
    <motion.div
      className={cn(
        glassConfig.card.blur,
        glassConfig.card.background,
        glassConfig.card.border,
        'p-4 rounded-lg'
      )}
      {...fade}
    >
      <div className="flex flex-col gap-4">
        {/* Search bar - full width */}
        <div className="w-full">
          <SearchInput
            placeholder="Buscar por email..."
            value={filters.actorEmail || ''}
            onChange={(value) => onActorEmailChange(value || undefined)}
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Action multiselect */}
          <ActionMultiSelect
            value={filters.actions || []}
            onChange={onActionsChange}
          />

          {/* Period filter */}
          <PeriodFilter
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={onDateRangeChange}
          />

          {/* Clear filters button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className={cn(
                'ml-auto px-3 py-2 rounded-lg text-sm font-medium',
                'text-white/60 hover:text-white',
                'bg-white/5 hover:bg-white/10',
                'border border-white/10',
                'transition-colors',
                'flex items-center gap-2'
              )}
            >
              <X className="h-3 w-3" />
              Limpar
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

AuditLogsFilters.displayName = 'AuditLogsFilters';
