"use client"

import { Check, ChevronRight, UserSearch } from "lucide-react"
import { Skeleton } from "@/core/ui/skeleton"
import { ErrorState } from "./ErrorState"
import { EmptyState } from "./EmptyState"
import { RoleChip } from "../permissions/RoleChip"
import { cn } from "@/lib/utils"
import type { ViewAsRoleOption } from "./types"

interface ViewAsRoleStepProps {
    roles: ViewAsRoleOption[] | undefined
    isLoading: boolean
    isError: boolean
    onRetry(): void
    /** Id do perfil simulado agora (destaque). */
    activeRoleId: string | null
    onPickRole(role: ViewAsRoleOption): void
    onSelectUser(): void
}

/** Primeira etapa: perfis ativos por posição + a opção fixa "Selecionar usuário". */
export function ViewAsRoleStep({ roles, isLoading, isError, onRetry, activeRoleId, onPickRole, onSelectUser }: ViewAsRoleStepProps) {
    return (
        <div className="flex flex-col">
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visualizar como</p>
            <div className="max-h-72 overflow-y-auto px-1 pb-1" role="listbox" aria-label="Perfis">
                {isLoading ? (
                    <div className="space-y-1.5 p-2" data-testid="view-as-roles-loading">
                        {[0, 1, 2, 3].map((index) => (
                            <Skeleton key={index} className="h-7 w-full" />
                        ))}
                    </div>
                ) : isError ? (
                    <ErrorState title="Não foi possível carregar os perfis" onRetry={onRetry} />
                ) : !roles || roles.length === 0 ? (
                    <EmptyState title="Nenhum perfil ativo" className="py-6" />
                ) : (
                    roles.map((role) => {
                        const active = role.coringa ? activeRoleId === null : role.id === activeRoleId
                        return (
                            <button
                                key={role.id}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => onPickRole(role)}
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                                    active && "bg-muted",
                                )}
                            >
                                <RoleChip cargo={role} className="whitespace-nowrap" />
                                {role.coringa && <span className="text-[11px] text-muted-foreground">Seu acesso real</span>}
                                <span className="flex-1" />
                                {active && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
                            </button>
                        )
                    })
                )}
            </div>
            <div className="border-t border-border p-1">
                <button
                    type="button"
                    onClick={onSelectUser}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                    <UserSearch className="h-4 w-4" aria-hidden />
                    <span className="flex-1">Selecionar usuário</span>
                    <ChevronRight className="h-4 w-4 opacity-60" aria-hidden />
                </button>
            </div>
        </div>
    )
}
