/** DTOs da integração Engramind (tela e rotas). Nunca carregam segredos nem textos de memória do jogo. */

export interface BootstrapStepDto {
    id: string
    label: string
    status: "ok" | "skipped" | "warn" | "error" | "pending"
    message: string
    at: string
}

export interface BootstrapDto {
    ok: boolean
    ranAt: string
    steps: BootstrapStepDto[]
}

export interface EngramindConnectionDto {
    configured: boolean
    webhookUrl: string | null
    bootstrap: BootstrapDto | null
    agentTokens: Record<string, boolean>
    webhookSecretConfigured: boolean
    categoryWarnings: string[]
    memoryContext: { unavailable: boolean; since: string | null; lastOkAt: string | null; reason: string | null }
}

export interface CampaignSyncDto {
    configured: boolean
    lastRunAt: string | null
    lastOkAt: string | null
    lastError: string | null
    lastResult: { pushed: number; pulled: number; removed: number; failed: number; channels: number } | null
    pending: number
    failures: { id: string; campaignId: string; title: string; error: string | null }[]
    redator: { supported: boolean | null; checkedAt: string | null; message: string | null }
    categoryWarnings: string[]
    running: boolean
}

export interface CampaignHistoryCountDto {
    campaignId: string
    name: string
    source: number
    mirrored: number
}
