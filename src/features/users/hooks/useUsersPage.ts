"use client";

import * as React from 'react';
import { useUsers, useInfiniteUsers, useCreateUser, useUpdateUser, useDeleteUser } from './useUsers';
import { useDebounce } from '@/core/hooks/useDebounce';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import type { 
    UserResponse, 
    UserFilters, 
    CreateUserInput, 
    UpdateUserInput 
} from '../types/user.types';

/**
 * Hook for logic of the Users page, featuring responsive data fetching 
 * (Query for desktop/Table, InfiniteQuery for mobile/List).
 */
export function useUsersPage() {
    const isMobile = useIsMobile();
    
    // State
    const [page, setPage] = React.useState(1);
    const [search, setSearch] = React.useState("");
    const [role, setRole] = React.useState<UserFilters['role']>(undefined);
    const [status, setStatus] = React.useState<UserFilters['status']>(undefined);
    
    // Debounced search
    const debouncedSearch = useDebounce(search, 500);

    // Common filters object
    const filters = React.useMemo(() => ({
        search: debouncedSearch,
        role,
        status,
        limit: 10,
    }), [debouncedSearch, role, status]);

    /**
     * Data Fetching
     * Uses regular query for desktop table and infinite query for mobile list.
     */
    
    // Desktop View Data
    const desktopData = useUsers({
        ...filters,
        page,
    }, { enabled: !isMobile });

    // Mobile View Data
    const mobileData = useInfiniteUsers(filters, { enabled: isMobile });

    // Mutations
    const createMutation = useCreateUser();
    const updateMutation = useUpdateUser();
    const deleteMutation = useDeleteUser();

    // UI state
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
    const [selectedUser, setSelectedUser] = React.useState<UserResponse | null>(null);

    // Handlers
    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const handleRoleChange = (value: UserFilters['role']) => {
        setRole(value);
        setPage(1);
    };

    const handleStatusChange = (value: UserFilters['status']) => {
        setStatus(value);
        setPage(1);
    };

    const handleCreateClick = () => {
        setSelectedUser(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (user: UserResponse) => {
        setSelectedUser(user);
        setIsFormOpen(true);
    };

    const handleDeleteClick = (user: UserResponse) => {
        setSelectedUser(user);
        setIsDeleteOpen(true);
    };

    const handleFormSubmit = async (formData: CreateUserInput | UpdateUserInput) => {
        if (selectedUser) {
            await updateMutation.mutateAsync({
                id: selectedUser.id,
                data: formData as UpdateUserInput
            });
        } else {
            await createMutation.mutateAsync(formData as CreateUserInput);
        }
        setIsFormOpen(false);
        setSelectedUser(null);
    };

    const handleDeleteConfirm = async () => {
        if (selectedUser) {
            await deleteMutation.mutateAsync(selectedUser.id);
            setIsDeleteOpen(false);
            setSelectedUser(null);
        }
    };

    return {
        isMobile,
        filters: {
            search,
            role,
            status,
        },
        pagination: {
            page,
            setPage,
            total: desktopData.data?.total || 0,
            limit: 10,
        },
        data: {
            desktop: {
                items: desktopData.data?.items || [],
                isLoading: desktopData.isLoading,
                isFetching: desktopData.isFetching,
            },
            mobile: {
                items: mobileData.data?.pages.flatMap(p => p.items) || [],
                isLoading: mobileData.isLoading,
                isFetchingNextPage: mobileData.isFetchingNextPage,
                hasNextPage: !!mobileData.hasNextPage,
                fetchNextPage: mobileData.fetchNextPage,
            }
        },
        actions: {
            handleSearchChange,
            handleRoleChange,
            handleStatusChange,
            handleCreateClick,
            handleEditClick,
            handleDeleteClick,
            handleFormSubmit,
            handleDeleteConfirm,
        },
        modals: {
            isFormOpen,
            setIsFormOpen,
            isDeleteOpen,
            setIsDeleteOpen,
            selectedUser,
            isSaving: createMutation.isPending || updateMutation.isPending,
            isDeleting: deleteMutation.isPending,
        }
    };
}
