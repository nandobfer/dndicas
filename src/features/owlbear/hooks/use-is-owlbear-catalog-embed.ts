"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { OWLBEAR_CATALOG_EMBED_PARAM } from "../catalog-dashboard-frame"

/** Marca do modo embutido no `sessionStorage` do próprio iframe (o parâmetro some ao navegar dentro dele). */
export const OWLBEAR_CATALOG_EMBED_STORAGE_KEY = "dndicas:owlbear-catalog-embed"

function readStoredFlag() {
    try {
        return window.sessionStorage.getItem(OWLBEAR_CATALOG_EMBED_STORAGE_KEY) === "1"
    } catch {
        return false
    }
}

/**
 * Indica se o site está aberto como catálogo dentro da extensão do Owlbear (`/?owlbearCatalogEmbed=1`).
 * O parâmetro vale já no primeiro render (sem piscar o header); a marca guardada mantém o modo nas
 * navegações seguintes dentro do iframe.
 */
export function useIsOwlbearCatalogEmbed() {
    const searchParams = useSearchParams()
    const fromParam = searchParams?.get(OWLBEAR_CATALOG_EMBED_PARAM) === "1"
    const [fromStorage, setFromStorage] = React.useState(false)

    React.useEffect(() => {
        if (fromParam) {
            // Mantém o modo ao sair do parâmetro, sem piscar o header na navegação seguinte.
            setFromStorage(true)
            try {
                window.sessionStorage.setItem(OWLBEAR_CATALOG_EMBED_STORAGE_KEY, "1")
            } catch {
                // Armazenamento bloqueado: o modo vale só enquanto o parâmetro estiver na URL.
            }
            return
        }
        setFromStorage(readStoredFlag())
    }, [fromParam])

    return fromParam || fromStorage
}
