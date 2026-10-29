"use client"

import { format, subDays, subMonths } from "date-fns"
import { Calendar, CalendarDays, CalendarRange, Sparkles, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/opex/popover"
import { cn } from "@/lib/utils"
import { DateRangeCalendar, formatRangeLabel, type DateRangeValue } from "./date-range-calendar"

/**
 * Filtro de período padrão do app — cópia do `PresetDateRangeFilter` do Smart Desk (filtro
 * "Data Disparo" das notificações), com date-fns. Botão com o período, popover com "Período
 * personalizado" (calendário de intervalo) e "Atalhos". Todo filtro/componente de janela de data
 * usa este componente dentro de um `FilterGroup`.
 *
 * Atalhos: por padrão Hoje, Última semana e Último mês (`DEFAULT_DATE_PRESETS`). Para personalizar,
 * passe `presets` — monte com os prontos (`DATE_PRESET.today`, ...) ou crie com `lastDaysPreset`.
 */

export type { DateRangeValue } from "./date-range-calendar"

export interface DatePreset {
    key: string
    label: string
    icon: LucideIcon
    getRange: () => DateRangeValue
}

const iso = (date: Date) => format(date, "yyyy-MM-dd")

/** Atalho "últimos N dias" (de hoje − N até hoje). */
export const lastDaysPreset = (days: number, label = `Últimos ${days} dias`, icon: LucideIcon = CalendarDays): DatePreset => ({
    key: `last-${days}d`,
    label,
    icon,
    getRange: () => ({ startDate: iso(subDays(new Date(), days)), endDate: iso(new Date()) }),
})

export const DATE_PRESET = {
    today: { key: "today", label: "Hoje", icon: Sparkles, getRange: () => ({ startDate: iso(new Date()), endDate: iso(new Date()) }) },
    week: lastDaysPreset(7, "Última semana", CalendarDays),
    month: {
        key: "month",
        label: "Último mês",
        icon: CalendarRange,
        getRange: () => ({ startDate: iso(subMonths(new Date(), 1)), endDate: iso(new Date()) }),
    },
} satisfies Record<string, DatePreset>

export const DEFAULT_DATE_PRESETS: readonly DatePreset[] = [DATE_PRESET.today, DATE_PRESET.week, DATE_PRESET.month]

interface PresetDateRangeFilterProps {
    startDate: string
    endDate: string
    onChange: (next: DateRangeValue) => void
    emptyLabel?: string
    /** Atalhos da tela; padrão: Hoje, Última semana, Último mês. `[]` esconde a seção. */
    presets?: readonly DatePreset[]
    className?: string
}

const isPresetActive = (preset: DatePreset, value: DateRangeValue) => {
    const range = preset.getRange()
    return value.startDate === range.startDate && value.endDate === range.endDate
}

export function PresetDateRangeFilter({ startDate, endDate, onChange, emptyLabel = "Selecionar período", presets = DEFAULT_DATE_PRESETS, className }: PresetDateRangeFilterProps) {
    const hasValue = Boolean(startDate || endDate)

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className={cn(
                        "h-10 w-full justify-start truncate px-3 text-left font-normal",
                        hasValue ? "border-primary/30 bg-primary/5 text-foreground" : "text-muted-foreground",
                        className,
                    )}
                >
                    <Calendar className={cn("mr-2 h-4 w-4 shrink-0", hasValue ? "text-primary" : "opacity-40")} aria-hidden />
                    <span className="truncate text-sm">{formatRangeLabel(startDate, endDate, emptyLabel)}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] overflow-hidden p-0" align="start">
                <div className="space-y-2 p-3">
                    <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Período personalizado</p>
                    <DateRangeCalendar value={{ startDate, endDate }} onChange={onChange} placeholder="Selecionar período" />
                </div>

                {(presets.length > 0 || hasValue) && <div className="mx-3 h-px bg-border" />}

                <div className="space-y-2 p-3">
                    {presets.length > 0 && (
                        <>
                            <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Atalhos</p>
                            <div className="grid grid-cols-3 gap-2">
                                {presets.map((preset) => {
                                    const active = isPresetActive(preset, { startDate, endDate })
                                    const Icon = preset.icon
                                    return (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => onChange(preset.getRange())}
                                            className={cn(
                                                "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs transition-all",
                                                active
                                                    ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                                                    : "border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground",
                                            )}
                                        >
                                            <Icon size={15} className={active ? "opacity-90" : "opacity-50"} aria-hidden />
                                            <span className={cn("text-center font-medium leading-none", active && "font-semibold")}>{preset.label}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </>
                    )}
                    {hasValue && (
                        <button
                            type="button"
                            onClick={() => onChange({ startDate: "", endDate: "" })}
                            className="w-full pt-0.5 text-center text-[10px] text-muted-foreground/50 transition-colors hover:text-destructive"
                        >
                            Limpar período
                        </button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
