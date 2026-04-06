"use client"

import { SearchInput } from "@/components/ui/search-input"

interface SheetsSearchProps {
    value: string
    onChange: (value: string) => void
    isLoading?: boolean
}

export function SheetsSearch({ value, onChange, isLoading }: SheetsSearchProps) {
    return (
        <SearchInput
            value={value}
            onChange={onChange}
            isLoading={isLoading}
            placeholder="Buscar fichas por nome, classe, raça..."
        />
    )
}
