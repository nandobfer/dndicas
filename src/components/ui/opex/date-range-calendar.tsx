"use client"

import * as React from "react"
import { format, isBefore, isSameDay, isValid, parse, startOfDay } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Calendar as CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/opex/button"
import { Calendar } from "@/components/ui/opex/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/opex/popover"
import { cn } from "@/lib/utils"

/**
 * Calendário de intervalo — cópia do `DeliveryDateRangePicker` do Smart Desk (dayjs → date-fns;
 * prévia na cor primária). 1º clique marca o início, 2º marca o fim e fecha; clicar antes do
 * início inverte as pontas. Valores `yyyy-MM-dd` (vazio = `""`).
 */

export interface DateRangeValue {
    startDate: string
    endDate: string
}

interface DateRangeCalendarProps {
    value: DateRangeValue
    onChange: (value: DateRangeValue) => void
    placeholder?: string
    className?: string
}

const ISO = "yyyy-MM-dd"

export function parseIsoDate(value: string): Date | undefined {
    if (!value) return undefined
    const parsed = parse(value, ISO, new Date())
    return isValid(parsed) ? parsed : undefined
}

export const toIsoDate = (value: Date): string => format(value, ISO)

const display = (value: string) => {
    const date = parseIsoDate(value)
    return date ? format(date, "dd/MM/yyyy") : value
}

export function formatRangeLabel(startDate: string, endDate: string, placeholder: string): string {
    if (!startDate && !endDate) return placeholder
    if (startDate && !endDate) return `Desde ${display(startDate)}`
    if (!startDate && endDate) return `Até ${display(endDate)}`
    return `${display(startDate)} - ${display(endDate)}`
}

function DateRangeCalendarImpl({ value, onChange, placeholder = "Selecionar período", className }: DateRangeCalendarProps) {
    const [open, setOpen] = React.useState(false)
    const [hoveredDate, setHoveredDate] = React.useState<Date | undefined>(undefined)
    const selectedFrom = parseIsoDate(value.startDate)
    const selectedTo = parseIsoDate(value.endDate)
    const selected: DateRange | undefined = selectedFrom || selectedTo ? { from: selectedFrom, to: selectedTo } : undefined
    const previewRange = (() => {
        if (!selectedFrom || selectedTo || !hoveredDate) return null
        const start = startOfDay(selectedFrom)
        const hover = startOfDay(hoveredDate)
        if (isSameDay(hover, start)) return null
        return isBefore(hover, start) ? { from: hover, to: start } : { from: start, to: hover }
    })()
    const hasValue = Boolean(value.startDate || value.endDate)

    const isPreviewDate = (date: Date) => {
        if (!previewRange || !selectedFrom) return false
        const day = startOfDay(date)
        return !isSameDay(day, selectedFrom) && !isBefore(day, previewRange.from) && !isBefore(previewRange.to, day)
    }

    const handleDayClick = (date: Date) => {
        const clickedDate = toIsoDate(date)
        const start = value.endDate ? undefined : parseIsoDate(value.startDate)
        setHoveredDate(undefined)
        if (!start) {
            onChange({ startDate: clickedDate, endDate: "" })
            return
        }
        const next = isBefore(startOfDay(date), startOfDay(start))
            ? { startDate: clickedDate, endDate: toIsoDate(start) }
            : { startDate: value.startDate, endDate: clickedDate }
        onChange(next)
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" className={cn("h-10 w-full justify-start truncate px-3 text-left font-normal", !hasValue && "text-muted-foreground", className)}>
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{formatRangeLabel(value.startDate, value.endDate, placeholder)}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="range"
                    selected={selected}
                    defaultMonth={selected?.from ?? selected?.to}
                    onDayClick={handleDayClick}
                    onDayMouseEnter={(date) => {
                        if (value.startDate && !value.endDate) setHoveredDate(date)
                    }}
                    onDayMouseLeave={() => setHoveredDate(undefined)}
                    modifiers={{ rangePreview: isPreviewDate }}
                    modifiersClassNames={{ rangePreview: "[&>button]:bg-primary/20 [&>button]:text-foreground" }}
                />
            </PopoverContent>
        </Popover>
    )
}

/** Memoizado como no Smart Desk: consumidores que re-renderizam não engolem cliques de navegação. */
export const DateRangeCalendar = React.memo(DateRangeCalendarImpl)
DateRangeCalendar.displayName = "DateRangeCalendar"
