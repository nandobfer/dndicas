/**
 * @fileoverview Classes catalog page component.
 * Follows the pattern of spells-page.tsx.
 */

"use client";

import { Plus, Sword } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/core/utils"
import { useAuth } from "@/core/hooks/useAuth"
import { ClassesTable } from "./classes-table"
import { ClassesFilters } from "./classes-filters"
import { EntityList } from "@/features/rules/components/entity-list"
import { ClassFormModal } from "./class-form-modal"
import { DeleteClassDialog } from "./delete-class-dialog"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassViewSelector } from "@/components/ui/glass-view-selector"
import { motionConfig } from "@/lib/config/motion-configs"
import { useClassesPage } from "../hooks/useClassesPage"

export function ClassesPage() {
    const { isAdmin } = useAuth()

    const { isMobile, filters, pagination, data, actions, modals, viewMode, setViewMode, isDefault } = useClassesPage()

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Sword className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400" />
                        Classes
                        <GlassViewSelector viewMode={viewMode} setViewMode={setViewMode} layoutId="classes-view-selector" />
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Explore as classes disponíveis para personagens</p>
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
                            "w-full sm:w-auto"
                        )}
                    >
                        <Plus className="h-4 w-4" />
                        Nova Classe
                    </button>
                )}
            </div>

            {/* Filters Panel */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <ClassesFilters
                        filters={filters}
                        onSearchChange={actions.handleSearchChange}
                        onStatusChange={(v) => actions.handleStatusChange(v as "all" | "active" | "inactive")}
                        isSearching={data.paginated.isFetching || data.infinite.isFetching}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content: Conditional rendering based on viewMode */}
            {isDefault ? (
                <EntityList
                    items={data.infinite.items}
                    entityType="Classe"
                    isLoading={data.infinite.isLoading}
                    hasNextPage={data.infinite.hasNextPage}
                    isFetchingNextPage={data.infinite.isFetchingNextPage}
                    onLoadMore={data.infinite.fetchNextPage}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                    isAdmin={isAdmin}
                />
            ) : (
                <ClassesTable
                    classes={data.paginated.items}
                    isLoading={data.paginated.isLoading}
                    total={pagination.total}
                    page={pagination.page}
                    limit={pagination.limit}
                    hasActiveFilters={modals.hasActiveFilters}
                    onPageChange={pagination.setPage}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                />
            )}

            <ClassFormModal
                isOpen={modals.isFormOpen}
                characterClass={modals.selectedClass}
                onClose={() => modals.setIsFormOpen(false)}
                onSuccess={actions.handleFormSuccess}
            />

            <DeleteClassDialog
                isOpen={modals.isDeleteOpen}
                onClose={() => modals.setIsDeleteOpen(false)}
                onConfirm={actions.handleDeleteConfirm}
                classData={modals.selectedClass}
                isDeleting={modals.isSaving}
            />
        </motion.div>
    )
}
