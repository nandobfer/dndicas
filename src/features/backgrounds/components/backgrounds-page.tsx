/**
 * @fileoverview Backgrounds catalog page component.
 * Follows the pattern of classes-page.tsx.
 */

"use client";

import { Plus, ShieldCheck } from "lucide-react"
import { motion } from "framer-motion"
import { useAuth } from "@/core/hooks/useAuth"
import { BackgroundsTable } from "./backgrounds-table"
import { BackgroundFilters } from "./background-filters"
import { EntityList } from "@/features/rules/components/entity-list"
import { BackgroundFormModal } from "./background-form-modal"
import { DeleteBackgroundDialog } from "./delete-background-dialog"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassViewSelector } from "@/components/ui/glass-view-selector"
import { motionConfig } from "@/lib/config/motion-configs"
import { useBackgroundsPage } from "../hooks/useBackgroundsPage"
import { Button } from "@/core/ui/button"
import { cn } from "@/core/utils/index"

export function BackgroundsPage() {
    const { isAdmin } = useAuth()

    const { isMobile, filters, data, modals, viewMode, setViewMode, actions } = useBackgroundsPage()

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6 text-blue-400" />
                        Origens
                        <GlassViewSelector viewMode={viewMode} setViewMode={setViewMode} layoutId="background-view" />
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Gerencie as origens disponíveis no sistema para criação de personagens.</p>
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
                        Nova Origem
                    </button>
                )}
            </div>

            {/* Filters Panel */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <BackgroundFilters
                        filters={filters}
                        onSearchChange={actions.handleSearchChange}
                        onStatusChange={actions.handleStatusChange}
                        onAttributesChange={actions.handleAttributesChange}
                        onSkillsChange={actions.handleSkillsChange}
                        onFeatsChange={actions.handleFeatsChange}
                        onSourcesChange={actions.handleSourcesChange}
                        isSearching={data.isLoading}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content Area */}
            <GlassCard className="border-white/5 overflow-hidden">
                <GlassCardContent className="p-0">
                    {viewMode === "table" && !isMobile ? (
                        <BackgroundsTable data={data.backgrounds} isLoading={data.isLoading} onEdit={actions.handleEditClick} onDelete={actions.handleDeleteClick} />
                    ) : (
                        <EntityList
                            items={data.backgrounds as any}
                            isLoading={data.isLoading}
                            hasNextPage={data.hasNextPage}
                            onLoadMore={data.fetchNextPage}
                            isFetchingNextPage={data.isFetchingNextPage}
                            entityType="Origem"
                            onEdit={actions.handleEditClick}
                            onDelete={actions.handleDeleteClick}
                            isAdmin={isAdmin}
                        />
                    )}
                </GlassCardContent>
            </GlassCard>

            {/* Modals & Dialogs */}
            <BackgroundFormModal isOpen={modals.isFormOpen} background={modals.selectedBackground} onClose={modals.closeAll} onSuccess={modals.closeAll} />

            <DeleteBackgroundDialog isOpen={modals.isDeleteOpen} background={modals.selectedBackground} onClose={modals.closeAll} />
        </motion.div>
    )
}
