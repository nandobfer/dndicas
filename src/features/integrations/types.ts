import type { IntegrationEnvironment, IntegrationId, PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationLogLevel, IntegrationLogLine } from "@/lib/integrations/log-format"

/** `warn`: acessível com restrição (ex.: fonte em manutenção programada) — não é defeito. */
export type IntegrationHealthStatus = "ok" | "warn" | "error" | "unknown"

export interface IntegrationHealthDto {
    status: IntegrationHealthStatus
    latencyMs?: number
    message?: string
    checkedAt?: string
    source?: "manual" | "scheduler"
    /** Um teste está em andamento agora (em qualquer instância). */
    checking?: boolean
}

/** Evento `status-updated` do Pusher. No início traz só `checking: true`. */
export interface IntegrationStatusEvent {
    id: IntegrationId
    checking: boolean
    health?: IntegrationHealthDto
}

export interface IntegrationListItemDto {
    id: IntegrationId
    name: string
    description: string
    environment: IntegrationEnvironment
    debugMode: boolean
    health: IntegrationHealthDto
    /** Integração-filha (ex.: provedor de IA): fora da lista principal, dentro da página da mãe. */
    parent?: IntegrationId
    /** Campos obrigatórios preenchidos (não garante que a conexão funcione). */
    configured: boolean
}

export type SecretSource = "db" | "env" | "none"

export interface IntegrationSecretStateDto {
    configured: boolean
    source: SecretSource
    /** Existe no banco mas não pôde ser descriptografado (chave trocada?). */
    unreadable: boolean
}

export interface CronJobStateDto {
    jobId: string
    nextRunAt?: string
    lastRunAt?: string
    lastFinishedAt?: string
    lastStatus?: "ok" | "error" | null
    lastError?: string | null
    lastDurationMs?: number | null
    running: boolean
}

export interface IntegrationDetailDto {
    id: IntegrationId
    name: string
    description: string
    environment: IntegrationEnvironment
    debugMode: boolean
    publicValues: Record<string, PublicFieldValue | null>
    secrets: Record<string, IntegrationSecretStateDto>
    encryptionKeyConfigured: boolean
    stored: boolean
    updatedAt?: string
    updatedBy?: string
    health: IntegrationHealthDto
    /** Documentação Swagger (OpenAPI 3.x) cadastrada. */
    swaggerUrl: string | null
    /** Documentação servida pelo próprio app: URL automática e travada. */
    swaggerUrlManaged?: boolean
    /** Resumo da autenticação que o explorador injeta; `null` = sem adaptador. */
    explorerAuth: string | null
    cronStates?: CronJobStateDto[]
}

/** Linha do stream NDJSON de `POST /api/integrations/[id]/test`. */
export type IntegrationTestEvent =
    | { type: "log"; level: IntegrationLogLevel; message: string; ts: string }
    | { type: "result"; ok: boolean; latencyMs: number; message: string; ts: string }

export type { IntegrationLogLine }
