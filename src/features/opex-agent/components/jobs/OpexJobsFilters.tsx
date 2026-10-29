"use client"

import { OptionTabs } from "@/components/ui/opex/option-tabs"
import type { OpexJobFilter, OpexJobOriginFilter } from "../../jobs"

const FILTER_OPTIONS = [
    { value: "scheduled", label: "Agendados" },
    { value: "finished", label: "Executados" },
    { value: "all", label: "Todos" },
] as const satisfies readonly { value: OpexJobFilter; label: string }[]

const ORIGIN_OPTIONS = [
    { value: "all", label: "Todos os usuários" },
    { value: "mine", label: "Meus" },
    { value: "others", label: "De outros usuários" },
] as const satisfies readonly { value: OpexJobOriginFilter; label: string }[]

interface OpexJobsFiltersProps {
    filter: OpexJobFilter
    origin: OpexJobOriginFilter
    onFilter: (value: OpexJobFilter) => void
    onOrigin: (value: OpexJobOriginFilter) => void
}

/** Filtros da aba Jobs: situação e origem (os do administrador ou os dos outros usuários). */
export function OpexJobsFilters({ filter, origin, onFilter, onOrigin }: OpexJobsFiltersProps) {
    return (
        <div className="flex flex-wrap gap-2">
            <OptionTabs aria-label="Filtrar jobs" options={FILTER_OPTIONS} value={filter} onChange={onFilter} size="sm" />
            <OptionTabs aria-label="Origem dos jobs" options={ORIGIN_OPTIONS} value={origin} onChange={onOrigin} size="sm" />
        </div>
    )
}
