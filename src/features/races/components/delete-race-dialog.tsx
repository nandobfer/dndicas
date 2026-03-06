/**
 * @fileoverview Delete Race confirmation dialog.
 */

"use client";

import * as React from "react"
import { AlertTriangle, Loader2, Fingerprint } from "lucide-react"
import { cn } from "@/core/utils"
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { toast } from "sonner"
import { useDeleteRace } from "../api/races-queries"
import type { Race } from "../types/races.types"

export interface DeleteRaceDialogProps {
    race: Race | null
    isOpen: boolean
    onClose: () => void
}

export function DeleteRaceDialog({ race, isOpen, onClose }: DeleteRaceDialogProps) {
    const deleteMutation = useDeleteRace()
    const isDeleting = deleteMutation.isPending

    if (!race) return null

    const handleConfirm = async () => {
        try {
            await deleteMutation.mutateAsync(race._id)
            toast.success(`Raça "${race.name}" excluída com sucesso!`)
            onClose()
        } catch (error) {
            console.error("[DeleteRaceDialog] Error deleting:", error)
            toast.error("Ocorreu um erro ao excluir a raça.")
        }
    }

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md">
                <GlassModalHeader>
                    <GlassModalTitle>Excluir Raça</GlassModalTitle>
                    <GlassModalDescription>Esta ação removerá a raça do catálogo permanentemente. Referências existentes em outros lugares podem ser afetadas.</GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-6 space-y-6">
                    <div className="space-y-4">
                        {/* Warning */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-white/80">
                                <p className="font-medium text-rose-400 mb-1">Atenção!</p>
                                <p>Esta ação é irreversível. A raça será removida definitivamente do banco de dados.</p>
                            </div>
                        </div>

                        {/* Race info */}
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                                <Fingerprint className="h-6 w-6 text-blue-400" />
                            </div>
                            <div className="space-y-1 min-w-0">
                                <p className="text-xs text-white/40 uppercase tracking-wider">Raça a ser excluída</p>
                                <p className="text-base font-semibold text-white truncate">{race.name}</p>
                                <p className="text-sm text-white/60">{race.source}</p>
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
                            {isDeleting ? "Excluindo..." : "Excluir Raça"}
                        </button>
                    </div>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}

