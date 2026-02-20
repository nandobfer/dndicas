"use client";

/**
 * @fileoverview User delete confirmation dialog.
 *
 * @see specs/000/spec.md - FR-011
 */

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/core/utils';
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { UserMini } from "@/components/ui/user-mini"
import type { UserResponse } from "../types/user.types"

export interface UserDeleteDialogProps {
    /** Whether the dialog is open */
    isOpen: boolean
    /** Close dialog callback */
    onClose: () => void
    /** Confirm delete callback */
    onConfirm: () => Promise<void>
    /** User to delete */
    user: UserResponse | null
    /** Whether deletion is in progress */
    isDeleting?: boolean
}

/**
 * User delete confirmation dialog.
 * Liquid Glass styling applied with custom action buttons to match проект standards.
 *
 * @example
 * ```tsx
 * <UserDeleteDialog
 *   isOpen={isDeleteOpen}
 *   onClose={() => setIsDeleteOpen(false)}
 *   onConfirm={handleDelete}
 *   user={userToDelete}
 *   isDeleting={isDeleting}
 * />
 * ```
 */
export function UserDeleteDialog({ isOpen, onClose, onConfirm, user, isDeleting = false }: UserDeleteDialogProps) {
    const handleConfirm = async () => {
        await onConfirm()
    }

    if (!user) return null

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md">
                <GlassModalHeader>
                    <GlassModalTitle>Excluir Usuário</GlassModalTitle>
                    <GlassModalDescription>Esta ação não pode ser desfeita. O usuário será desativado e não poderá mais acessar o sistema.</GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-6 space-y-6">
                    <div className="space-y-4">
                        {/* Warning */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-white/80">
                                <p className="font-medium text-rose-400 mb-1">Atenção!</p>
                                <p>Você está prestes a excluir o seguinte usuário. Esta ação irá desativar a conta, impedindo o acesso ao sistema.</p>
                            </div>
                        </div>

                        {/* User info */}
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Usuário a ser excluído</p>
                            <UserMini name={user.name} username={user.username} email={user.email} avatarUrl={user.avatarUrl} />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isDeleting}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                "text-white/60 hover:text-white hover:bg-white/10",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                            )}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={isDeleting}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                "bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-500/20",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                "flex items-center gap-2",
                            )}
                        >
                            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isDeleting ? "Excluindo..." : "Excluir Usuário"}
                        </button>
                    </div>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}
