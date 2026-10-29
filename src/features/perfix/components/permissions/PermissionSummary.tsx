"use client"

import { useMemo } from "react"
import { countNodeLeaves, isPermissionLeaf, type PermissionBranchDef, type PermissionNodeDef } from "@nandobfer/perfix"
import { cn } from "@/lib/utils"
import { catalog, PERMISSION_TREE } from "../../catalog"
import { WILDCARD } from "@nandobfer/perfix"

interface PermissionSummaryProps {
    selected: ReadonlySet<string>
    /** `compact` cabe num tooltip; `full` é a pré-visualização do formulário. */
    variant?: "compact" | "full"
    /** Só no `compact`: quantos módulos listar antes de resumir em "+N". */
    maxModules?: number
    className?: string
}

interface ModuleSummary {
    module: PermissionBranchDef
    marked: number
    total: number
}

/**
 * Resumo somente leitura de um conjunto de permissões (copiado do Smart Desk). Módulo sem
 * nenhuma folha marcada não aparece — o resumo diz o que o perfil concede, não o catálogo.
 */
export function PermissionSummary({ selected, variant = "compact", maxModules = 4, className }: PermissionSummaryProps) {
    const isWildcard = selected.has(WILDCARD)

    const modules = useMemo<ModuleSummary[]>(() => {
        if (isWildcard) return []
        return PERMISSION_TREE.map((module) => ({
            module: module as PermissionBranchDef,
            ...countNodeLeaves(catalog, module as PermissionBranchDef, selected),
        })).filter((entry) => entry.marked > 0)
    }, [selected, isWildcard])

    if (isWildcard) {
        return <span className={cn("text-xs font-medium text-red-700 dark:text-red-400", className)}>Todas as permissões</span>
    }

    if (modules.length === 0) {
        return <span className={cn("text-xs text-muted-foreground", className)}>Nenhuma permissão</span>
    }

    if (variant === "compact") {
        const shown = modules.slice(0, maxModules)
        const rest = modules.length - shown.length
        return (
            <span className={cn("text-xs text-muted-foreground", className)}>
                {shown.map((entry, index) => (
                    <span key={entry.module.id}>
                        {index > 0 && <span className="opacity-60"> · </span>}
                        {entry.module.label}{" "}
                        <span className="font-semibold tabular-nums">
                            {entry.marked}/{entry.total}
                        </span>
                    </span>
                ))}
                {rest > 0 && <span className="opacity-60"> · +{rest}</span>}
            </span>
        )
    }

    return (
        <div className={cn("flex flex-col gap-2.5", className)}>
            {modules.map(({ module, marked, total }) => (
                <div key={module.id}>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{module.label}</span>
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                            {marked}/{total}
                        </span>
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5">
                        {module.children.map((child) => (
                            <SummaryNode key={isPermissionLeaf(child) ? child.key : child.id} node={child} selected={selected} />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    )
}

/** Uma linha do resumo, recursiva (subgrupos preservados, sem título órfão). */
function SummaryNode({ node, selected }: { node: PermissionNodeDef; selected: ReadonlySet<string> }) {
    if (isPermissionLeaf(node)) {
        if (!selected.has(node.key)) return null
        return <li className="text-[11px] text-muted-foreground">{node.label}</li>
    }

    if (countNodeLeaves(catalog, node, selected).marked === 0) return null

    return (
        <li>
            <span className="text-[11px] font-medium text-foreground/80">{node.label}</span>
            <ul className="mt-0.5 flex flex-col gap-0.5 pl-3">
                {node.children.map((child) => (
                    <SummaryNode key={isPermissionLeaf(child) ? child.key : child.id} node={child} selected={selected} />
                ))}
            </ul>
        </li>
    )
}
