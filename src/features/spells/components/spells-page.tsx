/**
 * @fileoverview Spells catalog page component.
 * User Story 1: View & Search spells.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004, FR-005
 */

"use client";

import { useState } from 'react';
import { Plus, Wand } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/core/utils';
import { useAuth } from '@/core/hooks/useAuth';
import { useSpells } from '../api/spells-queries';
import { useSpellFilters } from '../hooks/useSpellFilters';
import { SpellsTable } from './spells-table';
import { SpellsFilters } from './spells-filters';
import { SpellFormModal } from './spell-form-modal';
import type { Spell, SpellSchool, AttributeType, DiceType } from '../types/spells.types';
import { GlassCard, GlassCardContent } from '@/components/ui/glass-card';
import { motionConfig } from '@/lib/config/motion-configs';

/**
 * Spells Page Component
 *
 * Main page for viewing and searching spells.
 * Features:
 * - Text search with 300ms debouncing
 * - Paginated table with formatted chips
 * - Admin-only create/edit/delete actions
 * - Preview tooltips for quick reference
 *
 * @example
 * ```tsx
 * // In app/(dashboard)/spells/page.tsx
 * export default function Page() {
 *   return <SpellsPage />;
 * }
 * ```
 */
export function SpellsPage() {
  const { isAdmin } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);

  const {
    filters,
    search,
    setSearch,
    setStatus,
    setCircles,
    setSchools,
    setSaveAttributes,
    setDiceTypes,
    circleMode,
    setCircleMode,
    setPage,
  } = useSpellFilters();

  const { data, isLoading, isFetching, refetch } = useSpells(filters, filters.page, filters.limit);

  // Check if any filters are active (beyond defaults)
  const hasActiveFilters =
    !!filters.search ||
    (filters.circles && filters.circles.length > 0) ||
    (filters.schools && filters.schools.length > 0) ||
    (filters.saveAttributes && filters.saveAttributes.length > 0) ||
    (filters.diceTypes && filters.diceTypes.length > 0) ||
    (filters.status && filters.status !== 'all');

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handleCircleChange = (circle: number | undefined, mode: "exact" | "upTo") => {
    setCircleMode(mode);
    if (circle === undefined) {
      setCircles([]);
    } else if (mode === "exact") {
      setCircles([circle]);
    } else {
      // "upTo" mode: include circles 0 to selected circle
      const circleRange = Array.from({ length: circle + 1 }, (_, i) => i);
      setCircles(circleRange);
    }
  };

  const handleEdit = (spell: Spell) => {
    setSelectedSpell(spell);
    setIsModalOpen(true);
  };

  const handleDelete = async (spell: Spell) => {
    if (!confirm(`Deseja realmente excluir a magia "${spell.name}"?`)) return;

    try {
      const response = await fetch(`/api/spells/${spell._id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Erro ao excluir magia");

      toast.success("Magia excluída com sucesso!");
      refetch();
    } catch (error) {
      toast.error("Erro ao excluir magia");
    }
  };

  const handleNewSpell = () => {
    setSelectedSpell(null);
    setIsModalOpen(true);
  };

  const handleSuccess = () => {
    refetch();
  };

  return (
    <motion.div
      variants={motionConfig.variants.fadeInUp}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wand className="h-6 w-6 text-purple-400" />
            Catálogo de Magias
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Explore as magias disponíveis para conjuradores (D&D 5e)
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={handleNewSpell}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-blue-500 text-white font-medium text-sm',
              'hover:bg-blue-600 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
              'shadow-lg shadow-blue-500/20'
            )}
          >
            <Plus className="h-4 w-4" />
            Nova Magia
          </button>
        )}
      </div>

      {/* Filters Panel */}
      <GlassCard>
        <GlassCardContent className="py-4">
          <SpellsFilters
            filters={filters}
            onSearchChange={handleSearchChange}
            onStatusChange={setStatus}
            onCircleChange={handleCircleChange}
            onSchoolsChange={setSchools}
            onAttributesChange={setSaveAttributes}
            onDiceTypesChange={setDiceTypes}
            isSearching={isFetching && !isLoading}
          />
        </GlassCardContent>
      </GlassCard>

      {/* Table */}
      <SpellsTable
        spells={data?.spells || []}
        isLoading={isLoading}
        total={data?.total || 0}
        page={filters.page}
        limit={filters.limit}
        hasActiveFilters={hasActiveFilters}
        onPageChange={setPage}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <SpellFormModal
        isOpen={isModalOpen}
        spell={selectedSpell}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </motion.div>
  );
}
