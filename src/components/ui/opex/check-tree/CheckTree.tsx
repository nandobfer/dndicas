"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/opex/input"
import { filterCheckNodes, isCheckLeaf, toggleNode, type CheckBranch, type CheckNode } from "@/lib/check-tree"
import { cn } from "@/lib/utils"
import { CheckTreeModuleCard } from "./CheckTreeModuleCard"

interface CheckTreeProps {
    tree: readonly CheckBranch[]
    /** Chaves de folha marcadas. */
    selected: ReadonlySet<string>
    onChange: (next: Set<string>) => void
    readOnly?: boolean
    /** Campo de busca no topo. */
    searchable?: boolean
    className?: string
    /** Folhas sempre marcadas e travadas. */
    lockedKeys?: ReadonlySet<string>
    renderLeafMeta?: (key: string) => ReactNode
    renderModuleMeta?: (id: string) => ReactNode
    searchPlaceholder?: string
    emptyText?: string
}

/**
 * Árvore de seleção por módulos (copiada da árvore de permissões do Ciliar): caixa tri-estado e
 * contador por módulo, busca e módulos recolhíveis. TOTALMENTE CONTROLADA: o único estado daqui é o
 * dos módulos abertos e o da busca.
 */
export function CheckTree({
    tree,
    selected,
    onChange,
    readOnly = false,
    searchable = true,
    className,
    lockedKeys,
    renderLeafMeta,
    renderModuleMeta,
    searchPlaceholder = "Buscar...",
    emptyText = "Nenhum item encontrado.",
}: CheckTreeProps) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [query, setQuery] = useState("")
    const isSearching = query.trim().length > 0

    const modules = useMemo(() => filterCheckNodes(tree, query).filter((node): node is CheckBranch => !isCheckLeaf(node)), [query, tree])

    const handleToggle = (node: CheckNode, next: boolean) => {
        if (readOnly) return
        const updated = toggleNode(node, selected, next, lockedKeys)
        lockedKeys?.forEach((key) => updated.add(key))
        onChange(updated)
    }

    const setExpanded = (id: string, next: boolean) => {
        setExpandedIds((current) => {
            const out = new Set(current)
            if (next) out.add(id)
            else out.delete(id)
            return out
        })
    }

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            {searchable && (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder.replace(/\.+$/, "")} className="pl-9" />
                </div>
            )}

            {/* Bloco comum, NÃO `flex flex-col` com teto de altura: a coluna flex encolheria os cartões. */}
            <div className="space-y-2">
                {modules.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
                ) : (
                    modules.map((module) => (
                        <CheckTreeModuleCard
                            key={module.id}
                            module={module}
                            selected={selected}
                            onToggle={handleToggle}
                            // Buscando, tudo que sobrou do filtro é relevante: abre todos os módulos.
                            expanded={isSearching || expandedIds.has(module.id)}
                            onExpandedChange={(next) => setExpanded(module.id, next)}
                            readOnly={readOnly}
                            lockedKeys={lockedKeys}
                            renderLeafMeta={renderLeafMeta}
                            renderModuleMeta={renderModuleMeta}
                        />
                    ))
                )}
            </div>
        </div>
    )
}
