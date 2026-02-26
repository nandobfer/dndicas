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
import { useAuth } from "@/core/hooks/useAuth"
import { useUsersFilters } from '../hooks/useUsersFilters';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { UserFilters } from '../components/user-filters';
import { UsersTable } from '../components/users-table';
import { UserList } from '../components/user-list';
import { UserFormModal } from '../components/user-form-modal';
import { UserDeleteDialog } from '../components/user-delete-dialog';
import { motionConfig } from '@/lib/config/motion-configs';
import { useUsersPage } from '../hooks/useUsersPage';
import type { UserResponse, CreateUserInput, UpdateUserInput } from '../types/user.types';

/**
 * Users page component with full CRUD functionality.
 */
export function UsersPage() {
  const { isAdmin } = useAuth()
  
  // Responsive logic moved to custom hook for better maintainability
  const { isMobile, filters, pagination, data, actions, modals } = useUsersPage();

  const isSearching = data.desktop.isFetching || data.mobile.isFetchingNextPage;

  return (
      <motion.div variants={motionConfig.variants.fadeInUp} initial="initial" animate="animate" className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white">Usuários</h1>
                  <p className="text-xs sm:text-sm text-white/60 mt-1">Gerencie os usuários do sistema</p>
              </div>

              {isAdmin && (
                  <button
                      onClick={actions.handleCreateClick}
                      className={cn(
                          "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
                          "bg-blue-600 text-white font-medium text-sm",
                          "hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20",
                          "focus:outline-none focus:ring-2 focus:ring-blue-600/50",
                          "w-full sm:w-auto" // Full width on mobile
                      )}
                  >
                      <Plus className="h-4 w-4" />
                      Novo Usuário
                  </button>
              )}
          </div>

          {/* Filters */}
          <GlassCard>
              <GlassCardContent className="py-4">
                  <UserFilters
                      filters={filters as any}
                      onSearchChange={actions.handleSearchChange}
                      onRoleChange={actions.handleRoleChange}
                      onStatusChange={actions.handleStatusChange}
                      isSearching={isSearching}
                  />
              </GlassCardContent>
          </GlassCard>

          {/* Content: Table for Desktop, List for Mobile */}
          {isMobile ? (
              <UserList
                  items={data.mobile.items}
                  isLoading={data.mobile.isLoading}
                  hasNextPage={data.mobile.hasNextPage}
                  isFetchingNextPage={data.mobile.isFetchingNextPage}
                  onLoadMore={data.mobile.fetchNextPage}
                  onEdit={actions.handleEditClick}
                  onDelete={actions.handleDeleteClick}
                  isAdmin={isAdmin}
              />
          ) : (
              <UsersTable
                  users={data.desktop.items}
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
          <UserFormModal
              isOpen={modals.isFormOpen}
              onClose={() => {
                  modals.setIsFormOpen(false)
              }}
              onSubmit={actions.handleFormSubmit}
              user={modals.selectedUser}
              isSubmitting={modals.isSaving}
          />

          {/* Delete Dialog */}
          <UserDeleteDialog
              isOpen={modals.isDeleteOpen}
              onClose={() => {
                  modals.setIsDeleteOpen(false)
              }}
              onConfirm={actions.handleDeleteConfirm}
              user={modals.selectedUser}
              isDeleting={modals.isDeleting}
          />
      </motion.div>
  )
}
