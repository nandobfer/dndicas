'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Filter, X } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/core/ui/select';
import { Button } from '@/core/ui/button';
import { Input } from '@/core/ui/input';
import { Label } from '@/core/ui/label';
import { glassClasses } from '@/lib/config/glass-config';
import { fade } from '@/lib/config/motion-configs';
import type { AuditAction } from '../types/audit.types';
import type { AuditLogsFilterState } from '../hooks/useAuditLogsFilters';

interface AuditLogsFiltersProps {
  filters: AuditLogsFilterState;
  onActionChange: (action: AuditAction | undefined) => void;
  onActorEmailChange: (email: string | undefined) => void;
  onDateRangeChange: (startDate?: string, endDate?: string) => void;
  onReset: () => void;
}

const actionOptions: { value: AuditAction; label: string }[] = [
  { value: 'CREATE', label: 'Criado' },
  { value: 'UPDATE', label: 'Editado' },
  { value: 'DELETE', label: 'Excluído' },
];

export function AuditLogsFilters({
  filters,
  onActionChange,
  onActorEmailChange,
  onDateRangeChange,
  onReset,
}: AuditLogsFiltersProps) {
  const [localStartDate, setLocalStartDate] = React.useState(filters.startDate || '');
  const [localEndDate, setLocalEndDate] = React.useState(filters.endDate || '');

  const hasActiveFilters = !!(
    filters.action ||
    filters.actorEmail ||
    filters.startDate ||
    filters.endDate
  );

  const handleDateApply = () => {
    onDateRangeChange(localStartDate || undefined, localEndDate || undefined);
  };

  // Sync local state with filters
  React.useEffect(() => {
    setLocalStartDate(filters.startDate || '');
    setLocalEndDate(filters.endDate || '');
  }, [filters.startDate, filters.endDate]);

  return (
    <motion.div
      className={`${glassClasses.card} p-4`}
      {...fade}
    >
      <div className="flex items-center gap-2 mb-4">
        <Filter className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">Filtros</span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Action Filter */}
        <div className="space-y-2">
          <Label htmlFor="action-filter" className="text-xs text-muted-foreground">
            Ação
          </Label>
          <Select
            value={filters.action || 'all'}
            onValueChange={(value) => onActionChange(value === 'all' ? undefined : value as AuditAction)}
          >
            <SelectTrigger id="action-filter" className="bg-background/50">
              <SelectValue placeholder="Todas as ações" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              {actionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actor Email Filter */}
        <div className="space-y-2">
          <Label htmlFor="actor-filter" className="text-xs text-muted-foreground">
            Usuário
          </Label>
          <SearchInput
            id="actor-filter"
            placeholder="Buscar por email..."
            value={filters.actorEmail || ''}
            onChange={(value) => onActorEmailChange(value || undefined)}
            className="bg-background/50"
          />
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <Label htmlFor="start-date" className="text-xs text-muted-foreground">
            Data inicial
          </Label>
          <Input
            id="start-date"
            type="date"
            value={localStartDate}
            onChange={(e) => setLocalStartDate(e.target.value)}
            onBlur={handleDateApply}
            className="bg-background/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end-date" className="text-xs text-muted-foreground">
            Data final
          </Label>
          <Input
            id="end-date"
            type="date"
            value={localEndDate}
            onChange={(e) => setLocalEndDate(e.target.value)}
            onBlur={handleDateApply}
            className="bg-background/50"
          />
        </div>
      </div>
    </motion.div>
  );
}

AuditLogsFilters.displayName = 'AuditLogsFilters';
