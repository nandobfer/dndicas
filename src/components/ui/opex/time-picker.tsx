"use client"

import { useState } from "react"
import { Clock } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/opex/popover"
import { TimeSlotList, type TimeSlotListProps } from "@/components/ui/opex/time-slot-list"
import { cn } from "@/lib/utils"

export interface TimePickerProps extends Omit<TimeSlotListProps, "className"> {
    id?: string
    placeholder?: string
    className?: string
}

/**
 * Seletor de horário do app, no mesmo desenho do `DatePicker` (botão + popover com `TimeSlotList`).
 * Use no lugar de `<input type="time">`.
 */
export function TimePicker({ id, value, onChange, placeholder = "Selecionar horário", disabled, className, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, ...list }: TimePickerProps) {
    const [open, setOpen] = useState(false)
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    aria-label={ariaLabel}
                    aria-labelledby={ariaLabelledby}
                    className={cn("h-10 w-full justify-start px-3 text-left font-normal tabular-nums", !value && "text-muted-foreground", className)}
                >
                    <Clock className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{value || placeholder}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-36 p-1" align="start">
                <TimeSlotList
                    {...list}
                    aria-label={ariaLabel}
                    aria-labelledby={ariaLabelledby}
                    value={value}
                    className="border-0"
                    onChange={(next) => {
                        onChange(next)
                        setOpen(false)
                    }}
                />
            </PopoverContent>
        </Popover>
    )
}
