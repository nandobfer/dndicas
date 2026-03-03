"use client"

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/core/utils"
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"

interface DeleteClassDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    classData: any | null
    isDeleting?: boolean
}

export function DeleteClassDialog({
    isOpen,
    onClose,
    onConfirm,
    classData,
    isDeleting = false,
}: DeleteClassDialogProps) {
    if (!classData) return null

    return (
        <GlassModal open={isOpen} onOpenChange={onClose}>
            <GlassModalContent className="sm:max-w-[425px]">
                <GlassModalHeader>
                    <div className="flex items-center gap-3 text-red-400 mb-2">
                        <AlertTriangle className="h-6 w-6" />
                        <GlassModalTitle className="text-xl font-bold">Excluir Classe</GlassModalTitle>
                    </div>
                    <GlassModalDescription className="text-slate-400 text-base">
                        Tem certeza que deseja excluir a classe <span className="text-white font-semibold">"{classData.name}"</span>?
                        Esta ação não pode ser desfeita.
                    </GlassModalDescription>
                </GlassModalHeader>
                
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
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
                        {isDeleting ? "Excluindo..." : "Excluir permanentemente"}
                    </button>
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}
