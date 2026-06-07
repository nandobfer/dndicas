"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { invalidateSearchCache } from "@/core/utils/search-engine"
import { npcsKeys, useCopyToNpc } from "../api/npcs-queries"
import type { Monster } from "../types/monsters.types"

export function getNpcDetailHref(npc: Pick<Monster, "name">, options: { edit?: boolean } = {}) {
    const slug = encodeURIComponent(npc.name.toLowerCase().trim().replace(/\s+/g, "-"))
    return `/my-npcs/${slug}${options.edit ? "?edit=1" : ""}`
}

export function useCopyToNpcAction(sourceType: "monster" | "npc", options: { onCopied?: (npc: Monster) => void; openFormOnCopy?: boolean } = {}) {
    const queryClient = useQueryClient()
    const copyMutation = useCopyToNpc()
    const [copiedNpc, setCopiedNpc] = React.useState<Monster | null>(null)
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const { onCopied, openFormOnCopy = true } = options

    const handleCopyToNpc = React.useCallback(
        async (monster: Monster) => {
            try {
                const npc = await copyMutation.mutateAsync({ sourceType, sourceId: monster._id })
                if (openFormOnCopy) {
                    setCopiedNpc(npc)
                    setIsFormOpen(true)
                }
                toast.success("NPC copiado. Ajuste o que quiser antes de salvar.")
                onCopied?.(npc)
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Erro ao copiar para NPC")
            }
        },
        [copyMutation, onCopied, openFormOnCopy, sourceType],
    )

    const closeForm = React.useCallback(() => {
        setIsFormOpen(false)
        setCopiedNpc(null)
    }, [])

    const handleSuccess = React.useCallback(() => {
        queryClient.invalidateQueries({ queryKey: npcsKeys.all })
        invalidateSearchCache()
    }, [queryClient])

    return {
        copiedNpc,
        isFormOpen,
        isCopying: copyMutation.isPending,
        handleCopyToNpc,
        closeForm,
        handleSuccess,
    }
}
