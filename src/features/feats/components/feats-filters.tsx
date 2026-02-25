"use client";

import { SearchInput } from '@/components/ui/search-input';
import { StatusChips, type StatusFilter } from '@/components/ui/status-chips';
import { GlassInput } from '@/components/ui/glass-input';
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from '@/core/utils';
import type { FeatsFilters } from '../types/feats.types';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FeatsFiltersProps {
  filters: FeatsFilters;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: FeatsFilters['status']) => void;
  onLevelChange: (level: number | undefined, mode: 'exact' | 'upto') => void;
  isSearching?: boolean;
  className?: string;
}

export function FeatsFilters({
  filters,
  onSearchChange,
  onStatusChange,
  onLevelChange,
  isSearching = false,
  className,
}: FeatsFiltersProps) {
  const { isAdmin } = useAuth()
  const [levelMode, setLevelMode] = useState<'exact' | 'upto'>('exact');
  const [selectedLevel, setSelectedLevel] = useState<number | undefined>(
    filters.level || filters.levelMax
  );

  const handleLevelInput = (value: string) => {
    // Remove qualquer caractere que não seja número (máscara numérica)
    const cleanedValue = value.replace(/\D/g, '');
    
    if (cleanedValue === '') {
      setSelectedLevel(undefined);
      onLevelChange(undefined, levelMode);
    } else {
      let level = parseInt(cleanedValue, 10);
      
      // Garante o intervalo de 1 a 20
      if (level > 20) level = 20;
      if (level < 1) level = 1;
      
      setSelectedLevel(level);
      onLevelChange(level, levelMode);
    }
  };

  const handleModeToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newMode = levelMode === 'exact' ? 'upto' : 'exact';
    setLevelMode(newMode);
    if (selectedLevel !== undefined) {
      onLevelChange(selectedLevel, newMode);
    }
  };

  return (
      <div className={cn("flex flex-col lg:flex-row lg:items-center gap-4 justify-between", className)}>
          {/* Search */}
          <div className="flex-1 w-full lg:max-w-md">
              <SearchInput
                  value={filters.search || ""}
                  onChange={onSearchChange}
                  isLoading={isSearching}
                  placeholder="Buscar talentos por nome ou fonte..."
              />
          </div>

          <div className="flex flex-wrap items-center gap-6">
              {/* Level Filter */}
              <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Nível:</span>
                  <div className="flex items-center gap-2">
                      <GlassInput
                          type="text"
                          inputMode="numeric"
                          value={selectedLevel !== undefined ? String(selectedLevel) : ""}
                          onChange={(e) => handleLevelInput(e.target.value)}
                          placeholder="Todos"
                          className="w-16 px-2 h-10 text-center"
                          containerClassName="w-auto"
                      />

                      <AnimatePresence mode="popLayout">
                          {selectedLevel !== undefined && (
                              <motion.button
                                  key="level-mode-toggle"
                                  initial={{ opacity: 0, scale: 0.8, x: -10 }}
                                  animate={{ opacity: 1, scale: 1, x: 0 }}
                                  exit={{ opacity: 0, scale: 0.8, x: -10 }}
                                  transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
                                  onClick={handleModeToggle}
                                  className={cn(
                                      "flex items-center gap-2 px-3 h-10 rounded-lg transition-all",
                                      "bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20",
                                      "text-xs font-bold uppercase tracking-wider"
                                  )}
                              >
                                  <span className="text-base leading-none">{levelMode === "exact" ? "=" : "≤"}</span>
                                  <span>{levelMode === "exact" ? "Exato" : `Até Nv.${selectedLevel}`}</span>
                              </motion.button>
                          )}
                      </AnimatePresence>
                  </div>
              </div>

              {/* Status */}
              {isAdmin && (
                  <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap hidden sm:inline">Status:</span>
                      <StatusChips value={filters.status || "all"} onChange={onStatusChange as (status: StatusFilter) => void} />
                  </div>
              )}
          </div>
      </div>
  )
}
