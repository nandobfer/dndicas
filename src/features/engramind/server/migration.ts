import { createHash } from "node:crypto"
import mongoose from "mongoose"
import { AI_AGENTS, isAiAgentId } from "@/features/ai/agents"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import type { AiProviderId } from "@/lib/ai/providers"
import { FIXED_CHANNELS, type MemoryIdentity } from "../constants"
import {
    CURATOR_CHUNK,
    CURATOR_CONSUMPTION_ORIGIN,
    CURATOR_DECISIONS,
    CURATOR_TIMEOUT_MS,
    applyCuratorRules,
    budgetCombinations,
    buildCompactInstructions,
    buildCuratorInstructions,
    buildCuratorPrompt,
    channelOfSource,
    estimateBudgets,
    parseCuratorAnswer,
    type CuratorDecision,
    type CuratorSourceItem,
} from "../memory-curator"
import type { CuratorRunInput, MigrationBulkInput, MigrationItemPatch } from "../schemas/migration"
import type { MemoryMigrationDto, MigrationImportReportDto, MigrationItemDto, MigrationStepDto } from "../types"
import { createCategory, invalidateCategoryCache } from "./categories"
import { engramindAgentClient, engramindAppClient } from "./client"
import { LEGACY_MEMORIES_COLLECTION, MIGRATION_ID, MemoryBackup, MemoryMigration, type IMemoryMigration, type IMigrationItem, type IMigrationStep, type MigrationStepKey } from "./migration-models"
import { ENGRAMIND_STATE_ID, EngramindState } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf, publishEngramind } from "./shared"

/**
 * Migração das 7 listas de `agent_memories` para o Engramind (aba "Migração", DND-21; portada do Opex):
 * 1. **Backup**: lê toda a `agent_memories` (sem alterar nada) e guarda o JSON com SHA-256.
 * 2. **Curador**: classifica 100% das memórias (provedor e modelo de texto escolhidos), uma chamada por
 *    lista (em blocos de 80), com tempo máximo de 8 min; as regras do dndicas vão por cima.
 * 3. **Orçamento**: ~4 caracteres por token por combinação de turno contra `context.budget_tokens`.
 * 4. **Revisão**: aprovar, rejeitar ou editar (uma a uma ou em lote por lista).
 * 5. **Importação**: só as aprovadas, no canal da lista, em lotes de `limits.max_batch`, com chave de
 *    idempotência (repetir não duplica; uma falha retoma do que faltou). As categorias novas propostas
 *    pelo curador são criadas antes.
 * As etapas longas rodam no servidor com o estado persistido; uma etapa "em andamento" de antes de um
 * reinício vira falha ("Interrompida pelo reinício do dndicas").
 */

const PROCESS_STARTED_AT = new Date()
const IDLE_STEP: IMigrationStep = { status: "idle", error: null, startedAt: null, finishedAt: null, progress: null }
const STEP_KEYS: MigrationStepKey[] = ["backup", "triage", "compact", "import", "history"]
const idleSteps = (): IMemoryMigration["steps"] => ({ backup: IDLE_STEP, triage: IDLE_STEP, compact: IDLE_STEP, import: IDLE_STEP, history: IDLE_STEP })

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null)

/** Chave de idempotência de um lote (mesmo canal + mesmas memórias → mesma chave). */
export const importIdempotencyKey = (input: { channel: string; memories: unknown[] }) => `dndicas-import-${sha256(JSON.stringify(input)).slice(0, 48)}`

async function publish(): Promise<void> {
    await publishEngramind({ type: "migration.updated" })
}

const running = new Set<MigrationStepKey>()

