"use client";

import * as React from 'react';
import { Plus, Ruler } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/core/utils"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassSelector } from "@/components/ui/glass-selector"
import { useAuth } from "@/core/hooks/useAuth"
import { useViewMode } from "@/core/hooks/useViewMode"
import { RulesFilter } from "./rules-filters"
import { RulesTable } from "./rules-table"
import { EntityList } from "./entity-list"
import { RuleFormModal } from "./rule-form-modal"
import { DeleteRuleDialog } from "./delete-rule-dialog"
import { motionConfig } from "@/lib/config/motion-configs"
import { useRulesPage } from "../hooks/useRulesPage"

export function RulesPage() {
    const { isAdmin } = useAuth()

    // Logic moved to custom hook for better maintainability (T044)
    const { isMobile, filters, pagination, data, actions, modals, viewMode, setViewMode, isDefault } = useRulesPage()

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Ruler className="h-5 w-5 sm:h-6 sm:w-6 text-slate-400 items-center" />
                        Catálogo de Regras
                        {!isMobile && (
                            <GlassSelector
                                value={viewMode}
                                onChange={(v) => setViewMode(v as any)}
                                options={[
                                    { value: "default", label: "Padrão" },
                                    { value: "table", label: "Tabela" },
                                ]}
                                size="sm"
                                layoutId="rules-view-selector"
                            />
                        )}
                    </h1>
                    <p className="text-[xs] sm:text-sm text-white/60 mt-1">Gerencie as regras de referência do sistema (D&D 5e)</p>
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
                        Nova Regra
                    </button>
                )}
            </div>

            {/* Filters */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <RulesFilter
                        filters={{ search: filters.search, status: filters.status }}
                        onSearchChange={actions.handleSearchChange}
                        onStatusChange={actions.handleStatusChange}
                        isSearching={data.paginated.isFetching || data.infinite.isFetching}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content: Conditional rendering based on viewMode */}
            {isDefault ? (
                <EntityList
                    items={data.infinite.items}
                    entityType="Regra"
                    isLoading={data.infinite.isLoading}
                    hasNextPage={data.infinite.hasNextPage}
                    isFetchingNextPage={data.infinite.isFetchingNextPage}
                    onLoadMore={data.infinite.fetchNextPage}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                    isAdmin={isAdmin}
                />
            ) : (
                <RulesTable
                    rules={data.paginated.items}
                    total={pagination.total}
                    page={pagination.page}
                    limit={pagination.limit}
                    isLoading={data.paginated.isLoading}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                    onPageChange={pagination.setPage}
                />
            )}

            {/* Form Modal */}
            <RuleFormModal isOpen={modals.isFormOpen} onClose={() => modals.setIsFormOpen(false)} onSubmit={actions.handleFormSubmit} rule={modals.selectedRule} isSubmitting={modals.isSaving} />

            {/* Delete Dialog */}
            <DeleteRuleDialog
                isOpen={modals.isDeleteOpen}
                onClose={() => modals.setIsDeleteOpen(false)}
                onConfirm={actions.handleDeleteConfirm}
                rule={modals.selectedRule}
                isDeleting={modals.isDeleting}
            />
        </motion.div>
    )
}
