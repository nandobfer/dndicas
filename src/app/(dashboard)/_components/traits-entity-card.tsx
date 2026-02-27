"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * T035: Traits (Habilidades) card for dashboard catalog grid.
 * Uses generalized EntityCard with Slate/Gray styling.
 */
export function TraitsEntityCard({
    stats,
    loading,
    index,
}: {
    stats?: { total: number; active: number; growth?: Array<{ count: number }> }
    loading: boolean
    index: number
}) {
    return (
        <EntityCard entityType="Habilidade" stats={stats} loading={loading} index={index} title="Habilidades" icon={Sparkles} description="Catálogo de traços e habilidades (traits)" href="/traits" />
    )
}
