/**
 * @fileoverview Loading state for races page.
 */

import { GlassCard, GlassCardContent } from '@/components/ui/glass-card';
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

      {/* Filters Skeleton */}
      <GlassCard>
        <GlassCardContent className="py-4">
          <div className="h-10 w-full bg-white/5 rounded-lg animate-pulse" />
        </GlassCardContent>
      </GlassCard>

      {/* Content Area Skeleton */}
      <GlassCard className="border-white/5 overflow-hidden">
        <GlassCardContent className="p-0">
          <LoadingState 
            lines={10}
            className="p-8"
          />
        </GlassCardContent>
      </GlassCard>
    </div>
  );
}
