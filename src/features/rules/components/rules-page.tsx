"use client";

import * as React from 'react';
import { Plus, Ruler } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/core/utils';
import { GlassCard, GlassCardContent } from '@/components/ui/glass-card';
import { useRules } from '../hooks/useRules';
import { useRuleMutations } from '../hooks/useRuleMutations';
import { RulesFilter } from './rules-filters';
import { RulesTable } from './rules-table';
import { RuleFormModal } from './rule-form-modal';
import { DeleteRuleDialog } from './delete-rule-dialog';
import { motionConfig } from '@/lib/config/motion-configs';
import type { Reference, CreateReferenceInput, UpdateReferenceInput, RulesFilters } from '../types/rules.types';
import { useDebounce } from '@/core/hooks/useDebounce';

export function RulesPage() {
    // State
    const [page, setPage] = React.useState(1);
    const [search, setSearch] = React.useState("");
    const [status, setStatus] = React.useState<RulesFilters['status']>('all');
    
    // Debounced search
    const debouncedSearch = useDebounce(search, 500);

    // Filters object for query
    const filters: RulesFilters = React.useMemo(() => ({
        page,
        limit: 10,
        search: debouncedSearch,
        status,
    }), [page, debouncedSearch, status]);

    // Data fetching
    const { data, isLoading, isFetching } = useRules(filters);
    const { createRule, updateRule, deleteRule } = useRuleMutations();

    // Modal state
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [selectedRule, setSelectedRule] = React.useState<Reference | null>(null);

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1); // Reset to page 1 on search
    };

    const handleStatusChange = (value: RulesFilters['status']) => {
        setStatus(value);
        setPage(1);
    };

    const handleCreateClick = () => {
        setSelectedRule(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (rule: Reference) => {
        setSelectedRule(rule);
        setIsFormOpen(true);
    };

    const handleDeleteClick = (rule: Reference) => {
        setSelectedRule(rule);
        setIsDeleteOpen(true);
    };

    const handleFormSubmit = async (formData: CreateReferenceInput | UpdateReferenceInput) => {
        try {
            if (selectedRule) {
                await updateRule.mutateAsync({
                    id: selectedRule._id, // Using _id directly from Mongoose
                    data: formData as UpdateReferenceInput
                });
            } else {
                await createRule.mutateAsync(formData as CreateReferenceInput);
            }
            setIsFormOpen(false);
            setSelectedRule(null);
        } catch (error) {
            console.error("Failed to save rule:", error);
            // Error handling usually handles by global toast or mutation onError
        }
    };

    const handleDeleteConfirm = async () => {
        if (selectedRule) {
            try {
                await deleteRule.mutateAsync(selectedRule._id);
                setIsDeleteOpen(false);
                setSelectedRule(null);
            } catch (error) {
                console.error("Failed to delete rule:", error);
            }
        }
    };

    const rules = data?.items || [];
    const total = data?.total || 0;

    return (
        <motion.div
            variants={motionConfig.variants.fadeInUp}
            initial="initial"
            animate="animate"
            className="space-y-6"
        >
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Ruler className="h-6 w-6 text-blue-400" />
                        Catálogo de Regras
                    </h1>
                    <p className="text-sm text-white/60 mt-1">
                        Gerencie as regras de referência do sistema (D&D 5e)
                    </p>
                </div>

                <button
                    onClick={handleCreateClick}
                    className={cn(
                        'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
                        'bg-blue-500 text-white font-medium text-sm',
                        'hover:bg-blue-600 transition-colors',
                        'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                        'shadow-lg shadow-blue-500/20'
                    )}
                >
                    <Plus className="h-4 w-4" />
                    Nova Regra
                </button>
            </div>

            {/* Filters */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <RulesFilter
                        filters={{ search, status }}
                        onSearchChange={handleSearchChange}
                        onStatusChange={handleStatusChange}
                        isSearching={isFetching && !isLoading}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Table */}
            <RulesTable 
                rules={rules}
                total={total}
                page={filters.page || 1}
                limit={filters.limit || 10}
                isLoading={isLoading}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                onPageChange={setPage}
            />

            {/* Form Modal */}
            <RuleFormModal 
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSubmit={handleFormSubmit}
                rule={selectedRule}
                isSubmitting={createRule.isPending || updateRule.isPending}
            />

            {/* Delete Dialog */}
            <DeleteRuleDialog 
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={handleDeleteConfirm}
                rule={selectedRule}
                isDeleting={deleteRule.isPending}
            />
        </motion.div>
    );
}
