"use client"

import { CatalogDashboardFrame } from "./catalog-dashboard-frame"
import { OwlbearActionFrame } from "./owlbear-action-frame"
import type { OwlbearRuntimeState } from "./types"

const CATALOG_RUNTIME_STATE: OwlbearRuntimeState = {
    status: "ready",
    role: null,
    roomId: null,
    playerId: null,
    themeMode: "dark",
    sceneReady: false,
}

export function OwlbearCatalogAction() {
    return (
        <OwlbearActionFrame runtime={CATALOG_RUNTIME_STATE} actionName="catalog" contentClassName="max-w-none p-0">
            <div className="min-h-0 flex-1 overflow-hidden">
                <CatalogDashboardFrame title="Dndicas - catalogo" />
            </div>
        </OwlbearActionFrame>
    )
}

export function OwlbearLegacyAction() {
    return <OwlbearCatalogAction />
}
