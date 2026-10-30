"use client"

import { useId, type ReactNode } from "react"
import { countNodeLeaves, getNodeState, isPermissionLeaf, type Catalog, type PermissionNodeDef } from "@nandobfer/perfix"
import { cn } from "@/lib/utils"
import { catalog as accessCatalog } from "../../catalog"
import { PermissionCheckbox } from "./PermissionCheckbox"

interface PermissionTreeNodeProps {
    node: PermissionNodeDef
    selected: ReadonlySet<string>
    onToggle: (node: PermissionNodeDef, next: boolean) => void
    /** Profundidade dentro do módulo. 0 = filho direto do cartão. */
    depth?: number
    readOnly?: boolean
    /** Catálogo da árvore (padrão: permissões de acesso). Reaproveitado pela seleção de ferramentas do agente. */
    catalog?: Catalog
    /** Folhas sempre marcadas e travadas (ex.: ferramenta de contexto do agente). */
    lockedKeys?: ReadonlySet<string>
    /** Conteúdo extra ao lado do rótulo da folha (ex.: risco e permissões exigidas da ferramenta). */
    renderLeafMeta?: (key: string) => ReactNode
}

/**
 * Uma linha da árvore — folha ou subgrupo, recursivamente (copiado do Smart Desk).
 *
 * A folha `view` exigida por uma ação marcada fica travada (`isRequiredView`): desmarcá-la
 * deixaria a ação sem a visualização do próprio grupo. Nos perfis, também a chave exigida por outra
 * marcada (dependências entre grupos dos Negócios).
 */
export function PermissionTreeNode({ node, selected, onToggle, depth = 0, readOnly = false, catalog = accessCatalog, lockedKeys, renderLeafMeta }: PermissionTreeNodeProps) {
    const state = getNodeState(catalog, node, selected)
    const checkboxId = useId()

    // Indentação por `style`: o JIT do Tailwind não gera classe montada em runtime.
    const indent = { paddingLeft: depth * 16 }

    if (isPermissionLeaf(node)) {
        const requiredByAction = catalog.isRequiredView(node.key, selected) || Boolean(lockedKeys?.has(node.key))

        return (
            <div className="flex items-start gap-2 py-1" style={indent}>
                <PermissionCheckbox
                    id={checkboxId}
                    state={state}
                    onChange={(next) => onToggle(node, next)}
                    disabled={readOnly || requiredByAction}
                    aria-label={node.label}
                    className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <label
                            htmlFor={checkboxId}
                            className={cn(
                                "text-sm text-gray-700 dark:text-gray-300",
                                readOnly || requiredByAction ? "cursor-not-allowed" : "cursor-pointer",
                            )}
                        >
                            {node.label}
                        </label>
                        {renderLeafMeta?.(node.key)}
                    </div>
                    {node.description && <p className="text-[11px] text-gray-500 dark:text-gray-400">{node.description}</p>}
                </div>
            </div>
        )
    }

    const { marked, total } = countNodeLeaves(catalog, node, selected)

    return (
        // `role="group"` + `aria-label`: rótulos de folha se repetem entre subgrupos ("Visualizar").
        <div className="py-1" style={indent} role="group" aria-label={node.label}>
            <div className="flex items-start gap-2">
                <PermissionCheckbox
                    id={checkboxId}
                    state={state}
                    onChange={(next) => onToggle(node, next)}
                    disabled={readOnly}
                    aria-label={node.label}
                    className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <label
                            htmlFor={checkboxId}
                            className={cn("text-sm font-medium text-gray-800 dark:text-gray-200", readOnly ? "cursor-not-allowed" : "cursor-pointer")}
                        >
                            {node.label}
                        </label>
                        <span
                            className={cn(
                                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                                marked === 0 ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" : "bg-primary/10 text-primary",
                            )}
                        >
                            {marked}/{total}
                        </span>
                    </div>
                    {node.description && <p className="text-[11px] text-gray-500 dark:text-gray-400">{node.description}</p>}
                </div>
            </div>

            <div className="mt-0.5">
                {node.children.map((child) => (
                    <PermissionTreeNode
                        key={isPermissionLeaf(child) ? child.key : child.id}
                        node={child}
                        selected={selected}
                        onToggle={onToggle}
                        depth={depth + 1}
                        readOnly={readOnly}
                        catalog={catalog}
                        lockedKeys={lockedKeys}
                        renderLeafMeta={renderLeafMeta}
                    />
                ))}
            </div>
        </div>
    )
}
