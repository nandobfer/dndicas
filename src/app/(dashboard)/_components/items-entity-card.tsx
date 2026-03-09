"use client"

import * as React from "react"
import { Backpack } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * Items card to use generalized EntityCard component.
 */
export function ItemsEntityCard({ stats, loading, index }: { stats?: { total: number; active: number; growth?: Array<{ count: number }> }; loading: boolean; index: number }) {
    return <EntityCard entityType="Item" stats={stats} loading={loading} index={index} title="Itens" icon={Backpack} description="Equipamentos, armas e itens mágicos" href="/items" />
}
