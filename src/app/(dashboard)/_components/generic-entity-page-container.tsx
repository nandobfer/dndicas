"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { EntityPage } from "@/features/rules/components/entity-page"
import { entityConfig } from "@/lib/config/entities"
import { useAuth } from "@/core/hooks/useAuth"
import { useRulesPage } from "@/features/rules/hooks/useRulesPage"
import { useTraitsPage } from "@/features/traits/hooks/useTraitsPage"
import { useFeatsPage } from "@/features/feats/hooks/useFeatsPage"
import { useSpellsPage } from "@/features/spells/hooks/useSpellsPage"
import { RuleFormModal } from "@/features/rules/components/rule-form-modal"
import { DeleteRuleDialog } from "@/features/rules/components/delete-rule-dialog"
import { TraitFormModal } from "@/features/traits/components/trait-form-modal"
import { DeleteTraitDialog } from "@/features/traits/components/delete-trait-dialog"
import { FeatFormModal } from "@/features/feats/components/feat-form-modal"
import { DeleteFeatDialog } from "@/features/feats/components/delete-feat-dialog"

interface GenericEntityPageProps {
    entityTypeKey: "Regra" | "Habilidade" | "Talento" | "Magia"
}

export default function GenericEntityPage({ entityTypeKey }: GenericEntityPageProps) {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const { isAdmin } = useAuth()
    const slug = params.slug as string
    const config = entityConfig[entityTypeKey]

    // Initialize hooks to get modal actions
    const rulesPage = useRulesPage()
    const traitsPage = useTraitsPage()
    const featsPage = useFeatsPage()
    const spellsPage = useSpellsPage()

    const queryKey = [entityTypeKey.toLowerCase(), slug]

    // Map hooks to entity types
    const hookMap = {
        Regra: rulesPage,
        Habilidade: traitsPage,
        Talento: featsPage,
        Magia: spellsPage,
    }

    const routeMap = {
        Regra: "rules",
        Habilidade: "traits",
        Talento: "feats",
        Magia: "spells",
    }

    const currentPage = hookMap[entityTypeKey]

    // Wrap the submit handler to invalidate the query and handle slug changes
    const handleWrappedSubmit = async (originalSubmit: Function, formData: any) => {
        await originalSubmit(formData)

        // If name changed, we need to redirect to the new slug
        const newName = formData.name
        const currentName = decodeURIComponent(slug).replace(/-/g, " ")

        if (newName && newName.toLowerCase() !== currentName.toLowerCase()) {
            const newSlug = encodeURIComponent(newName.toLowerCase().replace(/\s+/g, "-"))
            const route = routeMap[entityTypeKey]
            router.push(`/${route}/${newSlug}`)
        } else {
            // Give a small delay to ensure the database is updated before refetching
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey })
            }, 300)
        }
    }

    const { data: item, isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            // Decodes slug to possible name (slug is the name from URL)
            const name = decodeURIComponent(slug).replace(/-/g, " ")

            // Search by name in the API
            const endpoint = config.provider!.endpoint()
            const separator = endpoint.includes("?") ? "&" : "?"
            const res = await fetch(`${endpoint}${separator}search=${encodeURIComponent(name)}&searchField=name`)

            if (!res.ok) return null
            const data = await res.json()

            // The search might return one or more items, pick the best match
            const items = Array.isArray(data) ? data : data.items || data.spells || data.traits || data.rules || data.feats || []

            // Find exact name match
            return items.find((i: any) => i.name.toLowerCase() === name.toLowerCase()) || items[0] || null
        },
        enabled: !!slug && !!config.provider,
    })

    return (
        <>
            <EntityPage item={item} entityType={entityTypeKey} isLoading={isLoading} isAdmin={isAdmin} onEdit={currentPage.actions.handleEditClick} onDelete={currentPage.actions.handleDeleteClick} />

            {/* Entity-specific Modals (imported from hooks) */}
            {entityTypeKey === "Regra" && (
                <>
                    <RuleFormModal
                        isOpen={rulesPage.modals.isFormOpen}
                        onClose={() => rulesPage.modals.setIsFormOpen(false)}
                        onSubmit={(data: any) => handleWrappedSubmit(rulesPage.actions.handleFormSubmit, data)}
                        rule={rulesPage.modals.selectedRule}
                        isSubmitting={rulesPage.modals.isSaving}
                    />
                    <DeleteRuleDialog
                        isOpen={rulesPage.modals.isDeleteOpen}
                        onClose={() => rulesPage.modals.setIsDeleteOpen(false)}
                        onConfirm={rulesPage.actions.handleDeleteConfirm}
                        rule={rulesPage.modals.selectedRule}
                    />
                </>
            )}

            {entityTypeKey === "Habilidade" && (
                <>
                    <TraitFormModal
                        isOpen={traitsPage.modals.isFormOpen}
                        onClose={() => traitsPage.modals.setIsFormOpen(false)}
                        onSubmit={(data: any) => handleWrappedSubmit(traitsPage.actions.handleFormSubmit, data)}
                        trait={traitsPage.modals.selectedTrait}
                        isSubmitting={traitsPage.modals.isSaving}
                    />
                    <DeleteTraitDialog
                        isOpen={traitsPage.modals.isDeleteOpen}
                        onClose={() => traitsPage.modals.setIsDeleteOpen(false)}
                        onConfirm={traitsPage.actions.handleDeleteConfirm}
                        trait={traitsPage.modals.selectedTrait}
                    />
                </>
            )}

            {entityTypeKey === "Talento" && (
                <>
                    <FeatFormModal
                        isOpen={featsPage.modals.isFormOpen}
                        onClose={() => featsPage.modals.setIsFormOpen(false)}
                        onSubmit={(data: any) => handleWrappedSubmit(featsPage.actions.handleFormSubmit, data)}
                        feat={featsPage.modals.selectedFeat}
                        isSubmitting={featsPage.modals.isSaving}
                    />
                    <DeleteFeatDialog
                        isOpen={featsPage.modals.isDeleteOpen}
                        onClose={() => featsPage.modals.setIsDeleteOpen(false)}
                        onConfirm={featsPage.actions.handleDeleteConfirm}
                        feat={featsPage.modals.selectedFeat}
                    />
                </>
            )}
        </>
    )
}
