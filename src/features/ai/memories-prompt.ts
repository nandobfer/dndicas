/**
 * Seção das memórias dos agentes nas instruções de sistema (módulo PURO, compartilhado pelo Agente
 * Opex e pelo Agente Adversário).
 */

/** Seção das memórias para as instruções de sistema (vazia sem memórias). */
export function memoriesSection(texts: readonly string[]): string {
    if (!texts.length) return ""
    return ["", "## Memórias e instruções permanentes", "Siga sempre estas memórias, cadastradas pelos administradores do DnDicas:", ...texts.map((text) => `- ${text.replace(/\n+/g, " ")}`)].join("\n")
}
