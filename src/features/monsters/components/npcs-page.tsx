"use client"

import { Plus, Users } from "lucide-react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassViewSelector } from "@/components/ui/glass-view-selector"
import { EntityList } from "@/features/rules/components/entity-list"
import { cn } from "@/core/utils"
import { motionConfig } from "@/lib/config/motion-configs"
import { useDeleteNpc } from "../api/npcs-queries"
import { getNpcDetailHref, useCopyToNpcAction } from "../hooks/useCopyToNpcAction"
import { useNpcsPage } from "../hooks/useNpcsPage"
import { DeleteNpcDialog } from "./delete-npc-dialog"
import { MonsterFilters } from "./monster-filters"
import { NpcsTable } from "./npcs-table"
import { UserNpcFormModal } from "./user-npc-form-modal"

export function NpcsPage() {
    const router = useRouter()
    const { filters, data, viewMode, setViewMode, actions, modals } = useNpcsPage()
    const deleteMutation = useDeleteNpc()
    const copyToNpcAction = useCopyToNpcAction("npc", { openFormOnCopy: false, onCopied: (npc) => router.push(getNpcDetailHref(npc, { edit: true })) })

    const handleConfirmDelete = async () => {
        if (!modals.selectedNpc) return
        await deleteMutation.mutateAsync(modals.selectedNpc._id)
        modals.closeAll()
    }

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Users className="h-5 w-5 sm:h-6 sm:w-6 text-red-400" />
                        Meus NPCs
                        <GlassViewSelector viewMode={viewMode} setViewMode={setViewMode} layoutId="npcs-view" />
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Gerencie seus NPCs personalizados.</p>
                </div>
                <button
                    onClick={actions.handleCreateClick}
                    className={cn("inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg", "bg-blue-500 text-white font-medium text-sm", "hover:bg-blue-600 transition-colors", "focus:outline-none focus:ring-2 focus:ring-blue-500/50", "shadow-lg shadow-blue-500/20", "w-full sm:w-auto")}
                >
                    <Plus className="h-4 w-4" />
                    Novo NPC
                </button>
            </div>

            <GlassCard>
                <GlassCardContent className="py-4">
                    <MonsterFilters
                        filters={{ ...filters, sources: [] }}
                        onSearchChange={actions.handleSearchChange}
                        onTypeChange={actions.handleTypeChange}
                        onSizeChange={actions.handleSizeChange}
                        onChallengeRatingChange={actions.handleChallengeRatingChange}
                        onStatusChange={actions.handleStatusChange}
                        onSourcesChange={() => {}}
                        isSearching={data.isLoading}
                    />
                </GlassCardContent>
            </GlassCard>

            <div className="overflow-hidden">
                <GlassCardContent className="p-0">
                    {viewMode === "default" ? (
                        <EntityList items={data.items} isLoading={data.isLoading} hasNextPage={data.hasNextPage} onLoadMore={data.fetchNextPage} isFetchingNextPage={data.isFetchingNextPage} entityType="NPC" onCopyToNpc={copyToNpcAction.handleCopyToNpc} onEdit={actions.handleEditClick} onDelete={actions.handleDeleteClick} isAdmin />
                    ) : (
                        <NpcsTable items={data.items} isLoading={data.isLoading} hasNextPage={data.hasNextPage} onLoadMore={data.fetchNextPage} isFetchingNextPage={data.isFetchingNextPage} onCopyToNpc={copyToNpcAction.handleCopyToNpc} onEdit={actions.handleEditClick} onDelete={actions.handleDeleteClick} isAdmin entityType="NPC" entityLabel="NPC" />
                    )}
                </GlassCardContent>
            </div>

            <UserNpcFormModal npc={modals.selectedNpc} isOpen={modals.isFormOpen} onClose={modals.closeAll} onSuccess={actions.handleSuccess} />
            <UserNpcFormModal npc={copyToNpcAction.copiedNpc} isOpen={copyToNpcAction.isFormOpen} onClose={copyToNpcAction.closeForm} onSuccess={copyToNpcAction.handleSuccess} />
            <DeleteNpcDialog monster={modals.selectedNpc} isOpen={modals.isDeleteOpen} onClose={modals.closeAll} onConfirm={handleConfirmDelete} isDeleting={deleteMutation.isPending} entityLabel="NPC" />
        </motion.div>
    )
}