async function loadState(): Promise<IMemoryMigration> {
    await dbConnect()
    const fresh: IMemoryMigration = { _id: MIGRATION_ID, backupId: null, steps: idleSteps(), curator: null, items: [], categoryNotices: [], firstCompletedAt: null, lastImportAt: null }
    let state = (await MemoryMigration.findById(MIGRATION_ID).lean<IMemoryMigration>()) ?? null
    if (!state) {
        const { _id, ...insert } = fresh
        await MemoryMigration.updateOne({ _id }, { $setOnInsert: insert }, { upsert: true })
        state = (await MemoryMigration.findById(MIGRATION_ID).lean<IMemoryMigration>()) ?? fresh
    }
    const steps = { ...idleSteps(), ...(state.steps ?? {}) }
    const orphan = STEP_KEYS.filter((key) => steps[key].status === "running" && steps[key].startedAt && new Date(steps[key].startedAt!) < PROCESS_STARTED_AT && !running.has(key))
    if (orphan.length) {
        const set = Object.fromEntries(orphan.map((key) => [`steps.${key}`, { ...steps[key], status: "failed", error: "Interrompida pelo reinício do dndicas: tente novamente", finishedAt: new Date() }]))
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: set })
        engramindLog.warn({ steps: orphan }, "[engramind] etapas da migração de memórias interrompidas pelo reinício")
        return loadState()
    }
    return { ...fresh, ...state, items: state.items ?? [], categoryNotices: state.categoryNotices ?? [], steps }
}

async function setStep(key: MigrationStepKey, step: Partial<IMigrationStep>): Promise<void> {
    const state = await loadState()
    await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { [`steps.${key}`]: { ...state.steps[key], ...step } } })
    await publish()
}

/** Roda uma etapa em segundo plano (uma por vez por etapa; a requisição responde na hora). */
function runInBackground(key: MigrationStepKey, work: () => Promise<void>): Promise<void> {
    running.add(key)
    const job = (async () => {
        try {
            await setStep(key, { status: "running", error: null, startedAt: new Date(), finishedAt: null, progress: null })
            await work()
            await setStep(key, { status: "done", finishedAt: new Date() })
        } catch (error) {
            engramindLog.warn({ step: key, err: messageOf(error) }, "[engramind] etapa da migração de memórias falhou")
            await setStep(key, { status: "failed", error: messageOf(error), finishedAt: new Date() }).catch(() => undefined)
        } finally {
            running.delete(key)
        }
    })()
    jobs.add(job)
    void job.finally(() => jobs.delete(job))
    return job
}

const jobs = new Set<Promise<void>>()

/** Testes: espera as etapas em segundo plano. */
export async function waitMigrationIdle(): Promise<void> {
    while (jobs.size) await Promise.all([...jobs])
}

function assertIdle(state: IMemoryMigration, keys: MigrationStepKey[]): void {
    const busy = keys.find((key) => state.steps[key].status === "running" || running.has(key))
    if (busy) throw new DomainError(409, "Uma etapa da migração ainda está em andamento: aguarde", "MIGRATION_BUSY")
}

async function legacyCollection() {
    await dbConnect()
    const db = mongoose.connection.db
    if (!db) throw new DomainError(503, "Banco indisponível", "DB_UNAVAILABLE")
    return db.collection(LEGACY_MEMORIES_COLLECTION)
}

export async function legacyMemoryCount(): Promise<number> {
    return (await legacyCollection()).countDocuments({})
}

// ── Configuração do Engramind usada pela migração ───────────────────────────

interface MigrationSettings {
    textMin: number
    textMax: number
    maxBatch: number
    budgetTokens: number
    categories: { key: string; label: string }[]
    channelTextMax: Map<string, number>
}

async function migrationSettings(): Promise<MigrationSettings> {
    const client = await engramindAppClient()
    if (!client) throw new DomainError(409, "Configure a integração Engramind antes de migrar", "ENGRAMIND_NOT_CONFIGURED")
    const [consumer, { categories }] = await Promise.all([client.consumerSettings(), client.categories.list()])
    return {
        textMin: consumer.memory.text_min,
        textMax: consumer.memory.text_max,
        maxBatch: Math.max(1, consumer.limits.max_batch),
        budgetTokens: consumer.context.budget_tokens,
        categories: categories.map((item) => ({ key: item.key, label: item.label })),
        channelTextMax: new Map((consumer.channels ?? []).map((item) => [item.channel, item.memory_text_max])),
    }
}

const textMaxOf = (settings: MigrationSettings, channel: string | null) => (channel ? (settings.channelTextMax.get(channel) ?? settings.textMax) : settings.textMax)

