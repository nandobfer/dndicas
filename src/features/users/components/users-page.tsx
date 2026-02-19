"use client";

/**
 * @fileoverview Users management page with SSR hydration.
 *
 * @see specs/000/spec.md - FR-008 through FR-016
 */

import * as React from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/core/utils';
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from '@/components/ui/glass-card';
import { useUsersFilters } from '../hooks/useUsersFilters';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { UserFilters } from '../components/user-filters';
import { UsersTable } from '../components/users-table';
import { UserFormModal } from '../components/user-form-modal';
import { UserDeleteDialog } from '../components/user-delete-dialog';
import { motionConfig } from '@/lib/config/motion-configs';
import type { User, UserResponse, CreateUserInput, UpdateUserInput } from '../types/user.types';

/**
 * Users page component with full CRUD functionality.
 */
export function UsersPage() {
  // Filters state
  const {
    filters,
    setSearch,
    setRole,
    setStatus,
    setPage,
  } = useUsersFilters();

  // Data fetching
  const { data, isLoading, isFetching } = useUsers(filters);

  // Mutations
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  // Modal state
  const [isFormModalOpen, setIsFormModalOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserResponse | null>(null);

  // Handlers
  const handleCreateClick = () => {
    setSelectedUser(null);
    setIsFormModalOpen(true);
  };

  const handleEditClick = (user: UserResponse) => {
    setSelectedUser(user);
    setIsFormModalOpen(true);
  };

  const handleDeleteClick = (user: UserResponse) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleFormSubmit = async (formData: CreateUserInput | UpdateUserInput) => {
    if (selectedUser) {
      // Update
      await updateMutation.mutateAsync({
        id: selectedUser.id,
        data: formData as UpdateUserInput,
      });
    } else {
      // Create
      await createMutation.mutateAsync(formData as CreateUserInput);
    }
    setIsFormModalOpen(false);
    setSelectedUser(null);
  };

  const handleDeleteConfirm = async () => {
    if (selectedUser) {
      await deleteMutation.mutateAsync(selectedUser.id);
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const users = data?.items || [];
  const total = data?.total || 0;
  const isSearching = isFetching && !isLoading;

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
          <h1 className="text-2xl font-bold text-white">Usuários</h1>
          <p className="text-sm text-white/60 mt-1">
            Gerencie os usuários do sistema
          </p>
        </div>

        <button
          onClick={handleCreateClick}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-emerald-500 text-white font-medium text-sm',
            'hover:bg-emerald-600 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-emerald-500/50'
          )}
        >
          <Plus className="h-4 w-4" />
          Novo Usuário
        </button>
      </div>

      {/* Filters */}
      <GlassCard>
        <GlassCardContent className="py-4">
          <UserFilters
            filters={filters}
            onSearchChange={setSearch}
            onRoleChange={setRole}
            onStatusChange={setStatus}
            isSearching={isSearching}
          />
        </GlassCardContent>
      </GlassCard>

      {/* Table */}
      <UsersTable
        users={users}
        total={total}
        page={filters.page || 1}
        limit={filters.limit || 10}
        isLoading={isLoading}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        onPageChange={setPage}
      />

      {/* Form Modal */}
      <UserFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setSelectedUser(null);
        }}
        onSubmit={handleFormSubmit}
        user={selectedUser}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Dialog */}
      <UserDeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setSelectedUser(null);
        }}
        onConfirm={handleDeleteConfirm}
        user={selectedUser}
        isDeleting={deleteMutation.isPending}
      />
    </motion.div>
  );
}
