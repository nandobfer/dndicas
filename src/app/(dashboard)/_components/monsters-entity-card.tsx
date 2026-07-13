"use client"

import { Skull } from "lucide-react"
import { EntityCard } from "./entity-card"

export function MonstersEntityCard({ loading, index }: { loading?: boolean; index: number }) {
    return <EntityCard entityType="Monstro" loading={loading} index={index} title="Monstros" icon={Skull} description="Criaturas, feras e adversários" href="/monsters" statsEndpoint="/api/stats/entity-usage?entityType=Monstro" />
}
