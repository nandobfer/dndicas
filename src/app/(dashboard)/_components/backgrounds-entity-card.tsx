"use client"

import * as React from "react"
import { ShieldCheck } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * Backgrounds card for dashboard catalog grid.
 * Uses generalized EntityCard with Blue/Origem styling.
 */
export function BackgroundsEntityCard({
    stats,
    loading,
    index,
}: {
    stats?: { total: number; active: number; growth?: Array<{ count: number }> }
    loading: boolean
    index: number
}) {
    return <EntityCard entityType="Origem" stats={stats} loading={loading} index={index} title="Origens" icon={ShieldCheck} description="Antecedentes e origens dos heróis" href="/backgrounds" />
}
