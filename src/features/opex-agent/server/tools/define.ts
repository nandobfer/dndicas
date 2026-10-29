import type { ZodType } from "zod"
import { DomainError } from "@/lib/api/route"
import type { OpexToolGroup } from "../../constants"
import type { OpexServerScope } from "../scope"

/**
 * Ferramenta do Agente Opex: descreve para o modelo o que faz, valida a entrada com Zod e chama a
 * função de serviço real do app (nunca HTTP) — herdando validação, auditoria e tempo real.
 */

/** `read` nunca pede confirmação; `write` pede na política "Toda alteração"; `destructive`, sempre. */
export type OpexToolRisk = "read" | "write" | "destructive"

export interface OpexToolContext {
    sessionId: string
    actorId: string
    signal?: AbortSignal
    /** Escopo do turno (usuário revalidado ou visitante); as ferramentas que dependem do usuário leem daqui. */
    scope: OpexServerScope
}

export interface OpexToolDef<I = unknown> {
    name: string
    group: OpexToolGroup
    /** Rótulo curto em pt-BR exibido no card da ferramenta. */
    label: string
    description: string
    risk: OpexToolRisk
    /** Pede confirmação por padrão mesmo sem ser destrutiva (ajustável na configuração). */
    confirmByDefault?: boolean
    /**
     * Papel mínimo para a ferramenta entrar no turno (e ser executada — conferido de novo antes de
     * cada chamada). Ausente: vale o do grupo (`OPEX_GROUP_MIN_ROLE`); sem nenhum, inclusive visitantes.
     */
    minRole?: "user" | "admin"
    input: ZodType<I>
    /** Frase do card de confirmação ("Excluir o apontamento de 2 h da GO-DEV-12"). */
    // Sintaxe de método: permite guardar ferramentas de entradas diferentes numa lista `OpexTool`.
    summarize?(input: I): string
    /** Entrada sem segredos para exibir e guardar no histórico (padrão: a própria entrada). */
    redact?(input: I): unknown
    execute(input: I, context: OpexToolContext): Promise<unknown>
}

export type OpexTool = OpexToolDef<unknown>

export function defineTool<I>(def: OpexToolDef<I>): OpexToolDef<I> {
    return def
}

/** Erro devolvido ao modelo (mensagem acionável, sem stack). */
export class OpexToolError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "OpexToolError"
    }
}

export function toolErrorMessage(error: unknown): string {
    if (error instanceof DomainError) {
        const details = error.details !== undefined ? ` (${JSON.stringify(error.details).slice(0, 500)})` : ""
        return `${error.message}${error.code ? ` [${error.code}]` : ""}${details}`
    }
    if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown }).issues)) {
        const issues = (error as { issues: { path?: unknown[]; message?: string }[] }).issues
        return `Entrada inválida: ${issues.map((issue) => `${(issue.path ?? []).join(".") || "(raiz)"}: ${issue.message}`).join("; ")}`
    }
    if (error instanceof Error) return error.message || "Falha desconhecida"
    return String(error)
}
