"use client"

import * as React from "react"
import { Zap } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * T043: Feats (Talentos) card for dashboard catalog grid.
 * Uses generalized EntityCard with Amber/Orange styling.
 */
export function FeatsEntityCard({ loading, index }: { loading?: boolean; index: number }) {
    return <EntityCard entityType="Talento" loading={loading} index={index} title="Talentos" icon={Zap} description="Catálogo de talentos (feats)" href="/feats" statsEndpoint="/api/stats/feats" />
}
