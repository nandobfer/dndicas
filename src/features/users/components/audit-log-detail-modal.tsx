'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { User, Calendar, Database, ArrowRight, Copy } from "lucide-react"
import { GlassModal, GlassModalContent, GlassModalHeader, GlassModalTitle, GlassModalDescription } from "@/components/ui/glass-modal"
import { ActionChip } from "@/components/ui/action-chip"
import { DiffView } from "@/components/ui/diff-view"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { glassClasses, cardGlass } from "@/lib/config/glass-config"
import { fade } from "@/lib/config/motion-configs"
import { toast } from "sonner"
import type { AuditLog } from "../types/audit.types"
import { cn } from "@/core/utils"

interface AuditLogDetailModalProps {
    log: AuditLog | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

function formatDate(date: Date | string): string {
    if (!date) return "N/A"
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(new Date(date))
}

function formatEntityType(entityType: string): string {
    const labels: Record<string, string> = {
        User: "Usuário",
        Company: "Empresa",
        Organization: "Organização",
        OrganizationMembership: "Membro da Organização",
        Rule: "Regra",
        Reference: "Regra",
        Trait: "Habilidade", // T046: Added Trait entity type mapping
        Feat: "Talento", // T050: Added Feat entity type mapping
    }
    return labels[entityType] || entityType || "Sistema"
}

const renderAuditValue = (value: unknown) => {
    if (typeof value === "string" && (value.includes("<p>") || value.includes("<span"))) {
        return (
            <div className="max-w-full overflow-hidden bg-black/20 p-2 rounded border border-white/5">
                <MentionContent html={value} mode="block" className="!text-[11px] prose-p:my-1 prose-ul:my-1" />
            </div>
        )
    }

    if (Array.isArray(value)) {
        return (
            <div className="flex flex-wrap gap-1.5 p-1 bg-black/10 rounded border border-white/5 w-full">
                {value.map((item, i) => (
                    <div key={i} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] text-white/70 flex items-center gap-1">
                        {typeof item === "string" && (item.includes("<p>") || item.includes("<span")) ? (
                            <MentionContent html={item} mode="inline" className="[&_p]:inline [&_p]:m-0 align-middle" />
                        ) : (
                            String(item)
                        )}
                    </div>
                ))}
                {value.length === 0 && <span className="text-[10px] text-white/30 italic px-1">Vazio</span>}
            </div>
        )
    }

    if (value === null || value === undefined) return "null"
    if (typeof value === "object") return <span className="whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</span>
    return String(value)
}

export function AuditLogDetailModal({ log, open, onOpenChange }: AuditLogDetailModalProps) {
    if (!log) return null

    const handleCopyId = (e: React.MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(log.entityId)
        toast.success("ID copiado com sucesso!")
    }

    return (
        <GlassModal open={open} onOpenChange={onOpenChange}>
            <GlassModalContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <GlassModalHeader>
                    <GlassModalTitle className="flex items-center gap-3">
                        <span>Detalhes do Log</span>
                        <ActionChip action={log.action} />
                    </GlassModalTitle>
                    <GlassModalDescription className="flex items-center gap-2">
                        {formatEntityType(log.entity)} •{" "}
                        <span
                            className="font-mono text-[10px] bg-white/5 px-2 py-0.5 rounded cursor-pointer hover:bg-white/10 transition-colors"
                            onClick={handleCopyId}
                        >
                            {log.entityId}
                        </span>
                    </GlassModalDescription>
                </GlassModalHeader>

                <motion.div className="space-y-6 mt-6 pb-6" {...fade}>
                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <InfoCard icon={<Database className="h-4 w-4" />} label="Entidade" value={formatEntityType(log.entity)} />
                        <InfoCard
                            icon={<ArrowRight className="h-4 w-4" />}
                            label="ID da Entidade"
                            value={log.entityId}
                            isMono
                            onClick={handleCopyId}
                            className="cursor-pointer group/id"
                        />
                        <InfoCard
                            icon={<User className="h-4 w-4" />}
                            label="Autor"
                            value={log.performedByUser?.name || log.performedByUser?.username || "Sistema"}
                            title={log.performedByUser?.email}
                        />
                        <InfoCard icon={<Calendar className="h-4 w-4" />} label="Data" value={formatDate(log.createdAt)} />
                    </div>

                    {/* Content based on action type */}
                    {log.action === "CREATE" && log.newData && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-green-400 flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-green-400" />
                                Dados Criados
                            </h3>
                            <DataDisplay data={log.newData} variant="create" />
                        </div>
                    )}

                    {log.action === "UPDATE" && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-blue-400 flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-blue-400" />
                                Alterações
                            </h3>
                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                                <span className="text-red-400">← Antes</span>
                                <span className="text-green-400 text-right">Depois →</span>
                            </div>
                            <DiffView
                                previousData={log.previousData as Record<string, unknown>}
                                newData={log.newData as Record<string, unknown>}
                                renderValue={renderAuditValue}
                            />
                        </div>
                    )}

                    {log.action === "DELETE" && log.previousData && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-red-400 flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-red-400" />
                                Dados Excluídos
                            </h3>
                            <DataDisplay data={log.previousData as Record<string, unknown>} variant="delete" />
                        </div>
                    )}
                </motion.div>
            </GlassModalContent>
        </GlassModal>
    )
}

interface InfoCardProps {
    icon: React.ReactNode
    label: string
    value: string
    title?: string
    isMono?: boolean
    onClick?: (e: React.MouseEvent) => void
    className?: string
}

function InfoCard({ icon, label, value, title, isMono, onClick, className }: InfoCardProps) {
    return (
        <div className={cn(glassClasses.card, "p-3 rounded-lg flex flex-col justify-between min-h-[70px]", className)} title={title} onClick={onClick}>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                {icon}
                <span className="text-xs">{label}</span>
            </div>
            <div className="flex items-center gap-2 overflow-hidden">
                <p className={cn("text-sm font-medium truncate", isMono && "font-mono text-[10px] bg-white/5 px-1 rounded truncate leading-loose")}>{value}</p>
                {onClick && <Copy className="h-3 w-3 text-white/20 group-hover/id:text-white/60 transition-colors flex-shrink-0" />}
            </div>
        </div>
    )
}

interface DataDisplayProps {
  data: Record<string, unknown>;
  variant: 'create' | 'delete';
}

function DataDisplay({ data, variant }: DataDisplayProps) {
  const borderColor = variant === 'create' ? 'border-green-500/20' : 'border-red-500/20';
  const bgColor = variant === 'create' ? 'bg-green-500/5' : 'bg-red-500/5';

  // Filter out internal fields
  const displayEntries = Object.entries(data).filter(([key]) => !key.startsWith("_") && !["createdAt", "updatedAt", "__v"].includes(key))

  return (
      <div className={`${cardGlass.blur} ${bgColor} border ${borderColor} p-4 rounded-lg space-y-4`}>
          {displayEntries.map(([key, value]) => (
              <div key={key} className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-white/30 tracking-widest">{key}</p>
                  <div className="text-xs font-mono text-white/80">{renderAuditValue(value)}</div>
              </div>
          ))}
      </div>
  )
}

AuditLogDetailModal.displayName = 'AuditLogDetailModal';
