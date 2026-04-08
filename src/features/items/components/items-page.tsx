/**
 * @fileoverview Main Items page component.
 */

"use client"

import { Plus, Backpack } from "lucide-react"
import { motion } from "framer-motion"
import { useAuth } from "@/core/hooks/useAuth"
import { ItemFilters } from "./item-filters"
import { ItemsTable } from "./items-table"
import { EntityList } from "@/features/rules/components/entity-list"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassViewSelector } from "@/components/ui/glass-view-selector"
import { motionConfig } from "@/lib/config/motion-configs"
import { useItemsPage } from "../hooks/useItemsPage"
import { useDeleteItem } from "../api/items-queries"
import { cn } from "@/core/utils/index"
import { ItemFormModal } from "./item-form-modal"
import { DeleteItemDialog } from "./delete-item-dialog"

export function ItemsPage() {
    const { isAdmin } = useAuth()

    const { isMobile, filters, data, viewMode, setViewMode, actions, modals } = useItemsPage()

    const deleteMutation = useDeleteItem()

    const handleConfirmDelete = async () => {
        if (!modals.selectedItem) return
        try {
            await deleteMutation.mutateAsync(modals.selectedItem._id)
            modals.closeAll()
        } catch (error) {
            console.error("Error deleting item:", error)
        }
    }

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Backpack className="h-5 w-5 sm:h-6 sm:w-6 text-slate-400" />
                        Itens
                        <GlassViewSelector viewMode={viewMode} setViewMode={setViewMode} layoutId="items-view" />
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Gerencie equipamentos, armas e itens mágicos do sistema.</p>
                </div>

                {isAdmin && (
                    <button
                        onClick={actions.handleCreateClick}
                        className={cn(
                            "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
                            "bg-blue-500 text-white font-medium text-sm",
                            "hover:bg-blue-600 transition-colors",
                            "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                            "shadow-lg shadow-blue-500/20",
                            "w-full sm:w-auto",
                        )}
                    >
                        <Plus className="h-4 w-4" />
                        Novo Item
                    </button>
                )}
            </div>

            {/* Filters Panel */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <ItemFilters
                        filters={{
                            search: filters.search,
                            type: filters.type,
                            rarity: filters.rarity,
                            status: filters.status,
                            sources: filters.sources,
                        }}
                        onSearchChange={actions.handleSearchChange}
                        onTypeChange={actions.handleTypeChange}
                        onRarityChange={actions.handleRarityChange}
                        onStatusChange={actions.handleStatusChange}
                        onSourcesChange={actions.handleSourcesChange}
                        isSearching={data.isLoading}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content Area */}
            <div className="overflow-hidden">
                <GlassCardContent className="p-0">
                    {viewMode === "default" ? (
                        <EntityList
                            items={data.items as any}
                            isLoading={data.isLoading}
                            hasNextPage={data.hasNextPage}
                            onLoadMore={data.fetchNextPage}
                            isFetchingNextPage={data.isFetchingNextPage}
                            entityType="Item"
                            onEdit={actions.handleEditClick}
                            onDelete={actions.handleDeleteClick}
                            isAdmin={isAdmin}
                        />
                    ) : (
                        <ItemsTable items={data.items as any} onEdit={actions.handleEditClick} onDelete={actions.handleDeleteClick} isAdmin={isAdmin} />
                    )}
                </GlassCardContent>
            </div>

            {/* Modals & Dialogs */}
            <ItemFormModal item={modals.selectedItem} isOpen={modals.isFormOpen} onClose={modals.closeAll} onSuccess={() => {}} />

            <DeleteItemDialog item={modals.selectedItem} isOpen={modals.isDeleteOpen} onClose={modals.closeAll} onConfirm={handleConfirmDelete} isDeleting={deleteMutation.isPending} />
        </motion.div>
    )
}