// ── Etapa 1: backup ─────────────────────────────────────────────────────────

interface LegacyMemory {
    _id: unknown
    agentId?: string
    texto?: string
    resumo?: string
    createdBy?: string
    updatedBy?: string
    createdAt?: Date
    updatedAt?: Date
}

export async function generateBackup(actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["backup", "triage", "compact", "import"])
    const rows = (await (await legacyCollection()).find({}).sort({ createdAt: 1, _id: 1 }).toArray()) as unknown as LegacyMemory[]
    const memories = rows.map((row) => ({
        id: String(row._id),
        lista: row.agentId ?? "",
        texto: row.texto ?? "",
        resumo: row.resumo ?? "",
        autor: row.createdBy ?? null,
        atualizadoPor: row.updatedBy ?? null,
        criadaEm: iso(row.createdAt),
        atualizadaEm: iso(row.updatedAt),
    }))
    const content = JSON.stringify(memories)
    const hash = sha256(content)
    const backupId = new mongoose.Types.ObjectId().toString()
    const createdAt = new Date()
    await MemoryBackup.create({ _id: backupId, createdAt, count: memories.length, sha256: hash, json: content })
    const previous = new Map(state.items.map((item) => [item.sourceId, item]))
    const items: IMigrationItem[] = rows.map((row) => {
        const before = previous.get(String(row._id))
        const texto = row.texto ?? ""
        const list = row.agentId ?? ""
        const unchanged = before && before.texto === texto
        return {
            sourceId: String(row._id),
            list,
            texto,
            resumo: row.resumo ?? "",
            createdBy: row.createdBy ?? "system",
            createdAt: row.createdAt ?? createdAt,
            updatedAt: row.updatedAt ?? createdAt,
            channel: channelOfSource({ list }),
            // Rodar de novo preserva o que já foi decidido, revisado e importado (texto igual).
            decision: unchanged ? before.decision : null,
            review: unchanged ? before.review : { status: "pendente", texto: null, categoria: null, at: null },
            imported: unchanged ? before.imported : null,
        }
    })
    await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { backupId, items, "steps.backup": { status: "done", error: null, startedAt: createdAt, finishedAt: new Date(), progress: { done: items.length, total: items.length } } } })
    await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "backup", memorias: memories.length, sha256: hash })
    engramindLog.info({ count: memories.length, sha256: hash }, "[engramind] backup das memórias dos agentes gerado")
    await publish()
    return getMigration()
}

/** Snapshot baixável: o backup original (com o hash) e o id do Engramind de cada memória importada. */
export async function downloadBackup(): Promise<{ filename: string; body: string }> {
    const state = await loadState()
    if (!state.backupId) throw new DomainError(404, "Gere o backup antes", "MIGRATION_NO_BACKUP")
    const backup = await MemoryBackup.findById(state.backupId).lean()
    if (!backup) throw new DomainError(404, "Backup não encontrado", "MIGRATION_NO_BACKUP")
    const imported = Object.fromEntries(state.items.filter((item) => item.imported).map((item) => [item.sourceId, item.imported!.engramindId]))
    const memories = (JSON.parse(backup.json) as { id: string }[]).map((memory) => ({ ...memory, engramindId: imported[memory.id] ?? null }))
    const body = JSON.stringify({ geradoEm: backup.createdAt, colecao: LEGACY_MEMORIES_COLLECTION, total: backup.count, sha256: backup.sha256, observacao: "sha256 do conteúdo original (sem o engramindId)", memorias: memories }, null, 2)
    return { filename: `dndicas-memorias-backup-${new Date(backup.createdAt).toISOString().slice(0, 10)}.json`, body }
}

// ── Etapa 2: curador ────────────────────────────────────────────────────────

const sourceOf = (item: IMigrationItem): CuratorSourceItem => ({ id: item.sourceId, list: item.list, texto: item.texto, resumo: item.resumo, createdAt: new Date(item.createdAt).toISOString() })

