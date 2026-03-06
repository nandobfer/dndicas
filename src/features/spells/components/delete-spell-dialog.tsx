/**
 * @fileoverview Delete Spell confirmation dialog.
 */

"use client";

import * as React from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/core/utils';
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { toast } from "sonner"
import { useDeleteSpell } from "../api/spells-queries"
import type { Spell } from "../types/spells.types"

export interface DeleteSpellDialogProps {
    isOpen: boolean
    onClose: () => void
    spell: Spell | null
}

export function DeleteSpellDialog({ isOpen, onClose, spell }: DeleteSpellDialogProps) {
    const deleteMutation = useDeleteSpell()
    const isDeleting = deleteMutation.isPending

    if (!spell) return null

    const handleConfirm = async () => {
        try {
            await deleteMutation.mutateAsync(spell._id)
            toast.success(`Magia "${spell.name}" excluída com sucesso!`)
            onClose()
        } catch (error) {
            console.error("[DeleteSpellDialog] Error deleting:", error)
            toast.error("Ocorreu um erro ao excluir a magia.")
        }
    }

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md">
                <GlassModalHeader>
                    <GlassModalTitle>Excluir Magia</GlassModalTitle>
                    <GlassModalDescription>
                        Esta ação removerá a magia do catálogo permanentemente. Referências existentes em outros lugares podem ser afetadas.
                    </GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-6 space-y-6">
                    <div className="space-y-4">
                        {/* Warning */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-white/80">
                                <p className="font-medium text-rose-400 mb-1">Atenção!</p>
                                <p>Esta ação é irreversível. A magia será removida definitivamente do banco de dados.</p>
                            </div>
                        </div>

                        {/* Spell info */}
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 flex items-center gap-4">
                             <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                                <Sparkles className="h-6 w-6 text-amber-400" />
                            </div>
                            <div className="space-y-1 min-w-0">
                                <p className="text-xs text-white/40 uppercase tracking-wider">Magia a ser excluída</p>
                                <p className="text-base font-semibold text-white truncate">{spell.name}</p>
                                <p className="text-sm text-white/60">
                                    {spell.circle === 0 ? "Truque" : `${spell.circle}º Círculo`} • {spell.school}
                                </p>
                            </div>
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
                            {isDeleting ? "Excluindo..." : "Excluir Magia"}
                        </button>
                    </div>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}
