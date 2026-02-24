"use client"

import * as React from "react"
import { Zap } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * T043: Feats (Talentos) card for dashboard catalog grid.
 * Uses generalized EntityCard with Amber/Orange styling.
 */
export function FeatsEntityCard({
    stats,
    loading,
    index,
}: {
    stats?: { total: number; active: number; growth?: Array<{ count: number }> }
    loading: boolean
    index: number
}) {
    return (
        <EntityCard
            entityType="Talento"
            stats={stats}
            loading={loading}
            index={index}
            title="Talentos"
            icon={Zap}
            description="Catálogo de talentos e feats de D&D"
        />
    )
}
