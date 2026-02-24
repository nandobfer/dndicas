"use client";

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/core/utils';
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import type { Feat } from "../types/feats.types"

export interface DeleteFeatDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => Promise<void>
    feat: Feat | null
    isDeleting?: boolean
}

export function DeleteFeatDialog({ isOpen, onClose, onConfirm, feat, isDeleting = false }: DeleteFeatDialogProps) {
    if (!feat) return null

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md">
                <GlassModalHeader>
                    <GlassModalTitle>Excluir Talento</GlassModalTitle>
                    <GlassModalDescription>
                        Esta ação removerá o talento do catálogo permanentemente. Referências existentes em outros lugares podem ser afetadas.
                    </GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-6 space-y-6">
                    <div className="space-y-4">
                        {/* Warning */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-white/80">
                                <p className="font-medium text-rose-400 mb-1">Atenção!</p>
                                <p>Esta ação é irreversível. O talento será removido definitivamente do banco de dados.</p>
                            </div>
                        </div>

                        {/* Feat info */}
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-1">
                            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Talento a ser excluído</p>
                            <p className="text-base font-semibold text-white">{feat.name}</p>
                            <p className="text-sm text-white/60">{feat.source}</p>
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
                            onClick={onConfirm}
                            disabled={isDeleting}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                "bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-500/20",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                "flex items-center gap-2",
                            )}
                        >
                            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isDeleting ? "Excluindo..." : "Excluir Talento"}
                        </button>
                    </div>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}
