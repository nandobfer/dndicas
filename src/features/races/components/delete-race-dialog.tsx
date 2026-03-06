/**
 * @fileoverview Delete Race confirmation dialog.
 */

"use client";

import * as React from "react"
import { toast } from "sonner"
import { Fingerprint, Loader2 } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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

    const handleDelete = async () => {
        if (!race) return

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
        <ConfirmDialog
            open={isOpen}
            onOpenChange={(open) => !open && onClose()}
            onConfirm={handleDelete}
            title="Excluir Raça"
            description={`Tem certeza que deseja excluir a raça "${race?.name}"? Esta ação não pode ser desfeita.`}
            confirmText={isDeleting ? "Excluindo..." : "Excluir Raça"}
            variant="danger"
            isLoading={isDeleting}
            icon={Fingerprint}
        />
    )
}
