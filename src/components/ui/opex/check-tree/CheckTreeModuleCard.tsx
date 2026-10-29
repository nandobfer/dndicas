"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { countNodeLeaves, getNodeState, isCheckLeaf, type CheckBranch, type CheckNode } from "@/lib/check-tree"
import { cn } from "@/lib/utils"
import { CheckTreeNode } from "./CheckTreeNode"
import { TriStateCheckbox } from "./TriStateCheckbox"

interface CheckTreeModuleCardProps {
    module: CheckBranch
    selected: ReadonlySet<string>
    onToggle: (node: CheckNode, next: boolean) => void
    expanded: boolean
    onExpandedChange: (next: boolean) => void
    readOnly?: boolean
    lockedKeys?: ReadonlySet<string>
    renderLeafMeta?: (key: string) => ReactNode
    /** Conteúdo extra ao lado do nome do módulo (ex.: "Só admin do cliente"). */
    renderModuleMeta?: (id: string) => ReactNode
}

/**
 * Um módulo da árvore, com disclosure próprio (copiado do Ciliar). Não usa o `Accordion`: o trigger
 * do Radix é um `<button>` e o checkbox do módulo precisa ficar na mesma linha — daria botão dentro
 * de botão. A área do checkbox para a propagação, senão marcar um módulo o abriria junto.
 */
export function CheckTreeModuleCard({ module, selected, onToggle, expanded, onExpandedChange, readOnly = false, lockedKeys, renderLeafMeta, renderModuleMeta }: CheckTreeModuleCardProps) {
    const state = getNodeState(module, selected)
    const { marked, total } = countNodeLeaves(module, selected)

    return (
        <div className={cn("shrink-0 overflow-hidden rounded-lg border transition-colors", module.sensitive ? "border-warning/50 bg-warning/5" : "border-border bg-card")}>
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
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50"
            >
                <span onClick={(event) => event.stopPropagation()} className="inline-flex">
                    <TriStateCheckbox state={state} onChange={(next) => onToggle(module, next)} disabled={readOnly} aria-label={module.label} />
                </span>

                <span className="flex flex-1 flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                    {module.label}
                    {renderModuleMeta?.(module.id)}
                </span>

                {module.sensitive && <AlertTriangle className="h-4 w-4 text-warning" aria-label="Módulo com itens sensíveis" />}

                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", marked === 0 ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                    {marked}/{total}
                </span>

                <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
                        <div className="border-t border-border px-3 py-2">
                            {module.description && <p className="mb-2 text-[11px] text-muted-foreground">{module.description}</p>}
                            {module.children.map((child) => (
                                <CheckTreeNode
                                    key={isCheckLeaf(child) ? child.key : child.id}
                                    node={child}
                                    selected={selected}
                                    onToggle={onToggle}
                                    readOnly={readOnly}
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
