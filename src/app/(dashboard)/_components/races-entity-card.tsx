"use client"

import * as React from "react"
import { Fingerprint } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * Races card for dashboard catalog grid.
 * Uses generalized EntityCard with Gray/Raça styling.
 */
export function RacesEntityCard({ loading, index }: { loading?: boolean; index: number }) {
    return (
        <EntityCard
            entityType="Raça"
            loading={loading}
            index={index}
            title="Raças"
            icon={Fingerprint}
            description="Raças jogáveis (Humano, Elfo, etc.)"
            href="/races"
            statsEndpoint="/api/stats/races"
        />
    )
}
