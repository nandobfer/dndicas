"use client";

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock, User as UserIcon, MessageSquare, ChevronRight } from 'lucide-react';
import { 
    GlassModal, 
    GlassModalContent, 
    GlassModalHeader, 
    GlassModalTitle, 
    GlassModalDescription,
    GlassModalFooter 
} from '@/components/ui/glass-modal';
import { GlassSelector } from '@/components/ui/glass-selector';
import { RichTextEditor } from '@/features/rules/components/rich-text-editor';
import { Button } from '@/core/ui/button';
import { useFeedbackPermissions } from "../hooks/use-feedback-permissions"
import { feedbackStatusConfig, feedbackTypeConfig, feedbackPriorityConfig } from "@/lib/config/colors"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/core/utils"
import type { Feedback, UpdateFeedbackInput } from "../types/feedback.types"

const feedbackSchema = z.object({
    title: z.string().min(3, "Título deve ter pelo menos 3 caracteres").max(200),
    description: z.string().min(10, "Descrição deve ter pelo menos 10 caracteres"),
    type: z.enum(["bug", "melhoria"]),
    status: z.enum(["pendente", "concluido", "cancelado"]).optional(),
    priority: z.enum(["baixa", "media", "alta"]).optional(),
})

type FeedbackFormData = z.infer<typeof feedbackSchema>

export interface FeedbackFormModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: any) => Promise<void>
    feedback?: Feedback | null
    isSubmitting?: boolean
}

export function FeedbackFormModal({ isOpen, onClose, onSubmit, feedback, isSubmitting }: FeedbackFormModalProps) {
    const { isAdmin, canEditMainFields, canEditAdminFields } = useFeedbackPermissions(feedback)

    const {
        control,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<FeedbackFormData>({
        resolver: zodResolver(feedbackSchema),
        defaultValues: {
            title: "",
            description: "",
            type: "melhoria",
            status: "pendente",
        },
    })

    React.useEffect(() => {
        if (isOpen) {
            if (feedback) {
                reset({
                    title: feedback.title,
                    description: feedback.description,
                    type: feedback.type,
                    status: feedback.status,
                    priority: feedback.priority,
                })
            } else {
                reset({
                    title: "",
                    description: "",
                    type: "melhoria",
                    status: "pendente",
                    priority: undefined,
                })
            }
        }
    }, [feedback, reset, isOpen])

    const onFormSubmit = async (data: FeedbackFormData) => {
        await onSubmit(data)
    }

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent className="max-w-[700px]">
                <GlassModalHeader>
                    <GlassModalTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-blue-400" />
                        {feedback ? "Detalhes do Feedback" : "Enviar Novo Feedback"}
                    </GlassModalTitle>
                    <GlassModalDescription>{feedback ? "Visualize ou edite as informações deste feedback." : "Sua opinião é fundamental para melhorarmos o sistema."}</GlassModalDescription>
                </GlassModalHeader>

                <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6 py-4 px-1">
                    {feedback && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded bg-white/5 text-white/40">
                                    <Clock className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Criado em</span>
                                    <span className="text-xs text-white/70 font-medium">{format(new Date(feedback.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded bg-white/5 text-white/40">
                                    <UserIcon className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Autor</span>
                                    <span className="text-xs text-white/70 font-medium">{feedback.creatorName}</span>
                                </div>
                            </div>
                            {feedback.updatedAt !== feedback.createdAt && (
                                <div className="flex items-center gap-2.5 sm:col-span-2 pt-2 border-t border-white/5">
                                    <div className="p-1.5 rounded bg-white/5 text-blue-400/40">
                                        <Clock className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-blue-400/40 uppercase font-bold tracking-wider">Última Atualização</span>
                                        <span className="text-xs text-white/70 font-medium">{format(new Date(feedback.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-white/40 uppercase tracking-widest px-1">Tipo de Feedback</label>
                            {feedback && !canEditMainFields && <span className="text-[9px] text-amber-500/60 font-medium italic">Apenas leitura</span>}
                        </div>
                        <Controller
                            name="type"
                            control={control}
                            render={({ field }) => (
                                <GlassSelector
                                    value={field.value}
                                    onChange={(v) => field.onChange(v)}
                                    options={Object.entries(feedbackTypeConfig).map(([key, config]) => ({
                                        value: key as any,
                                        label: config.label,
                                        activeColor: config.badge,
                                    }))}
                                    disabled={!canEditMainFields}
                                    fullWidth
                                />
                            )}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest px-1">Título</label>
                        <Controller
                            name="title"
                            control={control}
                            render={({ field }) => (
                                <input
                                    {...field}
                                    className={cn(
                                        "w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/20 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50",
                                        !canEditMainFields && "opacity-60 cursor-not-allowed",
                                    )}
                                    placeholder="Ex: Erro na listagem de magias / Sugestão de novo campo..."
                                    disabled={!canEditMainFields}
                                />
                            )}
                        />
                        {errors.title && <p className="text-[10px] text-red-400 font-bold uppercase px-1">{errors.title.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest px-1">Descrição</label>
                        <Controller
                            name="description"
                            control={control}
                            render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} disabled={!canEditMainFields} variant="full" />}
                        />
                        {errors.description && <p className="text-[10px] text-red-400 font-bold uppercase px-1">{errors.description.message}</p>}
                    </div>

                    <div
                        className={cn(
                            "p-4 rounded-xl space-y-4 transition-all",
                            isAdmin ? "bg-white/5 border border-white/10 shadow-lg shadow-amber-500/5" : "bg-transparent border border-white/5 opacity-80",
                        )}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <ChevronRight className={cn("h-3 w-3", isAdmin ? "text-amber-400" : "text-white/20")} />
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Controles Administrativos</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-tight px-1">Status</label>
                                <Controller
                                    name="status"
                                    control={control}
                                    render={({ field }) => (
                                        <GlassSelector
                                            value={field.value}
                                            onChange={(v) => field.onChange(v)}
                                            options={Object.entries(feedbackStatusConfig).map(([key, config]) => ({
                                                value: key as any,
                                                label: config.label,
                                                activeColor: config.badge,
                                            }))}
                                            disabled={!canEditAdminFields}
                                            fullWidth
                                            layoutId="status-selector"
                                        />
                                    )}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-tight px-1">Prioridade</label>
                                <Controller
                                    name="priority"
                                    control={control}
                                    render={({ field }) => (
                                        <GlassSelector
                                            value={field.value || ""}
                                            onChange={(v) => field.onChange(v)}
                                            options={Object.entries(feedbackPriorityConfig).map(([key, config]) => ({
                                                value: key as any,
                                                label: config.label,
                                                activeColor: config.badge,
                                            }))}
                                            disabled={!canEditAdminFields}
                                            fullWidth
                                            layoutId="priority-selector"
                                        />
                                    )}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="ghost" onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                            Fechar
                        </Button>
                        {(canEditMainFields || canEditAdminFields) && (
                            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 px-6">
                                {isSubmitting ? "Enviando..." : feedback ? "Salvar Alterações" : "Enviar Feedback"}
                            </Button>
                        )}
                    </div>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
