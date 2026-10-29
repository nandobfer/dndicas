"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { countNodeLeaves, getNodeState, isPermissionLeaf, type Catalog, type PermissionBranchDef, type PermissionNodeDef } from "@nandobfer/perfix"
import { cn } from "@/lib/utils"
import { catalog as accessCatalog } from "../../catalog"
import { PermissionCheckbox } from "./PermissionCheckbox"
import { PermissionTreeNode } from "./PermissionTreeNode"

interface PermissionModuleCardProps {
    module: PermissionBranchDef
    selected: ReadonlySet<string>
    onToggle: (node: PermissionNodeDef, next: boolean) => void
    expanded: boolean
    onExpandedChange: (next: boolean) => void
    readOnly?: boolean
    catalog?: Catalog
    lockedKeys?: ReadonlySet<string>
    renderLeafMeta?: (key: string) => ReactNode
}

/**
 * Um módulo do catálogo, com disclosure próprio (copiado do Smart Desk).
 *
 * Não usa o `Accordion`: o trigger do Radix é um `<button>` e o checkbox do módulo precisa ficar
 * na mesma linha — daria botão dentro de botão. A área do checkbox para a propagação, senão
 * marcar um módulo o abriria junto.
 */
export function PermissionModuleCard({ module, selected, onToggle, expanded, onExpandedChange, readOnly = false, catalog = accessCatalog, lockedKeys, renderLeafMeta }: PermissionModuleCardProps) {
    const state = getNodeState(catalog, module, selected)
    const { marked, total } = countNodeLeaves(catalog, module, selected)

    return (
        <div
            className={cn(
                "shrink-0 overflow-hidden rounded-lg border transition-colors",
                module.sensitive
                    ? "border-amber-300 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20"
                    : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900",
            )}
        >
            <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => onExpandedChange(!expanded)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onExpandedChange(!expanded)
                    }
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
                <span onClick={(event) => event.stopPropagation()} className="inline-flex">
                    <PermissionCheckbox state={state} onChange={(next) => onToggle(module, next)} disabled={readOnly} aria-label={module.label} />
                </span>

                <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200">{module.label}</span>

                {module.sensitive && (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" aria-label="Módulo com permissões sensíveis" />
                )}

                <span
                    className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                        marked === 0 ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" : "bg-primary/10 text-primary",
                    )}
                >
                    {marked}/{total}
                </span>

                <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                </motion.span>
            </div>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
                            {module.description && <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{module.description}</p>}
                            {module.children.map((child) => (
                                <PermissionTreeNode
                                    key={isPermissionLeaf(child) ? child.key : child.id}
                                    node={child}
                                    selected={selected}
                                    onToggle={onToggle}
                                    readOnly={readOnly}
                                    catalog={catalog}
                                    lockedKeys={lockedKeys}
                                    renderLeafMeta={renderLeafMeta}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
