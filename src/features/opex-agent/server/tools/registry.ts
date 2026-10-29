import { OPEX_GROUP_MIN_ROLE, type OpexToolGroup } from "../../constants"
import { roleAllows, type OpexRole } from "../../scope"
import type { OpexServerScope } from "../scope"
import { isAlwaysOnGroup, toolConfirms, type OpexToolMetaDto } from "../../tool-tree"
import type { OpexTool } from "./define"
import { catalogAdminTools, catalogTools } from "./catalog"
import { characterTools } from "./characters"
import { contextTools } from "./context"
import { docTools } from "./docs"
import { feedbackTools } from "./feedback"
import { fileTools } from "./files"
import { integrationTools } from "./integrations"
import { jobTools } from "./jobs"
import { memoryTools } from "./memories"
import { aiSettingsTools } from "./misc"

/** Todas as ferramentas do Agente Opex (nomes únicos; o modelo as vê pelo nome). */
export const OPEX_TOOLS: readonly OpexTool[] = [
    ...contextTools,
    ...docTools,
    ...catalogTools,
    ...characterTools,
    ...catalogAdminTools,
    ...fileTools,
    ...jobTools,
    ...memoryTools,
    ...integrationTools,
    ...aiSettingsTools,
    ...feedbackTools,
] as readonly OpexTool[]

export function findOpexTool(name: string): OpexTool | undefined {
    return OPEX_TOOLS.find((tool) => tool.name === name)
}

/** Papel mínimo efetivo: o da ferramenta ou, sem ele, o do grupo. */
export function toolMinRole(tool: Pick<OpexTool, "group" | "minRole">): "user" | "admin" | undefined {
    return tool.minRole ?? OPEX_GROUP_MIN_ROLE[tool.group]
}

/** O papel do turno pode usar a ferramenta? (conferido ao montar o turno e antes de cada chamada) */
export function toolAllowedFor(tool: Pick<OpexTool, "group" | "minRole">, role: OpexRole): boolean {
    return roleAllows(role, toolMinRole(tool))
}

/** Permissões Perfix do escopo (visitantes não têm nenhuma). */
export function scopePermissions(scope: OpexServerScope): readonly string[] {
    return scope.kind === "user" ? scope.actor.permissions ?? [] : []
}

/**
 * O escopo pode usar a ferramenta? Papel mínimo e permissão Perfix exigida. Sem `input` (montagem do
 * turno), só a permissão fixa é conferida; a que depende da entrada é conferida em cada chamada.
 */
export function toolPermittedFor(tool: Pick<OpexTool, "group" | "minRole" | "permission" | "permissionFor">, scope: OpexServerScope, input?: unknown): boolean {
    if (!toolAllowedFor(tool, scope.kind === "anonymous" ? "anonymous" : scope.actor.role)) return false
    const permissions = scopePermissions(scope)
    const has = (key: string) => permissions.includes("*") || permissions.includes(key)
    if (tool.permission && !has(tool.permission)) return false
    if (tool.permissionFor && input !== undefined && !has(tool.permissionFor(input))) return false
    return true
}

/** Metadados exibidos na configuração (sem a entrada nem a execução). */
export function opexToolMetas(): OpexToolMetaDto[] {
    return OPEX_TOOLS.map((tool) => {
        const minRole = toolMinRole(tool)
        return {
            name: tool.name,
            group: tool.group as OpexToolGroup,
            label: tool.label,
            description: tool.description,
            risk: tool.risk,
            ...(tool.confirmByDefault ? { confirmByDefault: true } : {}),
            alwaysOn: isAlwaysOnGroup(tool.group),
            ...(minRole ? { minRole } : {}),
        }
    })
}

/**
 * Ferramentas do turno: as ligadas na configuração (o grupo Contexto fica sempre disponível) e
 * permitidas para o papel de quem conversa (visitante, usuário ou administrador).
 */
export function enabledOpexTools(disabledTools: readonly string[], role: OpexRole, scope?: OpexServerScope): OpexTool[] {
    const disabled = new Set(disabledTools)
    return OPEX_TOOLS.filter((tool) => (isAlwaysOnGroup(tool.group) || !disabled.has(tool.name)) && (scope ? toolPermittedFor(tool, scope) : toolAllowedFor(tool, role)))
}

/** Pede Confirmar/Cancelar? Ajuste da ferramenta; sem ajuste, as destrutivas e as `confirmByDefault`. */
export function needsConfirmation(tool: OpexTool, overrides: Readonly<Record<string, boolean>> = {}): boolean {
    return toolConfirms(tool, overrides)
}
