/**
 * @fileoverview Spells catalog page component.
 * User Story 1: View & Search spells.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004, FR-005
 */

"use client";

import { Plus, Wand } from 'lucide-react';
import { motion } from "framer-motion"
import { cn } from "@/core/utils"
import { useAuth } from "@/core/hooks/useAuth"
import { SpellsTable } from "./spells-table"
import { SpellsFilters } from "./spells-filters"
import { EntityList } from "@/features/rules/components/entity-list"
import { SpellFormModal } from "./spell-form-modal"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { motionConfig } from "@/lib/config/motion-configs"
import { useSpellsPage } from "../hooks/useSpellsPage"

export function SpellsPage() {
    const { isAdmin } = useAuth()

    // Logic moved to custom hook for better maintainability (T044)
    const { isMobile, filters, pagination, data, actions, modals } = useSpellsPage()

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Wand className="h-5 w-5 sm:h-6 sm:w-6 text-purple-400" />
                        Catálogo de Magias
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Explore as magias disponíveis para conjuradores (D&D 5e)</p>
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
                        Nova Magia
                    </button>
                )}
            </div>

            {/* Filters Panel */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <SpellsFilters
                        filters={filters}
                        onSearchChange={actions.handleSearchChange}
                        onStatusChange={actions.handleStatusChange}
                        onCircleChange={actions.handleCircleChange}
                        onSchoolsChange={actions.handleSchoolsChange}
                        onAttributesChange={actions.handleAttributesChange}
                        onDiceTypesChange={actions.handleDiceTypesChange}
                        isSearching={data.desktop.isFetching || data.mobile.isFetching}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content: Table for Desktop, List for Mobile (T042) */}
            {isMobile ? (
                <EntityList
                    items={data.mobile.items}
                    entityType="Magia"
                    isLoading={data.mobile.isLoading}
                    hasNextPage={data.mobile.hasNextPage}
                    isFetchingNextPage={data.mobile.isFetchingNextPage}
                    onLoadMore={data.mobile.fetchNextPage}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                    isAdmin={isAdmin}
                />
            ) : (
                <SpellsTable
                    spells={data.desktop.items}
                    isLoading={data.desktop.isLoading}
                    total={pagination.total}
                    page={pagination.page}
                    limit={pagination.limit}
                    hasActiveFilters={modals.hasActiveFilters}
                    onPageChange={pagination.setPage}
                    onEdit={actions.handleEditClick}
                    onDelete={actions.handleDeleteClick}
                />
            )}

            <SpellFormModal isOpen={modals.isFormOpen} spell={modals.selectedSpell} onClose={() => modals.setIsFormOpen(false)} onSuccess={actions.handleFormSuccess} />
        </motion.div>
    )
}
