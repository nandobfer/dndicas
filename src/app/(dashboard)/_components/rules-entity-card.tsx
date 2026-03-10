"use client"

import * as React from "react"
import { Scroll } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * T034: Refactored Rules card to use generalized EntityCard component.
 */
export function RulesEntityCard({ loading, index }: { loading?: boolean; index: number }) {
    return (
        <EntityCard
            entityType="Regra"
            loading={loading}
            index={index}
            title="Regras"
            icon={Scroll}
            description="Catálogo de regras e diretrizes customizadas"
            href="/rules"
            statsEndpoint="/api/stats/rules"
        />
    )
}
