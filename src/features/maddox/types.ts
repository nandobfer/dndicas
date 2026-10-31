import type { AiFeatureAvailability } from "@/features/ai/types"
import type { MaddoxScriptKind, MaddoxScriptTopic, MaddoxSessionPurpose, MaddoxSessionStatus } from "./constants"
import type { MaddoxSettings } from "./schemas"

/** Versão de um roteiro de entrevista (a 0 é o padrão do código, enquanto nada foi gravado). */
export interface MaddoxScriptVersionDto {
    kind: MaddoxScriptKind
    version: number
    notes: string
    createdBy: string | null
    createdByName: string | null
    createdAt: string | null
    guide: string
    topics: MaddoxScriptTopic[]
}

export type MaddoxScriptHistoryItemDto = Omit<MaddoxScriptVersionDto, "guide" | "topics">

export interface MaddoxScriptStateDto {
    current: MaddoxScriptVersionDto
    history: MaddoxScriptHistoryItemDto[]
}

export interface MaddoxSettingsDto {
    settings: MaddoxSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
    scripts: Record<MaddoxScriptKind, MaddoxScriptStateDto>
}

export interface MaddoxGeneratedAvatarDto {
    url: string
}

/** MCP do Maddox no servidor OpenCode (Maddox 4): ferramentas do narrador quando o provedor é o OpenCode. */
export interface MaddoxMcpStatusDto {
    /** URL chamada pelo OpenCode (`null` = sem URL pública do app nem URL configurada). */
    url: string | null
    /** URL com que o OpenCode tem o MCP registrado (`null` = o OpenCode não informa). */
    registeredUrl: string | null
    server: string
    /** `missing` = não registrado; `outdated` = registrado com outra URL; `unknown` = não deu para consultar o OpenCode. */
    status: "connected" | "pending" | "disabled" | "failed" | "needs_auth" | "missing" | "outdated" | "unknown"
    error: string | null
}

/** Sessão do OpenCode mantida pelo Maddox (painel da aba). */
export interface MaddoxOpencodeSessionDto {
    id: string
    campaignId: string
    campaignName: string | null
    purpose: MaddoxSessionPurpose
    memberId: string | null
    sessionId: string
    directory: string | null
    status: MaddoxSessionStatus
    lastError: string | null
    lastUsedAt: string | null
    createdAt: string
}
