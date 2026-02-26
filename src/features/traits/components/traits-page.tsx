"use client";

import * as React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/core/utils';
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { useAuth } from "@/core/hooks/useAuth"
import { TraitsFilters } from "./traits-filters"
import { TraitsTable } from "./traits-table"
import { EntityList } from "@/features/rules/components/entity-list"
import { TraitFormModal } from "./trait-form-modal"
import { DeleteTraitDialog } from "./delete-trait-dialog"
import { motionConfig } from "@/lib/config/motion-configs"
import { useTraitsPage } from "../hooks/useTraitsPage"

export function TraitsPage() {
    const { isAdmin } = useAuth()

    // Logic moved to custom hook for better maintainability (T044)
    const { isMobile, filters, pagination, data, actions, modals } = useTraitsPage()

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400" />
                        Catálogo de Habilidades
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Gerencie habilidades e traits do sistema (D&D 5e)</p>
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
                        Nova Habilidade
                    </button>
                )}
            </div>

            {/* Filters */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <TraitsFilters
                        filters={{ search: filters.search, status: filters.status }}
                        onSearchChange={actions.handleSearchChange}
                        onStatusChange={actions.handleStatusChange}
                        isSearching={data.desktop.isFetching || data.mobile.isFetching}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content: Table for Desktop, List for Mobile (T042) */}
            {isMobile ? (
                <EntityList
                    items={data.mobile.items}
                    entityType="Habilidade"
                    isLoading={data.mobile.isLoading}
                    hasNextPage={data.mobile.hasNextPage}
                    isFetchingNextPage={data.mobile.isFetchingNextPage}
                    onLoadMore={data.mobile.fetchNextPage}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                    isAdmin={isAdmin}
                />
            ) : (
                <TraitsTable
                    traits={data.desktop.items}
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
            <TraitFormModal isOpen={modals.isFormOpen} onClose={() => modals.setIsFormOpen(false)} onSubmit={actions.handleFormSubmit} trait={modals.selectedTrait} isSubmitting={modals.isSaving} />

            {/* Delete Dialog */}
            <DeleteTraitDialog
                isOpen={modals.isDeleteOpen}
                onClose={() => modals.setIsDeleteOpen(false)}
                onConfirm={actions.handleDeleteConfirm}
                trait={modals.selectedTrait}
                isDeleting={modals.isDeleting}
            />
        </motion.div>
    )
}
