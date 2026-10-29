"use client"

import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import type { Matcher } from "react-day-picker"

import { Button } from "@/components/ui/opex/button"
import { Calendar } from "@/components/ui/opex/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/opex/popover"
import { cn } from "@/lib/utils"

export interface DatePickerProps {
    value: string
    onChange: (value: string) => void
    disabled?: Matcher | Matcher[]
    fromDate?: Date
    toDate?: Date
    placeholder?: string
    id?: string
    className?: string
    inputDisabled?: boolean
}

function parseValue(value: string): Date | undefined {
    if (!value) return undefined
    const parsed = parse(value, "yyyy-MM-dd", new Date())
    return isValid(parsed) ? parsed : undefined
}

export function DatePicker({
    value,
    onChange,
    disabled,
    fromDate,
    toDate,
    placeholder = "Selecionar data",
    id,
    className,
    inputDisabled,
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false)
    const selected = parseValue(value)
    const display = selected ? format(selected, "dd/MM/yyyy") : placeholder

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={inputDisabled}
                    className={cn(
                        "w-full justify-start text-left font-normal h-10 truncate px-3",
                        !selected && "text-muted-foreground",
                        className,
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{display}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={selected}
                    defaultMonth={selected ?? fromDate}
                    startMonth={fromDate}
                    endMonth={toDate}
                    disabled={disabled}
                    onSelect={(date) => {
                        if (!date) return
                        onChange(format(date, "yyyy-MM-dd"))
                        setOpen(false)
                    }}
                />
            </PopoverContent>
        </Popover>
    )
}
