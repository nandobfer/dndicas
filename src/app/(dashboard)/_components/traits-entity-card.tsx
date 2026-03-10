"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * T035: Traits (Habilidades) card for dashboard catalog grid.
 * Uses generalized EntityCard with Slate/Gray styling.
 */
export function TraitsEntityCard({ loading, index }: { loading?: boolean; index: number }) {
    return (
        <EntityCard
            entityType="Habilidade"
            loading={loading}
            index={index}
            title="Habilidades"
            icon={Sparkles}
            description="Catálogo de traços e habilidades (traits)"
            href="/traits"
            statsEndpoint="/api/stats/traits"
        />
    )
}
