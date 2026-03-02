"use client"

import * as React from "react"
import { Sword } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * Classes card for dashboard catalog grid.
 * Uses generalized EntityCard with Amber/Classe styling.
 */
export function ClassesEntityCard({
    stats,
    loading,
    index,
}: {
    stats?: { total: number; active: number; growth?: Array<{ count: number }> }
    loading: boolean
    index: number
}) {
    return <EntityCard entityType="Classe" stats={stats} loading={loading} index={index} title="Classes" icon={Sword} description="Classes de personagem (Guerreiro, Mago, etc.)" href="/classes" />
}
