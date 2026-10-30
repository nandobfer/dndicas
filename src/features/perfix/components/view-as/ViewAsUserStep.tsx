"use client"

import { useState } from "react"
import { Loader2, Search, Users } from "lucide-react"
import { Input } from "@/core/ui/input"
import { Skeleton } from "@/core/ui/skeleton"
import { EmptyState } from "./EmptyState"
import { ErrorState } from "./ErrorState"
import { RoleChip } from "../permissions/RoleChip"
import { useViewAsUsers } from "../../hooks/useViewAsOptions"
import type { ViewAsUserOption } from "./types"
import { ViewAsStepHeader } from "./ViewAsStepHeader"

interface ViewAsUserStepProps {
    activeUserId: string | null
    onBack(): void
    onPick(user: ViewAsUserOption): void
}

/**
 * "Selecionar usuário": abre com os primeiros 20 usuários ativos por nome; a digitação filtra
 * no servidor (nome ou e-mail, sem distinguir maiúsculas), com debounce e cancelamento.
 */
export function ViewAsUserStep({ activeUserId, onBack, onPick }: ViewAsUserStepProps) {
    const [search, setSearch] = useState("")
    const { data, isPending, isError, refetch, isFetching, term } = useViewAsUsers(search, true)
    const items = data?.items ?? []

    return (
        <div className="flex flex-col">
            <ViewAsStepHeader title="Selecionar usuário" subtitle="Simula exatamente o acesso do usuário" onBack={onBack} />
            <div className="relative px-2 pb-2">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nome ou e-mail"
                    aria-label="Buscar usuário"
                    className="h-9 pl-8 pr-8 text-sm"
                />
                {isFetching && !isPending && (
                    <Loader2 className="absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Buscando" />
                )}
            </div>
            <div className="max-h-72 overflow-y-auto px-1 pb-1" role="listbox" aria-label="Usuários">
                {isPending ? (
                    <div className="space-y-2 p-2" data-testid="view-as-users-loading">
                        {[0, 1, 2, 3].map((index) => (
                            <Skeleton key={index} className="h-10 w-full" />
                        ))}
                    </div>
                ) : isError ? (
                    <ErrorState title="Não foi possível buscar os usuários" onRetry={() => void refetch()} />
                ) : items.length === 0 ? (
                    <EmptyState icon={Users} title={term ? `Nenhum usuário encontrado para “${term}”` : "Nenhum usuário ativo"} className="py-6" />
                ) : (
                    items.map((user) => (
                        <button
                            key={user.id}
                            type="button"
                            role="option"
                            aria-selected={user.id === activeUserId}
                            onClick={() => onPick(user)}
                            className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none aria-selected:bg-muted"
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-foreground">{user.nome}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{user.email}</span>
                            </span>
                            {user.cargos.length > 0 ? (
                                <span className="flex flex-wrap gap-1">
                                    {user.cargos.map((cargo) => (
                                        <RoleChip key={cargo.id} cargo={cargo} />
                                    ))}
                                </span>
                            ) : (
                                <span className="text-[11px] text-muted-foreground">Sem perfil ativo</span>
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}
