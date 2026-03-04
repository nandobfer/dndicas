"use client"

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { cn } from "@/core/utils"
import {
    GlassModal,
    GlassModalContent,
    GlassModalHeader,
    GlassModalTitle,
    GlassModalDescription,
} from "./glass-modal"

interface GlassConfirmClosingProps {
    isOpen: boolean
    onClose: () => void
    onConfirmExit: () => void
    onSaveAndExit?: () => Promise<void>
    isSaving?: boolean
    title?: string
    description?: string
}

export function GlassConfirmClosing({
    isOpen,
    onClose,
    onConfirmExit,
    onSaveAndExit,
    isSaving = false,
    title = "Alterações não salvas",
    description = "Você possui alterações que não foram salvas. Deseja realmente sair?",
}: GlassConfirmClosingProps) {
    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md" className="z-[100]">
                <GlassModalHeader>
                    <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 border border-amber-500/20">
                        <AlertTriangle className="h-6 w-6 text-amber-500" />
                    </div>
                    <GlassModalTitle className="text-center">{title}</GlassModalTitle>
                    <GlassModalDescription className="text-center">
                        {description}
                    </GlassModalDescription>
                </GlassModalHeader>

                <div className="flex flex-col gap-3 mt-6">
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={onConfirmExit}
                            disabled={isSaving}
                            className={cn(
                                "px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                                "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                        >
                            Sair sem salvar
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            className={cn(
                                "px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                                "bg-white/5 border border-white/10 text-white hover:bg-white/10",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                        >
                            Continuar editando
                        </button>
                    </div>

                    {onSaveAndExit && (
                        <button
                            type="button"
                            onClick={onSaveAndExit}
                            disabled={isSaving}
                            className={cn(
                                "w-full px-4 py-3 rounded-xl text-sm font-bold transition-all",
                                "bg-blue-500 text-white hover:bg-blue-600 active:scale-[0.98]",
                                "shadow-lg shadow-blue-500/20",
                                "disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            )}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                "Salvar e Sair"
                            )}
                        </button>
                    )}
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}
