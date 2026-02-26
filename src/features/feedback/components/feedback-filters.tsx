"use client";

import { SearchInput } from '@/components/ui/search-input';
import { GlassSelector } from '@/components/ui/glass-selector';
import { feedbackStatusConfig, feedbackPriorityConfig, FeedbackStatus, FeedbackPriority } from '@/lib/config/colors';
import { cn } from '@/core/utils';
import type { FeedbackFilters } from '../types/feedback.types';

export interface FeedbackFiltersProps {
  filters: FeedbackFilters;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: FeedbackStatus | "all") => void;
  onPriorityChange: (priority: FeedbackPriority | "all") => void;
  isSearching?: boolean;
  className?: string;
}

export function FeedbackFilters({
  filters,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  isSearching = false,
  className,
}: FeedbackFiltersProps) {
  
  const statusOptions = [
    { value: "all", label: "Todos" },
    ...Object.entries(feedbackStatusConfig).map(([key, config]) => ({
        value: key,
        label: config.label,
        activeColor: config.badge,
    }))
  ];

  const priorityOptions = [
    { value: "all", label: "Todas" },
    ...Object.entries(feedbackPriorityConfig).map(([key, config]) => ({
        value: key,
        label: config.label,
        activeColor: config.badge,
    }))
  ];

  return (
      <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
          <div className="flex-1">
              <SearchInput
                  value={filters.search || ""}
                  onChange={onSearchChange}
                  isLoading={isSearching}
                  placeholder="Buscar feedbacks..."
              />
          </div>

          <div className="flex flex-wrap items-center gap-3">
              <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 items-center">
                  <span className="text-[10px] font-bold text-white/30 uppercase px-2">Status</span>
                  <GlassSelector
                      value={filters.status || "all"}
                      onChange={(v) => onStatusChange(v as any)}
                      options={statusOptions as any}
            className="border-none bg-transparent p-0"
            layoutId='status-selector'
                  />
              </div>

               <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5 items-center">
                  <span className="text-[10px] font-bold text-white/30 uppercase px-2">Prioridade</span>
                  <GlassSelector
                      value={filters.priority || "all"}
                      onChange={(v) => onPriorityChange(v as any)}
                      options={priorityOptions as any}
            className="border-none bg-transparent p-0"
            layoutId='priority-selector'
                  />
              </div>
          </div>
      </div>
  )
}
