import type { CheckBranch } from "@/lib/check-tree"
import { OPEX_TOOL_GROUP_LABELS, OPEX_TOOL_GROUPS, type OpexToolGroup } from "./constants"

/**
 * Seleção e confirmação das ferramentas do Agente Opex (módulo PURO: tela e servidor). Os
 * metadados vêm das próprias ferramentas do servidor (`server/tools/registry.ts`); a tela os recebe no
 * DTO da configuração e monta a árvore daqui.
 */

export type OpexToolRisk = "read" | "write" | "destructive"

export interface OpexToolMetaDto {
    name: string
    group: OpexToolGroup
    label: string
    /** Descrição enviada ao modelo (e exibida na configuração). */
    description: string
    risk: OpexToolRisk
    /** Pede confirmação por padrão mesmo sem ser destrutiva (ex.: escrita no GitHub). */
    confirmByDefault?: boolean
    /** Sempre ligada (o grupo Contexto): não aparece como desligável. */
    alwaysOn: boolean
    /** Papel mínimo efetivo (da ferramenta ou do grupo); ausente = inclusive visitantes. */
    minRole?: "user" | "admin"
}

type ConfirmMeta = { name: string; risk: OpexToolRisk; confirmByDefault?: boolean }

/** O grupo Contexto fica sempre ligado. */
export function isAlwaysOnGroup(group: string): boolean {
    return group === "context"
}

/** Confirmação padrão de uma ferramenta: as destrutivas e as marcadas com `confirmByDefault`. */
export function defaultToolConfirms(meta: Omit<ConfirmMeta, "name">): boolean {
    return meta.risk === "destructive" || meta.confirmByDefault === true
}

/** A ferramenta pede confirmação? O ajuste da ferramenta vence o padrão do risco. */
export function toolConfirms(meta: ConfirmMeta, overrides: Readonly<Record<string, boolean>> = {}): boolean {
    const override = overrides[meta.name]
    return typeof override === "boolean" ? override : defaultToolConfirms(meta)
}

/** Ajuste de confirmação depois de trocar o switch: igual ao padrão do risco, o ajuste some. */
export function nextConfirmationOverrides(overrides: Readonly<Record<string, boolean>>, meta: ConfirmMeta, confirms: boolean): Record<string, boolean> {
    const next = { ...overrides }
    if (confirms === defaultToolConfirms(meta)) delete next[meta.name]
    else next[meta.name] = confirms
    return next
}

/** Ferramentas ligadas a partir das desligadas guardadas (as sempre ligadas nunca saem). */
export function enabledOpexToolNames(tools: readonly OpexToolMetaDto[], disabledTools: readonly string[]): string[] {
    const disabled = new Set(disabledTools)
    return tools.filter((tool) => tool.alwaysOn || !disabled.has(tool.name)).map((tool) => tool.name)
}

/** Desligadas a partir das marcadas na árvore (sempre ligadas são ignoradas). */
export function disabledOpexToolNames(tools: readonly OpexToolMetaDto[], enabled: Iterable<string>): string[] {
    const on = new Set(enabled)
    return tools.filter((tool) => !tool.alwaysOn && !on.has(tool.name)).map((tool) => tool.name)
}

/**
 * Árvore da seleção: um módulo por grupo, uma folha por ferramenta (mesmo formato das permissões de
 * perfis do Ciliar). Destrutivas aparecem como sensíveis.
 */
export function buildOpexToolTree(tools: readonly OpexToolMetaDto[]): CheckBranch[] {
    return OPEX_TOOL_GROUPS.map((group) => ({
        id: `tools_${group}`,
        label: OPEX_TOOL_GROUP_LABELS[group].label,
        description: OPEX_TOOL_GROUP_LABELS[group].description,
        children: tools
            .filter((tool) => tool.group === group)
            .map((tool) => ({ key: tool.name, label: tool.label, description: tool.description, ...(tool.risk === "destructive" ? { sensitive: true } : {}) })),
    })).filter((branch) => branch.children.length > 0)
}

/**
 * Converte a configuração antiga (grupos ligados/desligados + política "Só destrutivas"/"Toda
 * alteração") para a seleção e a confirmação por ferramenta: grupo desligado vira todas as
 * ferramentas dele desligadas; "Toda alteração" vira confirmação ligada em cada ferramenta que altera.
 * Configuração já no formato novo volta como está.
 */
export function migrateLegacyToolSettings(saved: Record<string, unknown>, tools: readonly OpexToolMetaDto[]): Record<string, unknown> {
    const { toolGroups, confirmation, ...rest } = saved
    if (toolGroups === undefined && confirmation === undefined) return saved
    const out: Record<string, unknown> = { ...rest }
    if (!Array.isArray(rest.disabledTools)) {
        const groups = toolGroups && typeof toolGroups === "object" ? (toolGroups as Record<string, unknown>) : {}
        out.disabledTools = tools.filter((tool) => !tool.alwaysOn && groups[tool.group] === false).map((tool) => tool.name)
    }
    if (!rest.confirmationOverrides || typeof rest.confirmationOverrides !== "object") {
        out.confirmationOverrides = confirmation === "writes" ? Object.fromEntries(tools.filter((tool) => tool.risk === "write").map((tool) => [tool.name, true])) : {}
    }
    return out
}
