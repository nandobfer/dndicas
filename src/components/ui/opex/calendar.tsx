"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/opex/button"

import "react-day-picker/style.css"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

export function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    fixedWeeks = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            locale={ptBR}
            showOutsideDays={showOutsideDays}
            fixedWeeks={fixedWeeks}
            className={cn("p-3", className)}
            classNames={{
                months: "relative flex flex-col sm:flex-row gap-2",
                month: "flex flex-col gap-3",
                month_caption: "flex h-9 items-center justify-center",
                caption_label: "text-sm font-medium capitalize",
                nav: "pointer-events-none absolute top-0 left-0 right-0 z-30 flex h-9 items-center justify-between px-1",
                button_previous:
                    "pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
                button_next:
                    "pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
                month_grid: "w-full border-collapse",
                weekdays: "flex",
                weekday: "text-muted-foreground rounded-md w-8 font-normal text-[0.7rem] uppercase",
                week: "flex w-full mt-1",
                day: "relative h-8 w-8 text-center text-sm p-0 focus-within:relative focus-within:z-20",
                day_button: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
                ),
                range_start: "day-range-start",
                range_end: "day-range-end",
                selected:
                    // Cor primária do tema (`primary`), nunca fixa.
                    "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/90 [&>button]:hover:text-primary-foreground [&>button]:focus:bg-primary/90 [&>button]:focus:text-primary-foreground",
                today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
                outside:
                    "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
                disabled: "text-muted-foreground opacity-40 line-through",
                range_middle:
                    "aria-selected:bg-accent aria-selected:text-accent-foreground",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation }) =>
                    orientation === "left" ? (
                        <ChevronLeft className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    ),
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"
