"use client";

import { Clock, User, Scroll, Users, Sparkles, Zap, Wand, ChevronRight, Shield } from "lucide-react"
import { ActionChip } from "@/components/ui/action-chip"
import { UserMini } from "@/components/ui/user-mini"
import { cn } from "@/core/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { entityConfig } from "@/lib/config/colors"
import type { AuditLog } from "../types/audit.types"

export interface AuditLogCardProps {
    log: AuditLog
    onClick?: () => void
}

const ENTITY_MAP: Record<string, keyof typeof entityConfig> = {
    User: "Usuário",
    Reference: "Regra",
    Rule: "Regra",
    Trait: "Habilidade",
    Feat: "Talento",
    Spell: "Magia",
    Auth: "Segurança",
    Company: "Regra", // Fallback
    Organization: "Regra", // Fallback
}

function getEntityName(log: AuditLog): string {
    const data = (log.newData || log.previousData || {}) as Record<string, any>
    return data.name || data.title || data.username || data.label || log.entityId
}

const ENTITY_ICONS: Record<keyof typeof entityConfig, any> = {
    Usuário: Users,
    Regra: Scroll,
    Habilidade: Sparkles,
    Talento: Zap,
    Magia: Wand,
    Segurança: Shield, // I'll add Shield to imports if available, otherwise User
}

/**
 * Common Audit Log Card component used in the mobile list view.
 * Styled to match the entity previews while being specialized for audit data.
 */
export function AuditLogCard({ log, onClick }: AuditLogCardProps) {
    const configKey = ENTITY_MAP[log.entity] || "Regra"
    const config = entityConfig[configKey]
    const EntityIcon = ENTITY_ICONS[configKey] || Scroll
    const entityName = getEntityName(log)

    return (
        <button 
            onClick={onClick}
            className="w-full text-left space-y-4 group transition-all"
        >
            {/* Header: Action + Entity Type */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border-2 overflow-hidden",
                        config.bgAlpha,
                        config.border
                    )}>
                        <EntityIcon className={cn("h-5 w-5", config.text)} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                             <span className={cn("text-[10px] font-bold uppercase tracking-widest", config.text)}>{config.name}</span>
                        </div>
                        <h3 className="text-sm font-bold text-white leading-tight truncate mt-1">
                            {entityName}
                        </h3>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <ActionChip action={log.action} />
                    <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/40 transition-colors mt-1" />
                </div>
            </div>

            {/* Properties: Performed By */}
            <div className="space-y-2 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <User className="h-3 w-3" />
                    <span>Realizado por</span>
                </div>
                <div className="flex items-center gap-2">
                    {log.performedByUser ? (
                        <UserMini 
                            name={log.performedByUser.name}
                            username={log.performedByUser.username}
                            email={log.performedByUser.email}
                            avatarUrl={log.performedByUser.avatarUrl}
                            size="sm"
                        />
                    ) : (
                        <span className="text-xs text-white/60">Sistema</span>
                    )}
                </div>
            </div>

            {/* Timestamps */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[10px] font-medium text-white/40">
                <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>
                        {format(new Date(log.createdAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-white/20">ID: {log.entityId.slice(0, 8)}...</span>
                </div>
            </div>
        </button>
    )
}