async function askCurator(input: CuratorRunInput, instructions: string, prompt: string, subject: string, timeoutMs: number): Promise<string> {
    const { streamAi } = await import("@/lib/ai/stream")
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`O curador não respondeu em ${Math.max(1, Math.round(timeoutMs / 60_000))} min: tente novamente ou escolha outro modelo`))
        }, timeoutMs)
    })
    const read = async () => {
        let text = ""
        for await (const event of streamAi({
            provider: input.provider as AiProviderId,
            model: input.model,
            variant: input.variant ?? null,
            agent: input.agent ?? null,
            instructions,
            prompt,
            title: `Curador de memórias · ${subject}`,
            signal: controller.signal,
            consumption: { origin: CURATOR_CONSUMPTION_ORIGIN, subject },
        })) {
            if (event.type === "delta") text += event.text
            if (event.type === "error") throw new Error(event.message)
        }
        return text
    }
    try {
        return await Promise.race([read(), timeout])
    } finally {
        clearTimeout(timer)
    }
}

let curatorTimeoutMs = CURATOR_TIMEOUT_MS
/** Testes: tempo máximo do curador (padrão `CURATOR_TIMEOUT_MS`). */
export function setCuratorTimeoutForTests(ms: number | null): void {
    curatorTimeoutMs = ms ?? CURATOR_TIMEOUT_MS
}

export async function runCurator(input: CuratorRunInput, actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    if (!state.backupId) throw new DomainError(409, "Gere o backup antes de rodar o curador", "MIGRATION_NO_BACKUP")
    assertIdle(state, ["backup", "triage", "compact", "import"])
    const settings = await migrationSettings()
    void runInBackground("triage", async () => {
        const current = await loadState()
        const pending = current.items.filter((item) => !item.imported)
        const groups = new Map<string, IMigrationItem[]>()
        for (const item of pending) groups.set(item.list, [...(groups.get(item.list) ?? []), item])
        const instructions = buildCuratorInstructions(settings.categories, settings.textMax)
        const decisions = new Map<string, NonNullable<IMigrationItem["decision"]>>()
        const decided = new Set(pending.filter((item) => item.decision).map((item) => item.sourceId))
        let done = 0
        let chunks = 0
        let failed = 0
        let lastError = ""
        for (const items of groups.values()) {
            const sources = items.map(sourceOf)
            const summaries = sources.map((item) => ({ id: item.id, resumo: item.resumo || item.texto.slice(0, 120), createdAt: item.createdAt }))
            const channel = channelOfSource(sources[0]!) ?? sources[0]!.list
            const rules = { categories: settings.categories, textMax: textMaxOf(settings, channel) }
            for (let start = 0; start < sources.length; start += CURATOR_CHUNK) {
                const chunk = sources.slice(start, start + CURATOR_CHUNK)
                chunks++
                try {
                    const answers = parseCuratorAnswer(await askCurator(input, instructions, buildCuratorPrompt(chunk[0]!.list, chunk, summaries, channel), chunk[0]!.list, curatorTimeoutMs))
                    for (const [id, decision] of applyCuratorRules(chunk, answers, rules)) decisions.set(id, decision)
                } catch (error) {
                    // Bloco que falha: a decisão e a revisão anteriores ficam; a memória ainda sem decisão vai
                    // para a revisão com o erro real no motivo.
                    failed++
                    lastError = messageOf(error)
                    engramindLog.warn({ list: chunk[0]!.list, err: lastError }, "[engramind] curador falhou num bloco: decisões anteriores preservadas")
                    for (const [id, decision] of applyCuratorRules(chunk, [], rules)) {
                        if (!decided.has(id)) decisions.set(id, { ...decision, motivo: `Curador indisponível: ${lastError}` })
                    }
                }
                done += chunk.length
                await setStep("triage", { progress: { done, total: pending.length } })
            }
        }
        if (chunks > 0 && failed === chunks) throw new Error(`O curador não classificou nenhuma memória: ${lastError}`)
        const latest = await loadState()
        const items = latest.items.map((item) => {
            const decision = decisions.get(item.sourceId)
            if (!decision || item.imported) return item
            return { ...item, decision, review: { status: "pendente" as const, texto: null, categoria: null, at: null } }
        })
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { items, curator: { provider: input.provider, model: input.model, variant: input.variant ?? null, agent: input.agent ?? null, ranAt: new Date() } } })
        const counts = Object.fromEntries(CURATOR_DECISIONS.map((key) => [key, [...decisions.values()].filter((item) => item.decisao === key).length]))
        await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "curador", provedor: input.provider, modelo: input.model, memorias: decisions.size, blocosComFalha: failed, ...counts })
    })
    return getMigration()
}

