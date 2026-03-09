"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { EntityPage } from "@/features/rules/components/entity-page"
import { entityConfig } from "@/lib/config/entities"
import { useAuth } from "@/core/hooks/useAuth"
import { useWindows } from "@/core/context/window-context"
import { useRulesPage } from "@/features/rules/hooks/useRulesPage"
import { useTraitsPage } from "@/features/traits/hooks/useTraitsPage"
import { ExternalLink } from "lucide-react"
import { motion } from "framer-motion"
import { useFeatsPage } from "@/features/feats/hooks/useFeatsPage"
import { useSpellsPage } from "@/features/spells/hooks/useSpellsPage"
import { useClassesPage } from "@/features/classes/hooks/useClassesPage"
import { useBackgroundsPage } from "@/features/backgrounds/hooks/useBackgroundsPage"
import { RuleFormModal } from "@/features/rules/components/rule-form-modal"
import { DeleteRuleDialog } from "@/features/rules/components/delete-rule-dialog"
import { TraitFormModal } from "@/features/traits/components/trait-form-modal"
import { DeleteTraitDialog } from "@/features/traits/components/delete-trait-dialog"
import { FeatFormModal } from "@/features/feats/components/feat-form-modal"
import { DeleteFeatDialog } from "@/features/feats/components/delete-feat-dialog"
import { ClassFormModal } from "@/features/classes/components/class-form-modal"
import { DeleteClassDialog } from "@/features/classes/components/delete-class-dialog"
import { SpellFormModal } from "@/features/spells/components/spell-form-modal"
import { BackgroundFormModal } from "@/features/backgrounds/components/background-form-modal"
import { DeleteBackgroundDialog } from "@/features/backgrounds/components/delete-background-dialog"
import { useRacesPage } from "@/features/races/hooks/useRacesPage"
import { RaceFormModal } from "@/features/races/components/race-form-modal"
import { DeleteRaceDialog } from "@/features/races/components/delete-race-dialog"
import { DeleteSpellDialog } from "@/features/spells/components/delete-spell-dialog"

interface GenericEntityPageProps {
    entityTypeKey: "Regra" | "Habilidade" | "Talento" | "Magia" | "Classe" | "Origem" | "Raça"
}

