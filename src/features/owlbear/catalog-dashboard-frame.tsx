"use client"

import * as React from "react"

interface CatalogDashboardFrameProps {
    title?: string
}

export function CatalogDashboardFrame({ title = "Dndicas Dashboard" }: CatalogDashboardFrameProps) {
    return (
        <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
            <iframe title={title} src="/" className="block h-full min-h-0 w-full border-0 bg-background" />
        </div>
    )
}
