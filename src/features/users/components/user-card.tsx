"use client";

import { UserCircle, Mail, Shield, ShieldAlert, Calendar, User as UserIcon } from "lucide-react"
import { Chip } from "@/components/ui/chip"
import { cn } from "@/core/utils"
import type { UserResponse } from "../types/user.types"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export interface UserCardProps {
    user: UserResponse
    showStatus?: boolean
}

/**
 * Common User Card component used in the mobile list view.
 * Styled to match the entity previews while being specialized for user data.
 */
export function UserCard({ user, showStatus = true }: UserCardProps) {
    const isEditingSelf = false; // This might be used later to hide certain actions

    return (
        <div className="space-y-4 w-full">
            {/* Header: Identity + Role */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border-2 overflow-hidden bg-white/5",
                        user.role === "admin" ? "border-blue-500/30" : "border-white/10"
                    )}>
                        {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                        ) : (
                            <UserCircle className={cn("h-6 w-6", user.role === "admin" ? "text-blue-400" : "text-white/40")} />
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white leading-tight truncate">
                                {user.name || user.username}
                            </h3>
                            <Chip variant={user.role === "admin" ? "artifact" : "common"} size="sm">
                                {user.role === "admin" ? "Admin" : "Usuário"}
                            </Chip>
                        </div>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">
                            ID: {user.clerkId.slice(0, 10)}...
                        </p>
                    </div>
                </div>
            </div>

            {/* Properties: Email & Info */}
            <div className="space-y-2 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <UserIcon className="h-3 w-3" />
                    <span>Dados da Conta</span>
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-white/40 flex-shrink-0" />
                        <span className="text-xs text-white/80 truncate">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <UserIcon className="h-3.5 w-3.5 text-white/40 flex-shrink-0" />
                        <span className="text-xs text-white/60">@{user.username}</span>
                    </div>
                </div>
            </div>

            {/* Timestamps */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[10px] font-medium text-white/40">
                <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    <span>Criado em: <span className="text-white/60">
                        {format(new Date(user.createdAt), "dd MMM yyyy", { locale: ptBR })}
                    </span></span>
                </div>
                {user.role === "admin" && (
                    <div className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-blue-400/50" />
                        <span className="text-blue-400/50 uppercase tracking-tighter">Acesso Total</span>
                    </div>
                )}
            </div>
        </div>
    )
}