export default function GenericEntityPage({ entityTypeKey }: GenericEntityPageProps) {
    const params = useParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const { addWindow } = useWindows()
    const { isAdmin } = useAuth()
    const slug = params.slug as string
    const config = entityConfig[entityTypeKey]

    // Initialize hooks to get modal actions
    const rulesPage = useRulesPage()
    const traitsPage = useTraitsPage()
    const featsPage = useFeatsPage()
    const spellsPage = useSpellsPage()
    const classesPage = useClassesPage()
    const backgroundsPage = useBackgroundsPage()
    const racesPage = useRacesPage()

    const queryKey = [entityTypeKey.toLowerCase(), slug]

    // Map hooks to entity types
    const hookMap = {
        Regra: rulesPage,
        Habilidade: traitsPage,
        Talento: featsPage,
        Magia: spellsPage,
        Classe: classesPage,
        Origem: backgroundsPage,
        Raça: racesPage,
    }

    const currentPage = hookMap[entityTypeKey]

    const onEdit = currentPage?.actions?.handleEditClick || (currentPage as any)?.handleEditClick
    const onDelete = currentPage?.actions?.handleDeleteClick || (currentPage as any)?.handleDeleteClick

    const routeMap = {
        Regra: "rules",
        Habilidade: "traits",
        Talento: "feats",
        Magia: "spells",
        Classe: "classes",
        Origem: "backgrounds",
        Raça: "races",
    }

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

            // 1. First, search to get the basic record and ID
            const endpoint = config.provider!.endpoint()
            const separator = endpoint.includes("?") ? "&" : "?"

            // For search endpoints that use 'q' like /api/classes/search?q=bruxo
            // we use q instead of search
            const isSearchEndpoint = endpoint.endsWith("/search")
            const searchParam = isSearchEndpoint ? "q" : "search"

            const searchRes = await fetch(`${endpoint}${separator}${searchParam}=${encodeURIComponent(name)}&searchField=name`)

            if (!searchRes.ok) return null
            const searchData = await searchRes.json()

            // The search might return one or more items, pick the best match
            const items = Array.isArray(searchData)
                ? searchData
                : searchData.items ||
                  searchData.spells ||
                  searchData.traits ||
                  searchData.rules ||
                  searchData.feats ||
                  searchData.backgrounds ||
                  searchData.classes ||
                  []

            // Find exact name match
            const basicItem = items.find((i: any) => (i.name || i.label).toLowerCase() === name.toLowerCase()) || items[0]

            if (!basicItem) return null

            // We fetch the full profile by ID because search/list results are often too lean (missing status, full description, etc.)
            const route = routeMap[entityTypeKey]
            const fullRes = await fetch(`/api/${route}/${basicItem._id || basicItem.id || basicItem.id}`)
            if (fullRes.ok) {
                return await fullRes.json()
            }

            return basicItem
        },
        enabled: !!slug && !!config.provider,
    })

    return (
        <>
            <div className="relative">
                {item && (
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() =>
                            addWindow({
                                title: item.name || entityTypeKey,
                                content: null,
                                item: item,
                                entityType: entityTypeKey,
                            })
                        }
                        className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Janela Solta</span>
                    </motion.button>
                )}
                <EntityPage item={item} entityType={entityTypeKey} isLoading={isLoading} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} hideActionIcons={true} />
            </div>

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

            {entityTypeKey === "Magia" && (
                <>
                    <SpellFormModal
                        isOpen={spellsPage.modals.isFormOpen}
                        onClose={() => spellsPage.modals.setIsFormOpen(false)}
                        onSuccess={() => {
                            spellsPage.modals.setIsFormOpen(false)
                            queryClient.invalidateQueries({ queryKey })
                        }}
                        spell={spellsPage.modals.selectedSpell}
                    />
                    <DeleteSpellDialog isOpen={spellsPage.modals.isDeleteDialogOpen} onClose={() => spellsPage.modals.setIsDeleteDialogOpen(false)} spell={spellsPage.modals.selectedSpell} />
                </>
            )}

            {entityTypeKey === "Classe" && (
                <>
                    <ClassFormModal
                        isOpen={classesPage.modals.isFormOpen}
                        onClose={() => classesPage.modals.setIsFormOpen(false)}
                        onSuccess={classesPage.actions.handleFormSuccess}
                        characterClass={classesPage.modals.selectedClass}
                    />
                    <DeleteClassDialog
                        isOpen={classesPage.modals.isDeleteOpen}
                        onClose={() => classesPage.modals.setIsDeleteOpen(false)}
                        onConfirm={classesPage.actions.handleDeleteConfirm}
                        classData={classesPage.modals.selectedClass}
                        isDeleting={classesPage.modals.isSaving}
                    />
                </>
            )}

            {entityTypeKey === "Origem" && (
                <>
                    <BackgroundFormModal
                        isOpen={backgroundsPage.modals.isFormOpen}
                        onClose={() => backgroundsPage.modals.setIsFormOpen(false)}
                        onSuccess={() => {
                            backgroundsPage.modals.setIsFormOpen(false)
                            queryClient.invalidateQueries({ queryKey })
                        }}
                        background={backgroundsPage.modals.selectedBackground}
                    />
                    <DeleteBackgroundDialog
                        isOpen={backgroundsPage.modals.isDeleteOpen}
                        onClose={() => backgroundsPage.modals.setIsDeleteOpen(false)}
                        background={backgroundsPage.modals.selectedBackground}
                    />
                </>
            )}

            {entityTypeKey === "Raça" && (
                <>
                    <RaceFormModal
                        isOpen={racesPage.modals.isFormOpen}
                        onClose={() => racesPage.modals.setIsFormOpen(false)}
                        onSuccess={() => {
                            racesPage.modals.setIsFormOpen(false)
                            queryClient.invalidateQueries({ queryKey })
                        }}
                        race={racesPage.modals.selectedRace}
                    />
                    <DeleteRaceDialog isOpen={racesPage.modals.isDeleteOpen} onClose={() => racesPage.modals.setIsDeleteOpen(false)} race={racesPage.modals.selectedRace} />
                </>
            )}
        </>
    )
}
