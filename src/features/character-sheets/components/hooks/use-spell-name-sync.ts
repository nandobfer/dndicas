"use client"

import { useCallback, useEffect, useRef } from "react"
import { fetchSpell } from "@/features/spells/api/spells-api"
import { extractMentionsFromHtml } from "../../utils/mention-sync"
import { buildSpellAttackAutofill, getAutoSpellAttackNotes } from "../../utils/attack-autofill"
import type { CharacterAttack, CreateAttackBody, PatchAttackBody, PatchSpellBody } from "../../types/character-sheet.types"

interface CalcValues {
    spellAttackBonus: { value: number }
}

interface UseSpellNameSyncOptions {
    isReadOnly?: boolean
    calc: CalcValues
    level: number
    attacks: CharacterAttack[]
    onPatch: (spellId: string, data: PatchSpellBody) => void
    onAddAttack: (data: CreateAttackBody) => void
    onPatchAttack: (attackId: string, data: PatchAttackBody) => void
    onRemoveAttack: (attackId: string) => void
}

export function useSpellNameSync({
    isReadOnly = false,
    calc,
    level,
    attacks,
    onPatch,
    onAddAttack,
    onPatchAttack,
    onRemoveAttack,
}: UseSpellNameSyncOptions) {
    // Cache: spellId → last processed catalogSpellId
    const processedRef = useRef<Map<string, string>>(new Map())
    const pendingAutoAttackNotesRef = useRef<Set<string>>(new Set())

    useEffect(() => {
        attacks.forEach((attack) => {
            if (attack.notes?.startsWith("auto:spell:")) {
                pendingAutoAttackNotesRef.current.add(attack.notes)
            }
        })
    }, [attacks])

    const removeAutoAttackForSpell = useCallback(
        (catalogSpellId: string) => {
            const notes = getAutoSpellAttackNotes(catalogSpellId)
            pendingAutoAttackNotesRef.current.delete(notes)
            attacks
                .filter((attack) => attack.notes === notes)
                .forEach((attack) => onRemoveAttack(attack._id))
        },
        [attacks, onRemoveAttack]
    )

    const syncCantripAttack = useCallback(
        async (nameHtml: string, catalogSpellId: string) => {
            const catalogSpell = await fetchSpell(catalogSpellId)
            if (catalogSpell.circle !== 0 || !catalogSpell.baseDice) {
                removeAutoAttackForSpell(catalogSpellId)
                return
            }

            const attackAutofill = buildSpellAttackAutofill(catalogSpell, calc, level)
            const autoAttackNotes = getAutoSpellAttackNotes(catalogSpellId)
            const matchingAttacks = attacks.filter((attack) =>
                extractMentionsFromHtml(attack.name).some((mention) => mention.entityType === "Magia" && mention.id === catalogSpellId)
            )
            const autoAttack = matchingAttacks.find((attack) => attack.notes === autoAttackNotes)

            if (autoAttack) {
                pendingAutoAttackNotesRef.current.add(autoAttackNotes)
                if (autoAttack.name !== nameHtml || autoAttack.damageType !== attackAutofill.damageType || autoAttack.attackBonus !== attackAutofill.attackBonus) {
                    onPatchAttack(autoAttack._id, { name: nameHtml, ...attackAutofill, notes: autoAttackNotes })
                }
                return
            }

            if (matchingAttacks.length > 0) return
            if (pendingAutoAttackNotesRef.current.has(autoAttackNotes)) return

            pendingAutoAttackNotesRef.current.add(autoAttackNotes)

            onAddAttack({
                name: nameHtml,
                ...attackAutofill,
                notes: autoAttackNotes,
            })
        },
        [attacks, calc, level, onAddAttack, onPatchAttack, removeAutoAttackForSpell]
    )

    const handleSpellNameChange = useCallback(
        async (spellId: string, nameHtml: string) => {
            if (isReadOnly) return

            // Always patch the name
            onPatch(spellId, { name: nameHtml })

            const mentions = extractMentionsFromHtml(nameHtml)
            const spellMention = mentions.find((m) => m.entityType === "Magia")
            const previousMentionId = processedRef.current.get(spellId)

            if (!spellMention) {
                if (previousMentionId) removeAutoAttackForSpell(previousMentionId)
                processedRef.current.delete(spellId)
                onPatch(spellId, { catalogSpellId: null })
                return
            }

            if (processedRef.current.get(spellId) === spellMention.id) {
                try {
                    await syncCantripAttack(nameHtml, spellMention.id)
                } catch {
                    // Silently ignore fetch errors
                }
                return
            }
            if (previousMentionId && previousMentionId !== spellMention.id) {
                removeAutoAttackForSpell(previousMentionId)
            }
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
                await syncCantripAttack(nameHtml, spellMention.id)
            } catch {
                // Silently ignore fetch errors
            }
        },
        [isReadOnly, onPatch, removeAutoAttackForSpell, syncCantripAttack]
    )

    return { handleSpellNameChange, removeAutoAttackForSpell, syncCantripAttack }
}
