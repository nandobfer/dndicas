"use client";

/**
 * @fileoverview Users table component with server-side pagination.
 *
 * @see specs/000/spec.md - FR-013, FR-016
 */

import * as React from 'react';
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { MoreHorizontal, Pencil, Trash2, Users } from "lucide-react"
import { cn } from "@/core/utils"
import { useAuth } from "@/core/hooks/useAuth"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { UserMini } from "@/components/ui/user-mini"
import { Chip, chipVariantMap } from "@/components/ui/chip"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { GlassDropdownMenu, GlassDropdownMenuContent, GlassDropdownMenuItem, GlassDropdownMenuTrigger } from "@/components/ui/glass-dropdown-menu"
import { GlassTooltip, GlassTooltipContent, GlassTooltipTrigger } from "@/components/ui/glass-tooltip"
import { motionConfig } from "@/lib/config/motion-configs"
import type { UserResponse } from "../types/user.types"

export interface UsersTableProps {
    /** List of users to display */
    users: UserResponse[]
    /** Total number of users (for pagination) */
    total: number
    /** Current page number */
    page: number
    /** Items per page */
    limit: number
    /** Whether table is loading */
    isLoading?: boolean
    /** Edit user callback */
    onEdit: (user: UserResponse) => void
    /** Delete user callback */
    onDelete: (user: UserResponse) => void
    /** Page change callback */
    onPageChange: (page: number) => void
}

/**
 * Table header columns.
 */
const columns = [
    { key: "status", label: "Status", className: "w-[100px]" },
    { key: "user", label: "Usuário", className: "w-full pl-0" },
    { key: "role", label: "Função", className: "w-[15%] text-right" },
    { key: "actions", label: "", className: "w-[8%] text-right" },
]

/**
 * UsersTable component with animations and pagination.
 */
export function UsersTable({ users, total, page, limit, isLoading = false, onEdit, onDelete, onPageChange }: UsersTableProps) {
    const { userId } = useAuth()
    const totalPages = Math.ceil(total / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    // Loading state
    if (isLoading && users.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <LoadingState variant="skeleton" message="Carregando usuários..." />
                </GlassCardContent>
            </GlassCard>
        )
    }

    // Empty state
    if (!isLoading && users.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <EmptyState title="Nenhum usuário encontrado" description="Tente ajustar os filtros ou criar um novo usuário" icon={Users} />
                </GlassCardContent>
            </GlassCard>
        )
    }

    return (
        <GlassCard>
            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    {/* Header */}
                    <thead>
                        <tr className="border-b border-white/10">
                            {columns.map((col) => (
                                <th key={col.key} className={cn("px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider", col.className)}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout">
                            {users.map((user, index) => (
                                <motion.tr
                                    key={user.id}
                                    variants={motionConfig.variants.tableRow}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ delay: index * 0.05 }}
                                    className={cn("group transition-colors hover:bg-white/5", isLoading && "opacity-50")}
                                >
                                    {/* Status */}
                                    <td className="px-4 py-3">
                                        <Chip variant={chipVariantMap[user.status]} size="sm">
                                            {user.status === "active" ? "Ativo" : "Inativo"}
                                        </Chip>
                                    </td>

                                    {/* User */}
                                    <td className="py-3 pl-0 min-w-[200px]">
                                        <UserMini name={user.name} username={user.username} email={user.email} avatarUrl={user.avatarUrl} />
                                    </td>

                                    {/* Role */}
                                    <td className="px-4 py-3 text-right">
                                        <Chip variant={chipVariantMap[user.role]} size="sm">
                                            {user.role === "admin" ? "Admin" : "User"}
                                        </Chip>
                                    </td>

                                    {/* Actions */}
                                    <td className="px-4 py-3 text-right">
                                        <GlassDropdownMenu>
                                            <GlassDropdownMenuTrigger asChild>
                                                <button
                                                    className={cn(
                                                        "p-2 rounded-lg transition-colors",
                                                        "text-white/40 hover:text-white hover:bg-white/10",
                                                        "opacity-0 group-hover:opacity-100 focus:opacity-100",
                                                    )}
                                                    aria-label="Ações do usuário"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>
                                            </GlassDropdownMenuTrigger>
                                            <GlassDropdownMenuContent align="end">
                                                <GlassDropdownMenuItem onClick={() => onEdit(user)}>
                                                    <Pencil className="h-4 w-4" />
                                                    Editar
                                                </GlassDropdownMenuItem>
                                                {user.clerkId === userId ? (
                                                    <GlassTooltip>
                                                        <GlassTooltipTrigger asChild>
                                                            <div>
                                                                <GlassDropdownMenuItem disabled className="text-rose-400/50 cursor-not-allowed opacity-50">
                                                                    <Trash2 className="h-4 w-4" />
                                                                    Excluir
                                                                </GlassDropdownMenuItem>
                                                            </div>
                                                        </GlassTooltipTrigger>
                                                        <GlassTooltipContent side="left">
                                                            Você não pode excluir a si mesmo
                                                        </GlassTooltipContent>
                                                    </GlassTooltip>
                                                ) : (
                                                    <GlassDropdownMenuItem onClick={() => onDelete(user)} className="text-rose-400 focus:text-rose-400">
                                                        <Trash2 className="h-4 w-4" />
                                                        Excluir
                                                    </GlassDropdownMenuItem>
                                                )}
                                            </GlassDropdownMenuContent>
                                        </GlassDropdownMenu>
                                    </td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <DataTablePagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={onPageChange} itemLabel="usuários" />
        </GlassCard>
    )
}
