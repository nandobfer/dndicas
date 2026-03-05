/**
 * @fileoverview Delete background confirmation dialog.
 */

"use client";

import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useDeleteBackground } from "../api/backgrounds-queries"
import {
    GlassAlertDialog,
    GlassAlertDialogAction,
    GlassAlertDialogCancel,
    GlassAlertDialogContent,
    GlassAlertDialogDescription,
    GlassAlertDialogFooter,
    GlassAlertDialogHeader,
    GlassAlertDialogTitle,
} from "@/components/ui/glass-alert-dialog"
import type { Background } from "../types/backgrounds.types"

interface DeleteBackgroundDialogProps {
    isOpen: boolean
    onClose: () => void
    background?: Background | null
}

export function DeleteBackgroundDialog({ isOpen, onClose, background }: DeleteBackgroundDialogProps) {
    const deleteMutation = useDeleteBackground()

    const handleDelete = async () => {
        if (!background) return

        try {
            await deleteMutation.mutateAsync(background._id)
            toast.success("Origem excluída com sucesso!")
            onClose()
        } catch (error: any) {
            toast.error(error.message || "Erro ao excluir origem")
        }
    }

    return (
        <GlassAlertDialog open={isOpen} onOpenChange={onClose}>
            <GlassAlertDialogContent>
                <GlassAlertDialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-red-500/20 text-red-500">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <GlassAlertDialogTitle>Excluir Origem</GlassAlertDialogTitle>
                    </div>
                </GlassAlertDialogHeader>
                <GlassAlertDialogDescription>
                    Tem certeza que deseja excluir a origem <span className="text-white font-bold">{background?.name}</span>? 
                    Esta ação é irreversível e removerá permanentemente todos os dados associados a ela.
                </GlassAlertDialogDescription>
                <GlassAlertDialogFooter>
                    <GlassAlertDialogCancel onClick={onClose} disabled={deleteMutation.isPending}>
                        Cancelar
                    </GlassAlertDialogCancel>
                    <GlassAlertDialogAction
                        onClick={(e) => {
                            e.preventDefault()
                            handleDelete()
                        }}
                        className="bg-red-500 hover:bg-red-600 border-red-500/20 hover:border-red-500/40 text-white min-w-[100px]"
                        disabled={deleteMutation.isPending}
                    >
                        {deleteMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                            "Excluir"
                        )}
                    </GlassAlertDialogAction>
                </GlassAlertDialogFooter>
            </GlassAlertDialogContent>
        </GlassAlertDialog>
    )
}
