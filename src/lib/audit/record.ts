import { logAction } from "@/core/database/audit-log"
import { loggerFor } from "@/lib/logger"

export type AcaoAuditoriaTipo =
    | "LOGIN"
    | "LOGOUT"
    | "CRIAR"
    | "ATUALIZAR"
    | "EXCLUIR"
    | "MOVER"
    | "ATRIBUIR"
    | "APROVAR"
    | "DEVOLVER"
    | "ABORTAR"
    | "IMPORTAR"
    | "OPT_OUT"
    | "EXECUTAR"

export interface RecordAuditInput {
    userId: string
    entidade: string
    entidadeId: string
    acao: AcaoAuditoriaTipo
    antes?: Record<string, unknown>
    depois?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
}

/**
 * Registra um evento de auditoria na trilha do DnDicas (`AuditLog` do core, via `logAction`).
 * Nunca lança: falha de auditoria é logada com Pino e não derruba a operação já persistida.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
    try {
        await logAction(input.acao, input.entidade, input.entidadeId, input.userId, {
            ...(input.antes !== undefined ? { antes: input.antes } : {}),
            ...(input.depois !== undefined ? { depois: input.depois } : {}),
            ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
            ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        })
    } catch (error) {
        loggerFor({ userId: input.userId }).error(
            { err: error, entidade: input.entidade, entidadeId: input.entidadeId, acao: input.acao },
            "Falha ao gravar auditoria",
        )
    }
}

/** Ações de auditoria como objeto (compatível com o código copiado do Opex). */
export const AcaoAuditoria = {
    LOGIN: "LOGIN",
    LOGOUT: "LOGOUT",
    CRIAR: "CRIAR",
    ATUALIZAR: "ATUALIZAR",
    EXCLUIR: "EXCLUIR",
    MOVER: "MOVER",
    ATRIBUIR: "ATRIBUIR",
    APROVAR: "APROVAR",
    DEVOLVER: "DEVOLVER",
    ABORTAR: "ABORTAR",
    IMPORTAR: "IMPORTAR",
    OPT_OUT: "OPT_OUT",
    EXECUTAR: "EXECUTAR",
} as const satisfies Record<string, AcaoAuditoriaTipo>
