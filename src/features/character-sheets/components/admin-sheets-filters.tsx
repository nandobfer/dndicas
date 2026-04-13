"use client"

import { SearchInput } from "@/components/ui/search-input"
import { cn } from "@/core/utils"

interface AdminSheetsFiltersProps {
    search: string
    onSearchChange: (value: string) => void
    isSearching?: boolean
    className?: string
}

export function AdminSheetsFilters({ search, onSearchChange, isSearching = false, className }: AdminSheetsFiltersProps) {
    return (
        <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
            <div className="flex-1">
                <SearchInput
                    value={search}
                    onChange={onSearchChange}
                    isLoading={isSearching}
                    placeholder="Buscar por personagem, classe, raça, nome ou username..."
                />
            </div>
        </div>
    )
}
