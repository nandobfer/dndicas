"use client"

import * as React from "react"
import { DiceRollerFab } from "./dice-roller-fab"
import { GlobalSearchFAB } from "@/components/ui/global-search-fab"
import { useIsOwlbearAvailable } from "@/features/owlbear/hooks/use-is-owlbear-available"
import { OWLBEAR_CATALOG_EMBED_PARAM } from "@/features/owlbear/catalog-dashboard-frame"

export function GlobalFabGroup() {
    const isOwlbearAvailable = useIsOwlbearAvailable()
    const [isEmbeddedInOwlbearCatalog, setIsEmbeddedInOwlbearCatalog] = React.useState(false)

    React.useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search)
        setIsEmbeddedInOwlbearCatalog(searchParams.get(OWLBEAR_CATALOG_EMBED_PARAM) === "1")
    }, [])

    return (
        <div className="fixed bottom-6 right-6 z-[99] flex flex-col items-end gap-3 sm:flex-row sm:items-center">
            {!isOwlbearAvailable && !isEmbeddedInOwlbearCatalog && <DiceRollerFab />}
            <GlobalSearchFAB embedded />
        </div>
    )
}
