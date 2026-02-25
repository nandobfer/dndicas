/**
 * @fileoverview Loading state for spells page.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004
 */

import { GlassCard } from '@/components/ui/glass-card';
import { LoadingState } from '@/components/ui/loading-state';

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-white/5 rounded-lg animate-pulse" />
          <div className="h-4 w-96 bg-white/5 rounded-lg animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-white/5 rounded-lg animate-pulse" />
      </div>

      {/* Search Bar Skeleton */}
      <GlassCard>
        <div className="p-4">
          <div className="h-11 w-full bg-white/5 rounded-lg animate-pulse" />
        </div>
      </GlassCard>

      {/* Table Skeleton */}
      <GlassCard className="p-12 flex justify-center">
        <LoadingState variant="spinner" message="Carregando magias..." />
      </GlassCard>
    </div>
  );
}
