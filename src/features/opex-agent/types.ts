import type { AiFeatureAvailability } from "@/features/ai/types"
import type { OpexAgentSettings, OpexFilesSettings } from "./schemas"
import type { OpexToolGroup } from "./constants"
import type { OpexOwnerKey } from "@/lib/pusher/channel-names"
import type { OpexRole } from "./scope"
import type { OpexFileKind } from "./files"
import type { OpexToolMetaDto } from "./tool-tree"

/** Arquivo enviado no chat (o binário fica no Storage S3). */
export interface OpexFileDto {
    id: string
    name: string
    mediaType: string
    size: number
    kind: OpexFileKind
    /** Rota do conteúdo (sem `basePath`). */
    url: string
}

/** Reserva do envio: onde e como o navegador faz o PUT direto no storage. */
export interface OpexFileReservationDto {
    id: string
    method: "PUT"
    /** URL assinada (absoluta) do storage. */
    url: string
    /** Cabeçalhos obrigatórios do PUT (o `Content-Type` entra na assinatura). */
    headers: Record<string, string>
    expiresIn: number
}

export interface OpexAgentSettingsDto {
    settings: OpexAgentSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
    /** Ferramentas do dono (metadados para a árvore de seleção e confirmação). */
    tools: OpexToolMetaDto[]
}

/**
 * Situação do Agente Opex para quem está vendo (`GET /api/opex/status`, público): disponibilidade,
 * papel, dono das sessões (canal do Pusher e abas) e limites dos arquivos.
 */
export interface OpexStatusDto {
    available: boolean
    reason: string | null
    role: OpexRole
    /** Dono das sessões: `u-{userId}` (logado) ou `a-{anonymousId}` (visitante). */
    ownerKey: OpexOwnerKey
    /** Provedor · modelo configurado (sem segredos). */
    modelLabel: string | null
    files: OpexFilesSettings
}

export type OpexSessionStatus = "idle" | "running" | "awaiting_confirmation" | "error"

export interface OpexSessionDto {
    id: string
    title: string
    summary: string
    titleSource: "auto" | "manual"
    status: OpexSessionStatus
    lastError: string | null
    archived: boolean
    messageCount: number
    lastMessageAt: string
    createdAt: string
}

export type OpexConfirmationStatus = "pending" | "confirmed" | "cancelled" | "failed" | "expired"

export interface OpexConfirmationDto {
    actionId: string
    summary: string
    status: OpexConfirmationStatus
    /** Mensagem de erro quando a execução confirmada falhou. */
    error: string | null
}

export type OpexToolState = "running" | "done" | "error"

export interface OpexToolPart {
    type: "tool"
    id: string
    name: string
    group: OpexToolGroup | null
    label: string
    state: OpexToolState
    /** Entrada e saída resumidas (JSON) para exibição. */
    input: string | null
    output: string | null
    error: string | null
    confirmation: OpexConfirmationDto | null
    durationMs: number | null
}

/** Parte exibida de uma resposta do agente. */
export type OpexPart = { type: "text"; text: string } | { type: "reasoning"; text: string } | OpexToolPart

export interface OpexUsageDto {
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
}

export type OpexMessageStatus = "complete" | "interrupted" | "error"

export interface OpexMessageDto {
    id: string
    role: "user" | "assistant"
    /** `confirmation`: decisão do usuário sobre uma ação pendente (exibida como nota); `job`: prompt de um job agendado. */
    kind: "message" | "confirmation" | "job"
    /** Job que disparou a mensagem (`kind: "job"`). */
    job: { id: string; title: string } | null
    text: string
    /** Arquivos enviados com a mensagem do usuário. */
    files: OpexFileDto[]
    parts: OpexPart[]
    status: OpexMessageStatus
    error: string | null
    usage: OpexUsageDto | null
    durationMs: number | null
    model: string | null
    createdAt: string
}

export interface OpexSessionDetailDto {
    session: OpexSessionDto
    messages: OpexMessageDto[]
}

/** Resposta em andamento (mantida em memória no servidor e reconstruída no cliente). */
export interface OpexLiveMessage {
    id: string
    parts: OpexPart[]
    startedAt: string
    /** Raciocinando agora (sem texto novo desde o último pedaço de raciocínio). */
    thinking: boolean
}

/** Linha do stream NDJSON `GET /api/opex/sessions/[id]/stream`. */
export type OpexStreamLine =
    | { type: "snapshot"; status: OpexSessionStatus; live: OpexLiveMessage | null }
    | { type: "turn-start"; messageId: string; startedAt: string }
    | { type: "text-delta"; text: string }
    | { type: "reasoning-delta"; text: string }
    | { type: "tool-start"; id: string; name: string; group: OpexToolGroup | null; label: string }
    | { type: "tool-input"; id: string; input: string | null }
    | { type: "tool-end"; id: string; state: "done" | "error"; output: string | null; error: string | null; confirmation: OpexConfirmationDto | null; durationMs: number | null }
    | { type: "turn-end"; messageId: string; status: OpexMessageStatus; error: string | null }
    | { type: "ping" }
