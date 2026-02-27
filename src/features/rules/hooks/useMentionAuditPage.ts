"use client";

import * as React from 'react';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import { useViewMode } from "@/core/hooks/useViewMode"
import { useRuleMutations } from "@/features/rules/hooks/useRuleMutations"
import { useSpell, useUpdateSpell } from "@/features/spells/api/spells-queries"
import { useTrait } from "@/features/traits/hooks/useTraits"
import { useTraitMutations } from "@/features/traits/hooks/useTraitMutations"
import { useFeat } from "@/features/feats/hooks/useFeats"
import { useFeatMutations } from "@/features/feats/hooks/useFeatMutations"
import type { Reference, UpdateReferenceInput } from "@/features/rules/types/rules.types"
import type { UpdateTraitInput } from "@/features/traits/types/traits.types"
import type { UpdateFeatInput } from "@/features/feats/types/feats.types"

export interface MentionIssue {
    _id: string
    type: "Regra" | "Magia" | "Habilidade" | "Talento"
    name: string
    description: string
    source: string
    status: "active" | "inactive"
}

/**
 * Hook for logic of the Mention Audit page.
 * Follows the pattern of useRulesPage and useAuditLogsPage.
 */
export function useMentionAuditPage() {
    const isMobile = useIsMobile()
    const { viewMode, setViewMode, isTable, isDefault } = useViewMode()
    const [issues, setIssues] = React.useState<MentionIssue[]>([])
    const [isLoading, setIsLoading] = React.useState(true)
    const [isRefreshing, setIsRefreshing] = React.useState(false)
    const [errorAtFetch, setErrorAtFetch] = React.useState<string | null>(null)

    // Modal states
    const [editingEntity, setEditingEntity] = React.useState<{ id: string; type: string } | null>(null)
    const [selectedRule, setSelectedRule] = React.useState<Reference | null>(null)

    // Fetch individual entities for editing
    const { data: spellData } = useSpell(editingEntity?.type === "Magia" ? editingEntity.id : null)
    const { data: traitData } = useTrait(editingEntity?.type === "Habilidade" ? editingEntity.id : null)
    const { data: featData } = useFeat(editingEntity?.type === "Talento" ? editingEntity.id : null)

    // Mutations hooks
    const { updateRule } = useRuleMutations()
    const updateSpellMutation = useUpdateSpell()
    const { update: updateTrait } = useTraitMutations()
    const { updateFeat } = useFeatMutations()

    const fetchIssues = React.useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true)
        else setIsLoading(true)
        setErrorAtFetch(null)

        try {
            const resp = await fetch("/api/admin/mention-audit")
            if (resp.ok) {
                const data = await resp.json()
                setIssues(data)
            } else {
                const errorData = await resp.json().catch(() => ({}))
                setErrorAtFetch(errorData.error || `Erro ${resp.status}: Falha ao buscar dados`)
            }
        } catch (err) {
            console.error("Failed to fetch issues", err)
            setErrorAtFetch("Erro de conexão com o servidor")
        } finally {
            setIsLoading(false)
            setIsRefreshing(false)
        }
    }, [])

    React.useEffect(() => {
        fetchIssues()
    }, [fetchIssues])

    // Handlers
    const handleEdit = (id: string, type: string) => {
        if (type === "Regra") {
            const rule = issues.find((i) => i._id === id)
            if (rule) setSelectedRule(rule as unknown as Reference)
        }
        setEditingEntity({ id, type })
    }

    const handleRefresh = () => fetchIssues(true)

    const closeModals = () => {
        setEditingEntity(null)
        setSelectedRule(null)
    }

    return {
        isMobile,
        viewMode,
        setViewMode,
        isDefault,
        isTable,
        isLoading,
        isRefreshing,
        errorAtFetch,
        data: {
            items: issues,
            spellData,
            traitData,
            featData,
        },
        actions: {
            handleEdit,
            handleRefresh,
            fetchIssues,
            closeModals,
            updateRule,
            updateSpellMutation,
            updateTrait,
            updateFeat,
        },
        modals: {
            editingEntity,
            selectedRule,
            setEditingEntity,
            setSelectedRule,
        },
    }
}
