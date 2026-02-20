"use client";

/**
 * @fileoverview User delete confirmation dialog.
 *
 * @see specs/000/spec.md - FR-011
 */

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/core/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
        <ConfirmDialog
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            title="Excluir Usuário"
            description="Esta ação não pode ser desfeita. O usuário será desativado e não poderá mais acessar o sistema."
            variant="danger"
            confirmText={isDeleting ? "Excluindo..." : "Excluir"}
            cancelText="Cancelar"
            onConfirm={handleConfirm}
            onCancel={onClose}
            isLoading={isDeleting}
        >
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
        </ConfirmDialog>
    )
}
