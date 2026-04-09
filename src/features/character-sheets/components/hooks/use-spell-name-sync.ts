"use client"

import { useRef, useCallback } from "react"
import { fetchSpell } from "@/features/spells/api/spells-api"
import { extractMentionsFromHtml } from "../../utils/mention-sync"
import type { CharacterSpell } from "../../types/character-sheet.types"

interface UseSpellNameSyncOptions {
    isReadOnly?: boolean
    onPatch: (spellId: string, data: Partial<CharacterSpell>) => void
}

export function useSpellNameSync({ isReadOnly = false, onPatch }: UseSpellNameSyncOptions) {
    // Cache: spellId → last processed catalogSpellId
    const processedRef = useRef<Map<string, string>>(new Map())

    const handleSpellNameChange = useCallback(
        async (spellId: string, nameHtml: string) => {
            if (isReadOnly) return

            // Always patch the name
            onPatch(spellId, { name: nameHtml || "Nova magia" })

            const mentions = extractMentionsFromHtml(nameHtml)
            const spellMention = mentions.find((m) => m.entityType === "Magia")

            if (!spellMention) {
                processedRef.current.delete(spellId)
                return
            }

            if (processedRef.current.get(spellId) === spellMention.id) return
            processedRef.current.set(spellId, spellMention.id)

            try {
                const catalogSpell = await fetchSpell(spellMention.id)

                onPatch(spellId, {
                    catalogSpellId: catalogSpell._id,
                    circle: catalogSpell.circle ?? 0,
                    castingTime: catalogSpell.castingTime ?? "",
                    range: catalogSpell.range ?? "",
                    concentration: catalogSpell.component?.includes("Concentração") ?? false,
                    ritual: (catalogSpell.component as string[])?.includes("Ritual") ?? false,
                    material: catalogSpell.component?.includes("Material") ?? false,
                })
            } catch {
                // Silently ignore fetch errors
            }
        },
        [isReadOnly, onPatch]
    )

    return { handleSpellNameChange }
}
