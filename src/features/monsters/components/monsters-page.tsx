"use client"

import { Plus, Skull } from "lucide-react"
import { motion } from "framer-motion"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassViewSelector } from "@/components/ui/glass-view-selector"
import { EntityList } from "@/features/rules/components/entity-list"
import { EntityGenerationAIModal } from "@/features/entity-generation/components/entity-generation-ai-modal"
import { monsterGenerationAdapter } from "@/features/entity-generation/adapters/monster-generation-adapter"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"
import { motionConfig } from "@/lib/config/motion-configs"
import { useDeleteMonster } from "../api/monsters-queries"
import { useMonstersPage } from "../hooks/useMonstersPage"
import { DeleteMonsterDialog } from "./delete-monster-dialog"
import { MonsterFilters } from "./monster-filters"
import { MonsterFormModal } from "./monster-form-modal"
import { MonstersTable } from "./monsters-table"

export function MonstersPage() {
    const { isAdmin } = useAuth()
    const { filters, data, viewMode, setViewMode, actions, modals } = useMonstersPage()
    const deleteMutation = useDeleteMonster()

    const handleConfirmDelete = async () => {
        if (!modals.selectedMonster) return
        await deleteMutation.mutateAsync(modals.selectedMonster._id)
        modals.closeAll()
    }

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Skull className="h-5 w-5 sm:h-6 sm:w-6 text-red-400" />
                        Monstros
                        <GlassViewSelector viewMode={viewMode} setViewMode={setViewMode} layoutId="monsters-view" />
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Gerencie criaturas, feras, NPCs e adversários do sistema.</p>
                </div>
                {isAdmin && (
                    <button onClick={actions.handleCreateClick} className={cn("inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg", "bg-blue-500 text-white font-medium text-sm", "hover:bg-blue-600 transition-colors", "focus:outline-none focus:ring-2 focus:ring-blue-500/50", "shadow-lg shadow-blue-500/20", "w-full sm:w-auto")}>
                        <Plus className="h-4 w-4" />
                        Novo Monstro
                    </button>
                )}
            </div>

            <GlassCard>
                <GlassCardContent className="py-4">
                    <MonsterFilters
                        filters={filters}
                        onSearchChange={actions.handleSearchChange}
                        onTypeChange={actions.handleTypeChange}
                        onSizeChange={actions.handleSizeChange}
                        onChallengeRatingChange={actions.handleChallengeRatingChange}
                        onStatusChange={actions.handleStatusChange}
                        onSourcesChange={actions.handleSourcesChange}
                        isSearching={data.isLoading}
                    />
                </GlassCardContent>
            </GlassCard>

            <div className="overflow-hidden">
                <GlassCardContent className="p-0">
                    {viewMode === "default" ? (
                        <EntityList items={data.items} isLoading={data.isLoading} hasNextPage={data.hasNextPage} onLoadMore={data.fetchNextPage} isFetchingNextPage={data.isFetchingNextPage} entityType="Monstro" onEdit={actions.handleEditClick} onGenerateAI={actions.handleGenerateAIClick} onDelete={actions.handleDeleteClick} isAdmin={isAdmin} />
                    ) : (
                        <MonstersTable items={data.items} isLoading={data.isLoading} hasNextPage={data.hasNextPage} onLoadMore={data.fetchNextPage} isFetchingNextPage={data.isFetchingNextPage} onEdit={actions.handleEditClick} onGenerateAI={actions.handleGenerateAIClick} onDelete={actions.handleDeleteClick} isAdmin={isAdmin} />
                    )}
                </GlassCardContent>
            </div>

            <MonsterFormModal monster={modals.selectedMonster} isOpen={modals.isFormOpen} onClose={modals.closeAll} onSuccess={() => {}} />
            <DeleteMonsterDialog monster={modals.selectedMonster} isOpen={modals.isDeleteOpen} onClose={modals.closeAll} onConfirm={handleConfirmDelete} isDeleting={deleteMutation.isPending} />
            <EntityGenerationAIModal
                open={modals.isGenerationOpen}
                entity={modals.selectedMonster}
                adapter={monsterGenerationAdapter}
                onOpenChange={modals.setIsGenerationOpen}
                onApplied={actions.handleGenerationApplied}
            />
        </motion.div>
    )
}
