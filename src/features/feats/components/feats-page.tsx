"use client";

import { Plus, Zap } from 'lucide-react';
import { motion } from "framer-motion"
import { cn } from "@/core/utils"
import { useAuth } from "@/core/hooks/useAuth"
import { FeatsTable } from "./feats-table"
import { FeatsFilters } from "./feats-filters"
import { EntityList } from "@/features/rules/components/entity-list"
import { FeatFormModal } from "./feat-form-modal"
import { DeleteFeatDialog } from "./delete-feat-dialog"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { useFeatsPage } from "../hooks/useFeatsPage"

export function FeatsPage() {
    const { isAdmin } = useAuth()

    // Logic moved to custom hook for better maintainability (T044)
    const { isMobile, filters, pagination, data, actions, modals } = useFeatsPage()

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400" />
                        Catálogo de Talentos
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Gerencie os talentos disponíveis para personagens (D&D 5e)</p>
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
                            "w-full sm:w-auto", // Full width on mobile
                        )}
                    >
                        <Plus className="h-4 w-4" />
                        Novo Talento
                    </button>
                )}
            </div>

            {/* Filters */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <FeatsFilters
                        filters={{
                            ...filters,
                            search: filters.search,
                            status: filters.status,
                            level: filters.level,
                            levelMax: filters.levelMax,
                            attributes: filters.attributes,
                        }}
                        onSearchChange={actions.handleSearchChange}
                        onStatusChange={actions.handleStatusChange}
                        onLevelChange={actions.handleLevelChange}
                        onAttributesChange={actions.handleAttributesChange}
                        isSearching={data.desktop.isFetching || data.mobile.isFetching}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content: Table for Desktop, List for Mobile (T042) */}
            {isMobile ? (
                <EntityList
                    items={data.mobile.items}
                    entityType="Talento"
                    isLoading={data.mobile.isLoading}
                    hasNextPage={data.mobile.hasNextPage}
                    isFetchingNextPage={data.mobile.isFetchingNextPage}
                    onLoadMore={data.mobile.fetchNextPage}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                    isAdmin={isAdmin}
                />
            ) : (
                <FeatsTable
                    feats={data.desktop.items}
                    total={pagination.total}
                    page={pagination.page}
                    limit={pagination.limit}
                    isLoading={data.desktop.isLoading}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                    onPageChange={pagination.setPage}
                />
            )}

            {/* Form Modal */}
            <FeatFormModal isOpen={modals.isFormOpen} onClose={() => modals.setIsFormOpen(false)} onSubmit={actions.handleFormSubmit} feat={modals.selectedFeat} isSubmitting={modals.isSaving} />

            {/* Delete Confirmation Dialog */}
            <DeleteFeatDialog
                isOpen={modals.isDeleteOpen}
                onClose={() => modals.setIsDeleteOpen(false)}
                onConfirm={actions.handleDeleteConfirm}
                feat={modals.selectedFeat}
                isDeleting={modals.isDeleting}
            />
        </motion.div>
    )
}
