"use client"

import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { ViewMode } from "@/core/hooks/useViewMode"
import { GlassSelector } from "./glass-selector"

interface GlassViewSelectorProps {
  viewMode: ViewMode
  setViewMode: (v: ViewMode) => void
  layoutId: string
}

/**
 * Reusable view mode selector (Grid/Table) for catalog pages.
 * Handles mobile visibility automatically.
 */
export function GlassViewSelector({ viewMode, setViewMode, layoutId }: GlassViewSelectorProps) {
  const isMobile = useIsMobile()

  if (isMobile) return null

  return (
    <GlassSelector
      value={viewMode}
      onChange={(v) => setViewMode(v as ViewMode)}
      options={[
        { value: "default", label: "Padrão" },
        { value: "table", label: "Tabela" },
      ]}
      size="sm"
      layoutId={layoutId}
    />
  )
}