/** Segunda passada do curador numa combinação que estoura o orçamento (reescritas curtas e fusões). */
export async function compactCombination(combinationKey: string, actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["triage", "compact", "import"])
    if (!state.curator) throw new DomainError(409, "Rode o curador antes de compactar", "MIGRATION_NO_TRIAGE")
    const budgets = await budgetOf(state)
    const combo = budgets.find((item) => item.key === combinationKey)
    if (!combo) throw new DomainError(404, "Combinação não encontrada", "MIGRATION_COMBINATION_NOT_FOUND")
    const curator: CuratorRunInput = { provider: state.curator.provider as CuratorRunInput["provider"], model: state.curator.model, variant: state.curator.variant, agent: state.curator.agent }
    const settings = await migrationSettings()
    void runInBackground("compact", async () => {
        const current = await loadState()
        const items = current.items.filter((item) => !item.imported && item.channel && combo.channels.includes(item.channel) && included(item))
        const sources = items.map((item) => ({ ...sourceOf(item), texto: finalOf(item).texto }))
        const answers = parseCuratorAnswer(await askCurator(curator, buildCompactInstructions(combo.budget), buildCuratorPrompt("compactacao", sources, [], combo.channels.join(", ")), `compactar ${combo.key}`, curatorTimeoutMs))
        const decisions = applyCuratorRules(sources, answers, { categories: settings.categories, textMax: settings.textMax })
        const latest = await loadState()
        const next = latest.items.map((item) => {
            const decision = decisions.get(item.sourceId)
            if (!decision || item.imported) return item
            return { ...item, decision, review: { status: "pendente" as const, texto: null, categoria: null, at: null } }
        })
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { items: next } })
        await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "compactar", combinacao: combo.key, memorias: decisions.size })
    })
    return getMigration()
}

// ── Etapa 4: revisão ────────────────────────────────────────────────────────

const needsAttention = (item: IMigrationItem) => item.decision?.decisao === "descartar" || item.decision?.decisao === "revisar_dono"

function finalOf(item: IMigrationItem): { texto: string; categoria: string | null } {
    const proposed = item.decision?.decisao === "migrar_reescrevendo" || (item.decision?.decisao === "revisar_dono" && item.decision.textoProposto) ? item.decision?.textoProposto : null
    return { texto: item.review.texto ?? proposed ?? item.texto, categoria: item.review.categoria ?? item.decision?.categoriaProposta ?? null }
}

/** Entra na estimativa: aprovada, ou ainda pendente com proposta de migrar. */
function included(item: IMigrationItem): boolean {
    if (item.review.status === "rejeitada") return false
    if (item.review.status === "aprovada") return true
    return item.decision?.decisao === "migrar" || item.decision?.decisao === "migrar_reescrevendo"
}

function fitsIn(settings: MigrationSettings, item: IMigrationItem, texto: string): string | null {
    const max = textMaxOf(settings, item.channel)
    if (texto.length > max) return `A memória ${item.sourceId} tem ${texto.length} caracteres: reescreva em até ${max} antes de aprovar`
    if (texto.trim().length < settings.textMin) return `A memória ${item.sourceId} ficou curta demais`
    return null
}

