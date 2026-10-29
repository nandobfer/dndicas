"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/opex/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/opex/popover"

export interface ComboboxOption {
  value: string
  label: string
  /** Segunda linha, discreta (também entra na busca). */
  description?: string
}

interface ComboboxProps {
  /** Id do botão (liga o rótulo do campo). */
  id?: string
  options: ComboboxOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  emptyText?: string
  searchPlaceholder?: string
  className?: string
}

export function Combobox({
  id,
  options,
  value,
  onValueChange,
  placeholder = "Selecione uma opção...",
  emptyText = "Nenhum resultado encontrado.",
  searchPlaceholder = "Buscar...",
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const filtered = options.filter((option) =>
    `${option.label} ${option.description ?? ""}`.toLowerCase().includes(search.toLowerCase())
  )

  const selectedOption = options.find((option) => option.value === value)

  return (
    // `modal`: dentro de um Dialog, a lista (renderizada fora dele) só rola com a roda do mouse
    // se o Popover tiver a própria trava de rolagem — sem isso o Dialog bloqueia o scroll.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          title={selectedOption?.label}
          className={cn("w-full min-w-0 justify-between font-normal", className)}
        >
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* A lista tem a largura do campo: textos longos quebram linha, nunca vazam do modal. */}
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="flex items-center border-b px-3">
          <input
            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="py-6 text-center text-sm">{emptyText}</div>
          )}
          {filtered.map((option) => (
            <div
              key={option.value}
              className={cn(
                "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer",
                value === option.value && "bg-accent"
              )}
              onClick={() => {
                onValueChange?.(option.value === value ? "" : option.value)
                setOpen(false)
              }}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4 shrink-0 self-start mt-0.5",
                  value === option.value ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="min-w-0 break-words">
                {option.label}
                {option.description && <span className="block text-xs text-muted-foreground">{option.description}</span>}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
