"use client"

import * as React from "react"
import { Wand2 } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * Spells (Magias) card for dashboard catalog grid.
 * Uses generalized EntityCard with Purple/Magia styling.
 */
export function SpellsEntityCard({
    stats,
    loading,
    index,
}: {
    stats?: { total: number; active: number; growth?: Array<{ count: number }> }
    loading: boolean
    index: number
}) {
    return <EntityCard entityType="Magia" stats={stats} loading={loading} index={index} title="Magias" icon={Wand2} description="Catálogo completo de feitiços e truques" href="/spells" />
}
