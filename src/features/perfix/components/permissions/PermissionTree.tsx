"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Search, Zap } from "lucide-react"
import { filterPermissionNodes, isPermissionLeaf, toggleNode, type Catalog, type PermissionBranchDef, type PermissionNodeDef } from "@nandobfer/perfix"
import { Input } from "@/core/ui/input"
import { cn } from "@/lib/utils"
import { catalog as accessCatalog, normalizeRolePermissions, PERMISSION_TREE } from "../../catalog"
import { WILDCARD } from "@nandobfer/perfix"
import { PermissionModuleCard } from "./PermissionModuleCard"

interface PermissionTreeProps {
    /** Chaves de folha marcadas. Pode conter o coringa `"*"`. */
    selected: ReadonlySet<string>
    onChange: (next: Set<string>) => void
    readOnly?: boolean
    /** Campo de busca no topo. */
    searchable?: boolean
    className?: string
    /** Árvore e catálogo (padrão: permissões de acesso). A seleção de ferramentas do Agente Opex reaproveita os mesmos componentes. */
    tree?: readonly PermissionBranchDef[]
    catalog?: Catalog
    /** Folhas sempre marcadas e travadas. */
    lockedKeys?: ReadonlySet<string>
    renderLeafMeta?: (key: string) => ReactNode
    searchPlaceholder?: string
    emptyText?: string
}

/**
 * A árvore de permissões do catálogo (copiada do Smart Desk).
 *
 * TOTALMENTE CONTROLADA: o único estado daqui é o dos módulos abertos. Toda mudança passa por
 * `toggleNode` do `@nandobfer/perfix` — o mesmo helper do servidor, que também marca a folha
 * `view` do grupo quando uma ação filha é marcada.
 */
export function PermissionTree({
    selected,
    onChange,
    readOnly = false,
    searchable = true,
    className,
    tree = PERMISSION_TREE,
    catalog = accessCatalog,
    lockedKeys,
    renderLeafMeta,
    searchPlaceholder = "Buscar permissão...",
    emptyText = "Nenhuma permissão encontrada.",
}: PermissionTreeProps) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [query, setQuery] = useState("")

    // Perfil com `"*"` concede tudo, inclusive permissões futuras: editar folha a folha
    // destruiria o coringa no primeiro clique — então o modo é leitura, com aviso.
    const isWildcard = selected.has(WILDCARD)
    const locked = readOnly || isWildcard

    const isSearching = query.trim().length > 0

    const modules = useMemo(
        () => filterPermissionNodes(tree as unknown as readonly PermissionNodeDef[], query).filter(isBranch),
        [query, tree],
    )

    const handleToggle = (node: PermissionNodeDef, next: boolean) => {
        if (locked) return
        let updated = toggleNode(catalog, node, selected, next)
        // Perfis: as dependências entre grupos dos Negócios (ex.: Pedidos › Visualizar marca Clientes › Visualizar).
        if (catalog === accessCatalog) updated = new Set(normalizeRolePermissions(updated))
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
            {isWildcard && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400">
                    <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Este perfil concede <strong>todas as permissões</strong>, inclusive as adicionadas no futuro.
                    </span>
                </div>
            )}

            {searchable && (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={searchPlaceholder}
                        aria-label={searchPlaceholder.replace(/\.+$/, "")}
                        className="pl-9"
                    />
                </div>
            )}

            {/* Bloco comum, NÃO `flex flex-col` com teto de altura: a coluna flex encolheria os cartões. */}
            <div className="space-y-2">
                {modules.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
                ) : (
                    modules.map((module) => (
                        <PermissionModuleCard
                            key={module.id}
                            module={module}
                            selected={selected}
                            onToggle={handleToggle}
                            // Buscando, tudo que sobrou do filtro é relevante: abre todos os módulos.
                            expanded={isSearching || expandedIds.has(module.id)}
                            onExpandedChange={(next) => setExpanded(module.id, next)}
                            readOnly={locked}
                            catalog={catalog}
                            lockedKeys={lockedKeys}
                            renderLeafMeta={renderLeafMeta}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

function isBranch(node: PermissionNodeDef): node is PermissionBranchDef {
    return !isPermissionLeaf(node)
}