export async function reviewItems(input: MigrationItemPatch, actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["triage", "compact", "import"])
    const settings = input.items.some((item) => item.status === "aprovada") || state.items.some((item) => item.review.status === "aprovada") ? await migrationSettings() : null
    const patches = new Map(input.items.map((item) => [item.id, item]))
    const items: IMigrationItem[] = []
    for (const item of state.items) {
        const patch = patches.get(item.sourceId)
        if (!patch) {
            items.push(item)
            continue
        }
        if (!item.decision) throw new DomainError(409, "Rode o curador antes de revisar", "MIGRATION_NO_TRIAGE")
        const review = { ...item.review, at: new Date() }
        if (patch.texto !== undefined) review.texto = patch.texto?.trim() || null
        if (patch.categoria !== undefined) review.categoria = patch.categoria ?? null
        if (patch.status) review.status = patch.status
        const next = { ...item, review }
        if (review.status === "aprovada" && settings) {
            const problem = fitsIn(settings, next, finalOf(next).texto)
            if (problem) throw new DomainError(400, problem, "MIGRATION_TEXT_OUT_OF_LIMITS")
        }
        items.push(next)
    }
    await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { items } })
    await auditEngramind(actorId, "migracao", AcaoAuditoria.ATUALIZAR, { passo: "revisao", memorias: input.items.map((item) => ({ id: item.id, status: item.status ?? null, editada: item.texto !== undefined })) })
    await publish()
    return getMigration()
}

/**
 * Decisão em lote de uma lista. Sem `includeAttention`, só as que o curador mandou migrar; com ele, também
 * as de revisão. `descartar` nunca é aprovada em lote ("Migrar mesmo assim" é item a item), e aprovar em
 * lote pula a memória cujo texto final não cabe nos limites do canal.
 */
export async function reviewBulk(input: MigrationBulkInput, actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    const settings = input.status === "aprovada" ? await migrationSettings() : null
    const eligible = (item: IMigrationItem) => {
        if (!needsAttention(item)) return true
        if (input.status === "aprovada" && item.decision?.decisao === "descartar") return false
        return Boolean(input.includeAttention)
    }
    const targets = state.items.filter((item) => item.list === input.list && item.decision && !item.imported && eligible(item) && (!settings || !fitsIn(settings, item, finalOf(item).texto)))
    if (!targets.length) return getMigration()
    return reviewItems({ items: targets.map((item) => ({ id: item.sourceId, status: input.status })) }, actorId)
}

// ── Etapa 5: importação ─────────────────────────────────────────────────────

const ownerOfChannel = (channel: string): MemoryIdentity => FIXED_CHANNELS.find((item) => item.slug === channel)?.owner ?? "opex"

/** Cria as categorias novas propostas pelo curador; conflito ou lista cheia caem na padrão (avisado). */
async function ensureProposedCategories(items: readonly IMigrationItem[], settings: MigrationSettings): Promise<{ fallback: Set<string>; notices: string[] }> {
    const known = new Set(settings.categories.map((item) => item.key))
    const proposed = new Map<string, { key: string; label: string; channel: string }>()
    for (const item of items) {
        const nova = item.decision?.novaCategoria
        const final = finalOf(item).categoria
        if (nova && final === nova.key && !known.has(nova.key)) proposed.set(nova.key, { ...nova, channel: item.channel ?? "" })
    }
    const fallback = new Set<string>()
    const notices: string[] = []
    for (const category of proposed.values()) {
        const client = (await engramindAgentClient(ownerOfChannel(category.channel))) ?? (await engramindAppClient())
        if (!client) throw new Error("Engramind indisponível para criar as categorias")
        const outcome = await createCategory(client, { key: category.key, label: category.label, priority: 0 })
        if (outcome.status === "created" || outcome.status === "exists" || outcome.status === "conflict") {
            if (outcome.status === "conflict") notices.push(outcome.message)
            known.add(category.key)
            continue
        }
        fallback.add(category.key)
        notices.push(`${outcome.message} As memórias com ${category.key} vão na categoria padrão.`)
    }
    invalidateCategoryCache()
    // Categoria final desconhecida (nem existente nem criada) também cai na padrão.
    for (const item of items) {
        const final = finalOf(item).categoria
        if (final && !known.has(final)) fallback.add(final)
    }
    return { fallback, notices }
}

