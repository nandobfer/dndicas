/**
 * @fileoverview Main Races page component.
 */

"use client"

import { Plus, Fingerprint } from "lucide-react"
import { motion } from "framer-motion"
import { useAuth } from "@/core/hooks/useAuth"
import { RacesTable } from "./races-table"
import { RaceFilters } from "./race-filters"
import { EntityList } from "@/features/rules/components/entity-list"
import { RaceFormModal } from "./race-form-modal"
import { DeleteRaceDialog } from "./delete-race-dialog"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { GlassViewSelector } from "@/components/ui/glass-view-selector"
import { motionConfig } from "@/lib/config/motion-configs"
import { useRacesPage } from "../hooks/useRacesPage"
import { cn } from "@/core/utils/index"

export function RacesPage() {
    const { isAdmin } = useAuth()

    const { isMobile, filters, data, modals, viewMode, setViewMode, actions } = useRacesPage()

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Fingerprint className="h-5 w-5 sm:h-6 sm:w-6 text-red-400" />
                        Raças
                        <GlassViewSelector viewMode={viewMode} setViewMode={setViewMode} layoutId="races-view" />
                    </h1>
                    <p className="text-[10px] sm:text-sm text-white/60 mt-1">Gerencie as raças disponíveis no sistema para criação de personagens.</p>
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
                        Nova Raça
                    </button>
                )}
            </div>

            {/* Filters Panel */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <RaceFilters
                        filters={{ search: filters.search }}
                        onSearchChange={actions.handleSearchChange}
                        isSearching={data.isLoading}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content Area */}
            <GlassCard className="border-white/5 overflow-hidden">
                <GlassCardContent className="p-0">
                    {viewMode === "table" && !isMobile ? (
                        <RacesTable
                            data={data.races}
                            isLoading={data.isLoading}
                            onEdit={actions.handleEditClick}
                            onDelete={actions.handleDeleteClick}
                        />
                    ) : (
                        <EntityList
                            items={data.races as any}
                            isLoading={data.isLoading}
                            hasNextPage={data.hasNextPage}
                            onLoadMore={data.fetchNextPage}
                            isFetchingNextPage={data.isFetchingNextPage}
                            entityType="Raça"
                            onEdit={actions.handleEditClick}
                            onDelete={actions.handleDeleteClick}
                            isAdmin={isAdmin}
                        />
                    )}
                </GlassCardContent>
            </GlassCard>

            {/* Modals & Dialogs */}
            <RaceFormModal
                isOpen={modals.isFormOpen}
                race={modals.selectedRace}
                onClose={modals.closeAll}
                onSuccess={modals.closeAll}
            />

            <DeleteRaceDialog
                isOpen={modals.isDeleteOpen}
                race={modals.selectedRace}
                onClose={modals.closeAll}
            />
        </motion.div>
    )
}
