"use client"

import { useStorage } from "./useStorage"

export type ViewMode = "default" | "table"

/**
 * Hook to manage global view mode (Grid/List vs Table) across different pages.
 * Persisted in localStorage with a generic key.
 */
export function useViewMode() {
  const [viewMode, setViewMode] = useStorage<ViewMode>("dndicas-view-mode", "default")

  return {
    viewMode,
    setViewMode: (v: ViewMode) => setViewMode(v),
    isDefault: viewMode === "default",
    isTable: viewMode === "table",
  }
}