export async function importApproved(actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["backup", "triage", "compact", "import"])
    const approved = state.items.filter((item) => item.review.status === "aprovada" && !item.imported)
    if (!approved.length) throw new DomainError(409, "Nenhuma memória aprovada para importar", "MIGRATION_NOTHING_APPROVED")
    const settings = await migrationSettings()
    void runInBackground("import", async () => {
        const client = await engramindAppClient()
        if (!client) throw new Error("Engramind não configurado")
        const { fallback, notices } = await ensureProposedCategories(approved, settings)
        const byChannel = new Map<string, IMigrationItem[]>()
        for (const item of approved) {
            // Sempre o canal da lista de origem (o curador não move memórias de lista).
            if (!item.channel) continue
            byChannel.set(item.channel, [...(byChannel.get(item.channel) ?? []), item])
        }
        let done = 0
        let created = 0
        let duplicates = 0
        const importedAt = new Date()
        for (const [channel, items] of byChannel) {
            for (let start = 0; start < items.length; start += settings.maxBatch) {
                const batch = items.slice(start, start + settings.maxBatch)
                const memories = batch.map((item) => {
                    const final = finalOf(item)
                    const category = final.categoria && !fallback.has(final.categoria) ? final.categoria : null
                    return {
                        text: final.texto,
                        ...(category ? { category } : {}),
                        created_at: new Date(item.createdAt).toISOString(),
                        status: "active" as const,
                        origin: { source: "migracao", label: "Migração do dndicas" },
                    }
                })
                const key = importIdempotencyKey({ channel, memories })
                const result = await client.memories.import({ channel, memories }, key)
                const ids = new Map<number, { id: string; duplicate: boolean }>()
                for (const item of result.created ?? []) ids.set(item.index, { id: item.id, duplicate: false })
                for (const item of result.duplicates ?? []) ids.set(item.index, { id: item.existing_id, duplicate: true })
                created += result.created?.length ?? 0
                duplicates += result.duplicates?.length ?? 0
                const marks = new Map(batch.map((item, index) => [item.sourceId, ids.get(index)]))
                const latest = await loadState()
                const next = latest.items.map((item) => {
                    const mark = marks.get(item.sourceId)
                    return mark ? { ...item, imported: { engramindId: mark.id, key, at: importedAt, duplicate: mark.duplicate } } : item
                })
                await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { items: next } })
                done += batch.length
                await setStep("import", { progress: { done, total: approved.length } })
            }
        }
        const latest = await loadState()
        await MemoryMigration.updateOne({ _id: MIGRATION_ID }, { $set: { lastImportAt: new Date(), categoryNotices: notices, ...(latest.firstCompletedAt ? {} : { firstCompletedAt: new Date() }) } })
        await auditEngramind(actorId, "migracao", AcaoAuditoria.IMPORTAR, { passo: "importacao", aprovadas: approved.length, criadas: created, duplicadas: duplicates, canais: [...byChannel.keys()] })
        engramindLog.info({ created, duplicates }, "[engramind] memórias dos agentes importadas")
    })
    return getMigration()
}

// ── Memórias das campanhas ──────────────────────────────────────────────────

/** Backup + mover para o Engramind + conferir + apagar do banco do dndicas (`campaign-memory-move.ts`). */
export async function moveCampaignHistory(actorId: string): Promise<MemoryMigrationDto> {
    const state = await loadState()
    assertIdle(state, ["history"])
    void runInBackground("history", async () => {
        const { moveCampaignMemories } = await import("./campaign-memory-move")
        await moveCampaignMemories(actorId)
    })
    return getMigration()
}

// ── Leitura ─────────────────────────────────────────────────────────────────

async function budgetOf(state: IMemoryMigration, settings?: MigrationSettings | null) {
    const entries = state.items.filter((item) => item.channel && included(item)).map((item) => ({ channel: item.channel!, text: finalOf(item).texto }))
    const current = settings === undefined ? await migrationSettings().catch(() => null) : settings
    // Sem o Engramind, a estimativa usa o padrão.
    return estimateBudgets(entries, budgetCombinations(), current?.budgetTokens ?? 4000)
}

