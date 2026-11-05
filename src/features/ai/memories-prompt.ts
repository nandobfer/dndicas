/**
 * Seção das memórias dos agentes nas instruções de sistema (módulo PURO). O bloco vem pronto do
 * Engramind (`src/features/engramind/server/memory-context.ts`) e entra sem alteração depois do
 * cabeçalho curto.
 */

/** Seção das memórias para as instruções de sistema (vazia sem bloco). */
export function memoriesSection(block: string | null | undefined): string {
    const content = block?.trim()
    if (!content) return ""
    return ["", "## Memórias e instruções permanentes", "Siga sempre estas memórias, cadastradas na rede de memórias do dndicas:", "", content].join("\n")
}
