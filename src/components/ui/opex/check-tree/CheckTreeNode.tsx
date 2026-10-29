"use client"

import { useId, type ReactNode } from "react"
import { countNodeLeaves, getNodeState, isCheckLeaf, type CheckNode } from "@/lib/check-tree"
import { cn } from "@/lib/utils"
import { TriStateCheckbox } from "./TriStateCheckbox"

interface CheckTreeNodeProps {
    node: CheckNode
    selected: ReadonlySet<string>
    onToggle: (node: CheckNode, next: boolean) => void
    /** Profundidade dentro do módulo. 0 = filho direto do cartão. */
    depth?: number
    readOnly?: boolean
    /** Folhas sempre marcadas e travadas (ex.: ferramenta de contexto do agente). */
    lockedKeys?: ReadonlySet<string>
    /** Conteúdo extra ao lado do rótulo da folha (ex.: risco e confirmação da ferramenta). */
    renderLeafMeta?: (key: string) => ReactNode
}

/** Uma linha da árvore — folha ou subgrupo, recursivamente (copiado do Ciliar). */
export function CheckTreeNode({ node, selected, onToggle, depth = 0, readOnly = false, lockedKeys, renderLeafMeta }: CheckTreeNodeProps) {
    const state = getNodeState(node, selected)
    const checkboxId = useId()

    // Indentação por `style`: o JIT do Tailwind não gera classe montada em runtime.
    const indent = { paddingLeft: depth * 16 }

    if (isCheckLeaf(node)) {
        const locked = Boolean(lockedKeys?.has(node.key))
        return (
            <div className="flex items-start gap-2 py-1" style={indent}>
                <TriStateCheckbox id={checkboxId} state={state} onChange={(next) => onToggle(node, next)} disabled={readOnly || locked} aria-label={node.label} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <label htmlFor={checkboxId} className={cn("text-sm text-foreground", readOnly || locked ? "cursor-not-allowed" : "cursor-pointer")}>
                            {node.label}
                        </label>
                        {renderLeafMeta?.(node.key)}
                    </div>
                    {node.description && <p className="text-[11px] text-muted-foreground">{node.description}</p>}
                </div>
            </div>
        )
    }

    const { marked, total } = countNodeLeaves(node, selected)

    return (
        // `role="group"` + `aria-label`: rótulos de folha podem se repetir entre subgrupos.
        <div className="py-1" style={indent} role="group" aria-label={node.label}>
            <div className="flex items-start gap-2">
                <TriStateCheckbox id={checkboxId} state={state} onChange={(next) => onToggle(node, next)} disabled={readOnly} aria-label={node.label} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <label htmlFor={checkboxId} className={cn("text-sm font-medium text-foreground", readOnly ? "cursor-not-allowed" : "cursor-pointer")}>
                            {node.label}
                        </label>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", marked === 0 ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                            {marked}/{total}
                        </span>
                    </div>
                    {node.description && <p className="text-[11px] text-muted-foreground">{node.description}</p>}
                </div>
            </div>

            <div className="mt-0.5">
                {node.children.map((child) => (
                    <CheckTreeNode
                        key={isCheckLeaf(child) ? child.key : child.id}
                        node={child}
                        selected={selected}
                        onToggle={onToggle}
                        depth={depth + 1}
                        readOnly={readOnly}
                        lockedKeys={lockedKeys}
                        renderLeafMeta={renderLeafMeta}
                    />
                ))}
            </div>
        </div>
    )
}