const stepDto = (step: IMigrationStep): MigrationStepDto => ({ status: step.status, error: step.error, startedAt: iso(step.startedAt), finishedAt: iso(step.finishedAt), progress: step.progress })
const emptyCounts = () => Object.fromEntries(CURATOR_DECISIONS.map((key) => [key, 0])) as Record<CuratorDecision, number>
const titleOf = (list: string) => (isAiAgentId(list) ? AI_AGENTS[list].title : list)

function itemDto(item: IMigrationItem): MigrationItemDto {
    return {
        id: item.sourceId,
        list: item.list,
        listTitle: titleOf(item.list),
        texto: item.texto,
        resumo: item.resumo,
        channel: item.channel,
        criadaEm: new Date(item.createdAt).toISOString(),
        decision: item.decision ? { ...item.decision, novaCategoria: item.decision.novaCategoria ?? null } : null,
        review: { status: item.review.status, texto: item.review.texto, categoria: item.review.categoria },
        final: finalOf(item),
        needsAttention: needsAttention(item),
        imported: item.imported ? { engramindId: item.imported.engramindId, at: new Date(item.imported.at).toISOString(), duplicate: item.imported.duplicate } : null,
    }
}

function importReport(items: readonly IMigrationItem[]): MigrationImportReportDto[] {
    const rows = new Map<string, MigrationImportReportDto>()
    for (const item of items) {
        const row = rows.get(item.list) ?? { list: item.list, title: titleOf(item.list), source: 0, approved: 0, imported: 0, duplicates: 0 }
        row.source++
        if (item.review.status === "aprovada") row.approved++
        if (item.imported && !item.imported.duplicate) row.imported++
        if (item.imported?.duplicate) row.duplicates++
        rows.set(item.list, row)
    }
    return [...rows.values()]
}

export async function getMigration(): Promise<MemoryMigrationDto> {
    const state = await loadState()
    const backup = state.backupId ? await MemoryBackup.findById(state.backupId).select({ json: 0 }).lean() : null
    const triaged = state.items.filter((item) => item.decision)
    const byList = new Map<string, NonNullable<MemoryMigrationDto["report"]>["byList"][number]>()
    const byDecision = emptyCounts()
    for (const item of triaged) {
        byDecision[item.decision!.decisao]++
        const row = byList.get(item.list) ?? { list: item.list, title: titleOf(item.list), total: 0, counts: emptyCounts() }
        row.total++
        row.counts[item.decision!.decisao]++
        byList.set(item.list, row)
    }
    const { campaignMoveRows } = await import("./campaign-memory-move")
    const engramindState = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ campaignBackup: 1 }).lean()
    const campaignBackup = engramindState?.campaignBackup
    const settings = await migrationSettings().catch(() => null)
    return {
        legacyCount: await legacyMemoryCount().catch(() => state.items.length),
        backup: backup ? { id: backup._id, createdAt: new Date(backup.createdAt).toISOString(), count: backup.count, sha256: backup.sha256 } : null,
        steps: { backup: stepDto(state.steps.backup), triage: stepDto(state.steps.triage), compact: stepDto(state.steps.compact), import: stepDto(state.steps.import), history: stepDto(state.steps.history) },
        curator: state.curator ? { provider: state.curator.provider, model: state.curator.model, variant: state.curator.variant, ranAt: new Date(state.curator.ranAt).toISOString() } : null,
        items: state.items.map(itemDto),
        report: triaged.length ? { byDecision, byList: [...byList.values()] } : null,
        importReport: importReport(state.items),
        budget: triaged.length ? await budgetOf(state, settings) : [],
        campaigns: await campaignMoveRows().catch(() => []),
        campaignBackup: campaignBackup ? { count: campaignBackup.count, sha256: campaignBackup.sha256, createdAt: new Date(campaignBackup.createdAt).toISOString() } : null,
        categoryNotices: state.categoryNotices,
        categories: settings?.categories ?? [],
        textMax: settings?.textMax ?? 4000,
        firstCompletedAt: iso(state.firstCompletedAt),
        lastImportAt: iso(state.lastImportAt),
    }
}

/** Testes: zera as etapas em andamento deste processo. */
export function resetMigrationRuntimeForTests(): void {
    running.clear()
}
