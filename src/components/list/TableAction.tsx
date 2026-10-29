"use client"

import { Bug, Eye, Link2, Pencil, Plus, PlugZap, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/opex/tooltip"

type TableActionType = "edit" | "create" | "delete" | "visualize" | "test" | "debug" | "link"

interface TableActionProps {
  type: TableActionType
  onClick: () => void
  disabled?: boolean
  disabledReason?: string
}

const ACTION_CONFIG: Record<
  TableActionType,
  {
    icon: typeof Pencil
    title: string
    className: string
  }
> = {
  edit: {
    icon: Pencil,
    title: "Editar",
    className: "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15",
  },
  create: {
    icon: Plus,
    title: "Criar",
    className: "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15",
  },
  delete: {
    icon: Trash2,
    title: "Excluir",
    className: "text-destructive hover:text-destructive hover:bg-destructive/10",
  },
  visualize: {
    icon: Eye,
    title: "Visualizar",
    className: "text-blue-400 hover:text-blue-300 hover:bg-blue-500/15",
  },
  test: {
    icon: PlugZap,
    title: "Testar conexão",
    className: "text-sky-400 hover:text-sky-300 hover:bg-sky-500/15",
  },
  debug: {
    icon: Bug,
    title: "Debug",
    className: "text-amber-400 hover:text-amber-300 hover:bg-amber-500/15",
  },
  link: {
    icon: Link2,
    title: "Vincular",
    className: "text-violet-400 hover:text-violet-300 hover:bg-violet-500/15",
  },
}

export function TableAction({ type, onClick, disabled = false, disabledReason }: TableActionProps) {
  const { icon: Icon, title, className } = ACTION_CONFIG[type]

  const action = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={disabledReason ?? title}
      aria-label={title}
      className={cn(
        "h-9 w-9 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )

  if (!disabled || !disabledReason) return action

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" tabIndex={0} aria-label={disabledReason}>
            {action}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{disabledReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
