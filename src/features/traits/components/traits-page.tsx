"use client";

import * as React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/core/utils';
import { GlassCard, GlassCardContent } from '@/components/ui/glass-card';
import { useTraits } from '../hooks/useTraits';
import { useTraitMutations } from '../hooks/useTraitMutations';
import { useAuth } from "@/core/hooks/useAuth"
import { TraitsFilters } from './traits-filters';
import { TraitsTable } from './traits-table';
import { TraitFormModal } from './trait-form-modal';
import { DeleteTraitDialog } from './delete-trait-dialog';
import { motionConfig } from '@/lib/config/motion-configs';
import type { Trait, CreateTraitInput, UpdateTraitInput, TraitFilterParams } from "../types/traits.types"
import { useDebounce } from "@/core/hooks/useDebounce"

export function TraitsPage() {
    const { isAdmin } = useAuth()
    // State
    const [page, setPage] = React.useState(1)
    const [search, setSearch] = React.useState("")
    const [status, setStatus] = React.useState<TraitFilterParams["status"]>("all")

    // Debounced search
    const debouncedSearch = useDebounce(search, 500)

    // Filters object for query
    const filters: TraitFilterParams = React.useMemo(
        () => ({
            page,
            limit: 10,
            search: debouncedSearch,
            status,
        }),
        [page, debouncedSearch, status],
    )

    // Data fetching
    const { data, isLoading, isFetching } = useTraits(filters)
    const { create, update, remove } = useTraitMutations()

    // Modal state
    const [isFormOpen, setIsFormOpen] = React.useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)
    const [selectedTrait, setSelectedTrait] = React.useState<Trait | null>(null)

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value)
        setPage(1) // Reset to page 1 on search
    }

    const handleStatusChange = (value: TraitFilterParams["status"]) => {
        setStatus(value)
        setPage(1)
    }

    const handleCreateClick = () => {
        setSelectedTrait(null)
        setIsFormOpen(true)
    }

    const handleEditClick = (trait: Trait) => {
        setSelectedTrait(trait)
        setIsFormOpen(true)
    }

    const handleDeleteClick = (trait: Trait) => {
        setSelectedTrait(trait)
        setIsDeleteOpen(true)
    }

    const handleFormSubmit = async (formData: CreateTraitInput | UpdateTraitInput) => {
        try {
            if (selectedTrait) {
                await update.mutateAsync({
                    id: selectedTrait._id, // Using _id directly from Mongoose
                    data: formData as UpdateTraitInput,
                })
            } else {
                await create.mutateAsync(formData as CreateTraitInput)
            }
            setIsFormOpen(false)
            setSelectedTrait(null)
        } catch (error) {
            console.error("Failed to save trait:", error)
            // Error handling usually handled by global toast or mutation onError
        }
    }

    const handleDeleteConfirm = async () => {
        if (selectedTrait) {
            try {
                await remove.mutateAsync(selectedTrait._id)
                setIsDeleteOpen(false)
                setSelectedTrait(null)
            } catch (error) {
                console.error("Failed to delete trait:", error)
            }
        }
    }

    const traits = data?.items || []
    const total = data?.total || 0

    return (
        <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-emerald-400" />
                        Catálogo de Habilidades
                    </h1>
                    <p className="text-sm text-white/60 mt-1">Gerencie habilidades e traits do sistema (D&D 5e)</p>
                </div>

                {isAdmin && (
                    <button
                        onClick={handleCreateClick}
                        className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                            "bg-purple-500 text-white font-medium text-sm",
                            "hover:bg-purple-600 transition-colors",
                            "focus:outline-none focus:ring-2 focus:ring-purple-500/50",
                            "shadow-lg shadow-purple-500/20"
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
                        filters={{ search, status }}
                        onSearchChange={handleSearchChange}
                        onStatusChange={handleStatusChange}
                        isSearching={isFetching && !isLoading}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Table */}
            <TraitsTable
                traits={traits}
                total={total}
                page={filters.page || 1}
                limit={filters.limit || 10}
                isLoading={isLoading}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                onPageChange={setPage}
            />

            {/* Form Modal */}
            <TraitFormModal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSubmit={handleFormSubmit}
                trait={selectedTrait}
                isSubmitting={create.isPending || update.isPending}
            />

            {/* Delete Dialog */}
            <DeleteTraitDialog
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={handleDeleteConfirm}
                trait={selectedTrait}
                isDeleting={remove.isPending}
            />
        </motion.div>
    )
}
