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

// ── Migração das listas (aba Migração) ──────────────────────────────────────

export type CuratorDecisionKey = "migrar" | "migrar_reescrevendo" | "descartar" | "revisar_dono"

export interface MigrationStepDto {
    status: "idle" | "running" | "failed" | "done"
    error: string | null
    startedAt: string | null
    finishedAt: string | null
    progress: { done: number; total: number } | null
}

export interface MigrationDecisionDto {
    decisao: CuratorDecisionKey
    motivo: string
    textoProposto: string | null
    categoriaProposta: string | null
    /** Categoria nova sugerida pelo curador (criada na importação). */
    novaCategoria: { key: string; label: string } | null
    canalDestino: string
    duplicataDe: string | null
    confianca: number | null
}

export interface MigrationItemDto {
    id: string
    list: string
    listTitle: string
    texto: string
    resumo: string
    channel: string | null
    criadaEm: string
    decision: MigrationDecisionDto | null
    review: { status: "pendente" | "aprovada" | "rejeitada"; texto: string | null; categoria: string | null }
    /** Texto e categoria que serão importados (edição do admin > proposta > original). */
    final: { texto: string; categoria: string | null }
    /** Pede ação explícita (`descartar`/`revisar_dono`). */
    needsAttention: boolean
    imported: { engramindId: string; at: string; duplicate: boolean } | null
}

export interface MigrationReportDto {
    byDecision: Record<CuratorDecisionKey, number>
    byList: { list: string; title: string; total: number; counts: Record<CuratorDecisionKey, number> }[]
}

export interface MigrationImportReportDto {
    list: string
    title: string
    source: number
    approved: number
    imported: number
    duplicates: number
}

export interface MemoryMigrationDto {
    legacyCount: number
    backup: { id: string; createdAt: string; count: number; sha256: string } | null
    steps: { backup: MigrationStepDto; triage: MigrationStepDto; compact: MigrationStepDto; import: MigrationStepDto; history: MigrationStepDto }
    curator: { provider: string; model: string; variant: string | null; ranAt: string } | null
    items: MigrationItemDto[]
    report: MigrationReportDto | null
    importReport: MigrationImportReportDto[]
    budget: { key: string; label: string; tokens: number; budget: number; over: boolean; memories: number }[]
    campaigns: CampaignHistoryCountDto[]
    categoryNotices: string[]
    /** Categorias e limite de texto do Engramind (vazio/padrão quando ele não responde). */
    categories: { key: string; label: string }[]
    textMax: number
    firstCompletedAt: string | null
    lastImportAt: string | null
}
