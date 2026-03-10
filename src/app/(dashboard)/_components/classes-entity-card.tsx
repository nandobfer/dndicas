"use client"

import * as React from "react"
import { Sword } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * Classes card for dashboard catalog grid.
 * Uses generalized EntityCard with Amber/Classe styling.
 */
export function ClassesEntityCard({ loading, index }: { loading?: boolean; index: number }) {
    return (
        <EntityCard
            entityType="Classe"
            loading={loading}
            index={index}
            title="Classes"
            icon={Sword}
            description="Classes de personagem (Guerreiro, Mago, etc.)"
            href="/classes"
            statsEndpoint="/api/stats/classes"
        />
    )
}
