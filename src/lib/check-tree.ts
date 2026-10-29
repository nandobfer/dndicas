/**
 * Árvore de seleção com caixas tri-estado (módulo PURO: tela e servidor). Equivalente aos helpers da
 * árvore de permissões do Ciliar (`@nandobfer/perfix`), sem permissões: um módulo (ramo) agrupa
 * folhas ou subgrupos, e marcar um ramo marca todas as folhas dele.
 */

export interface CheckLeaf {
    key: string
    label: string
    description?: string
    /** Destaque de item sensível (ex.: ferramenta destrutiva). */
    sensitive?: boolean
}

export interface CheckBranch {
    id: string
    label: string
    description?: string
    sensitive?: boolean
    children: readonly CheckNode[]
}

export type CheckNode = CheckLeaf | CheckBranch
export type CheckNodeState = "checked" | "indeterminate" | "unchecked"

export function isCheckLeaf(node: CheckNode): node is CheckLeaf {
    return "key" in node
}

/** Chaves de todas as folhas do nó (a própria, se for folha). */
export function leafKeys(node: CheckNode): string[] {
    return isCheckLeaf(node) ? [node.key] : node.children.flatMap(leafKeys)
}

export function countNodeLeaves(node: CheckNode, selected: ReadonlySet<string>): { marked: number; total: number } {
    const keys = leafKeys(node)
    return { marked: keys.filter((key) => selected.has(key)).length, total: keys.length }
}

export function getNodeState(node: CheckNode, selected: ReadonlySet<string>): CheckNodeState {
    const { marked, total } = countNodeLeaves(node, selected)
    if (total > 0 && marked === total) return "checked"
    return marked > 0 ? "indeterminate" : "unchecked"
}

/** Nova seleção ao marcar/desmarcar o nó (folha ou ramo inteiro). Folhas travadas nunca saem. */
export function toggleNode(node: CheckNode, selected: ReadonlySet<string>, next: boolean, lockedKeys?: ReadonlySet<string>): Set<string> {
    const out = new Set(selected)
    for (const key of leafKeys(node)) {
        if (next) out.add(key)
        else if (!lockedKeys?.has(key)) out.delete(key)
    }
    return out
}

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

function matches(node: CheckNode, query: string): boolean {
    const text = [node.label, node.description ?? "", isCheckLeaf(node) ? node.key : node.id].join(" ")
    return normalize(text).includes(query)
}

/**
 * Filtra a árvore pela busca (sem acento, sem caixa): ramo que casa fica inteiro; senão, só os
 * descendentes que casam. Ramos vazios somem.
 */
export function filterCheckNodes(nodes: readonly CheckNode[], query: string): CheckNode[] {
    const term = normalize(query.trim())
    if (!term) return [...nodes]
    const out: CheckNode[] = []
    for (const node of nodes) {
        if (matches(node, term)) {
            out.push(node)
            continue
        }
        if (isCheckLeaf(node)) continue
        const children = filterCheckNodes(node.children, term)
        if (children.length) out.push({ ...node, children })
    }
    return out
}
