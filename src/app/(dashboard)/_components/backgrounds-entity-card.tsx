"use client"

import * as React from "react"
import { ShieldCheck } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * Backgrounds card for dashboard catalog grid.
 * Uses generalized EntityCard with Blue/Origem styling.
 */
export function BackgroundsEntityCard({ loading, index }: { loading?: boolean; index: number }) {
    return (
        <EntityCard
            entityType="Origem"
            loading={loading}
            index={index}
            title="Origens"
            icon={ShieldCheck}
            description="Antecedentes e origens dos heróis"
            href="/backgrounds"
            statsEndpoint="/api/stats/backgrounds"
        />
    )
}
