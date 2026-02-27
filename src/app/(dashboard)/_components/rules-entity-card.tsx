"use client"

import * as React from "react"
import { Scroll } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * T034: Refactored Rules card to use generalized EntityCard component.
 */
export function RulesEntityCard({ stats, loading, index }: { stats?: { total: number; active: number; growth?: Array<{ count: number }> }; loading: boolean; index: number }) {
    return <EntityCard entityType="Regra" stats={stats} loading={loading} index={index} title="Regras" icon={Scroll} description="Catálogo de regras e diretrizes customizadas" href="/rules" />
}
