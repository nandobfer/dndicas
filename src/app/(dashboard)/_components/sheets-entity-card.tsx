"use client"

import * as React from "react"
import { ScrollText } from "lucide-react"
import { EntityCard } from "./entity-card"

/**
 * Character Sheets card for dashboard.
 * Uses EntityCard with purple/Ficha styling, links to /my-sheets.
 */
export function SheetsEntityCard({ loading, index }: { loading?: boolean; index: number }) {
    return (
        <EntityCard
            entityType="Ficha"
            loading={loading}
            index={index}
            title="Fichas de Personagens"
            icon={ScrollText}
            description="Fichas criadas por jogadores com acesso direto a todo o repositório e dados. Todo preenchimento pode ser semi-automatizado ou totalmente manual."
            href="/my-sheets"
            statsEndpoint="/api/stats/sheets"
        />
    )
}
