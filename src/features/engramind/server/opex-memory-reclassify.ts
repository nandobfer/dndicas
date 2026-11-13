import { engramindCodeOf, type EngramindClient } from "@engramind/client/server"
import { z } from "zod"
import { dbConnect } from "@/lib/db"
import {
    OPEX_CHARACTER_CHANNEL_PREFIX,
    OPEX_MEMORY_CATEGORY_KEYS,
    OPEX_MEMORY_FALLBACK_CATEGORY,
    OPEX_NPC_CHANNEL_PREFIX,
    OPEX_ONLY_CATEGORY_LIST,
    RULE_CATEGORY_KEYS,
    agentSlug,
    type MemoryIdentity,
} from "../constants"
import { opexMemoryCategoryOf, resolveOpexCategory } from "../opex-memory-category"
import { engramindAgentClient, engramindAppClient, engramindConnection } from "./client"
import { ensureAgentSubscription } from "./bootstrap"
import { ensureCategories, invalidateCategoryCache, listCategoryKeys } from "./categories"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf } from "./shared"

/**
 * Reclassificação única das memórias dos Personagens e NPCs Opex (DND-57) — SOMENTE servidor.
 *
 * Antes da DND-57 o Opex gravava sem categoria e a rede punha as memórias na categoria padrão (PROJECT_RULES): os
 * pensamentos do personagem entravam no contexto como regra, acima das orientações do dono. Esta rotina percorre os
 * canais individuais (`dndicas/personagem-opex/<campanha>/<membro>` e `dndicas/npc-opex/<campanha>/<npc>`), em memórias
 * ativas, permanentes e arquivadas com categoria de regra, e pede ao modelo do Personagem Opex a categoria de cada uma
 * (geração com falha ou resposta inválida = OUTRO). Lê e grava pelos agentes globais, que assinam os prefixos em
 * `manage` (alcançam também os canais de Opex removidos); um canal arquivado é restaurado e arquivado de novo.
 *
 * `retry` = nada mudou de forma definitiva (Engramind fora, sem token ou sem modelo): o marcador não é gravado e a
 * migração tenta no próximo boot. Falhas pontuais (uma memória, uma geração) vão para o log e não impedem o `done`.
 */

const PAGE = 200
const MAX_PAGES = 100
const BATCH = 30
const GENERATION_TIMEOUT_MS = 90_000

const SOURCES: readonly { identity: Extract<MemoryIdentity, "personagem-opex" | "npc-opex">; prefix: string }[] = [
    { identity: "personagem-opex", prefix: OPEX_CHARACTER_CHANNEL_PREFIX },
    { identity: "npc-opex", prefix: OPEX_NPC_CHANNEL_PREFIX },
]

export interface ReclassifyMemory {
    id: string
    channel: string
    title: string | null
    text: string
    category: string
    version: number
}

export interface ReclassifyOutcome {
    status: "done" | "retry"
    reason?: string
    changed: number
    skipped: number
    failed: number
}

/** Classificador (o padrão gera com o modelo do Personagem Opex; os testes trocam). `null` = sem modelo disponível. */
export type OpexMemoryClassifier = (campaignId: string, memories: readonly ReclassifyMemory[]) => Promise<Map<string, string> | null>

class ModelUnavailableError extends Error {}

async function listRuleMemories(client: EngramindClient, prefix: string): Promise<ReclassifyMemory[]> {
    const all: ReclassifyMemory[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
        const result: { memories: ReclassifyMemory[]; next_cursor: string | null } = await client.call("GET", "/v1/memories", {
            query: { channels: `${prefix}*`, categories: RULE_CATEGORY_KEYS.join(","), status: "active,permanent,archived", limit: PAGE, ...(cursor ? { cursor } : {}) },
        })
        all.push(...result.memories.filter((memory) => memory.channel.startsWith(prefix) && (RULE_CATEGORY_KEYS as readonly string[]).includes(memory.category)))
        cursor = result.next_cursor
        if (!cursor) break
    }
    return all
}

export function reclassifyPrompt(memories: readonly ReclassifyMemory[]): { instructions: string; prompt: string } {
    return {
        instructions: [
            "Você classifica memórias que um personagem de RPG (controlado por IA) guardou sobre si mesmo numa campanha.",
            "Escolha UMA categoria para cada memória:",
            "- SENTIMENTO: o que o personagem sente;",
            "- PLANO: o que ele pretende fazer ou conseguir;",
            "- OPINIAO: o que ele acha de algo ou de alguém;",
            "- RELACAO: o vínculo dele com outro personagem ou NPC;",
            "- FATO: algo que ele sabe ou descobriu;",
            "- EVENTO: algo que ele viveu;",
            "- OUTRO: o que não cabe nas anteriores.",
            "Nunca use categorias de regra. Responda SOMENTE com o objeto JSON pedido.",
        ].join("\n"),
        prompt: [
            "## Memórias",
            ...memories.map((memory) => `- id="${memory.id}" — ${memory.title ? `${memory.title}: ` : ""}${memory.text.replace(/\s+/g, " ").slice(0, 600)}`),
            `Responda só com: {"itens": [{"id": "id da memória", "categoria": "${OPEX_MEMORY_CATEGORY_KEYS.join(" | ")}"}]}`,
        ].join("\n"),
    }
}

const answerSchema = z.object({ itens: z.array(z.object({ id: z.string(), categoria: z.unknown() })) })

/** Categoria de cada memória a partir da resposta do modelo; o que faltar ou vier inválido fica OUTRO. */
export function categoriesFromAnswer(memories: readonly ReclassifyMemory[], answer: unknown): Map<string, string> {
    const parsed = answerSchema.safeParse(answer)
    const chosen = new Map(parsed.success ? parsed.data.itens.map((item) => [item.id, opexMemoryCategoryOf(item.categoria)] as const) : [])
    return new Map(memories.map((memory) => [memory.id, chosen.get(memory.id) ?? OPEX_MEMORY_FALLBACK_CATEGORY]))
}

/** Classificador padrão: uma geração por lote com o modelo do Personagem Opex no rigor da campanha. */
export const generateOpexMemoryCategories: OpexMemoryClassifier = async (campaignId, memories) => {
    const [{ loadMaddoxSettings }, { availability }, { resolveOpexCharacterModel }, { MaddoxCampaignModel }, { MADDOX_OPEX_MEMORY_RECLASSIFY_CONSUMPTION_ORIGIN }] = await Promise.all([
        import("@/features/maddox/server/settings"),
        import("@/features/ai/server/settings"),
        import("@/features/maddox/model-resolution"),
        import("@/features/maddox/models"),
        import("@/features/maddox/constants"),
    ])
    const { settings } = await loadMaddoxSettings()
    const campaign = /^[a-f0-9]{24}$/i.test(campaignId) ? await MaddoxCampaignModel.findById(campaignId).select("rigor").lean<{ rigor?: Parameters<typeof resolveOpexCharacterModel>[1] }>() : null
    const model = resolveOpexCharacterModel(settings, campaign?.rigor ?? null)
    const result = await availability({ enabled: settings.enabled, provider: model?.provider ?? null, model: model?.model ?? null }, '"Agente Maddox"')
    if (!result.available || !model) return null
    const [{ generateAiText }, { parseJsonObject }] = await Promise.all([import("@/lib/ai/stream"), import("@/features/maddox/server/interview-prompt")])
    const { instructions, prompt } = reclassifyPrompt(memories)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS)
    try {
        const { text } = await generateAiText({
            provider: model.provider,
            model: model.model,
            agent: model.agent,
            variant: model.variant,
            instructions,
            prompt,
            title: "Reclassificação das memórias dos Opex",
            consumption: { origin: MADDOX_OPEX_MEMORY_RECLASSIFY_CONSUMPTION_ORIGIN, subject: campaignId },
            signal: controller.signal,
        })
        return categoriesFromAnswer(memories, parseJsonObject(text))
    } catch (error) {
        engramindLog.warn({ campaignId, err: messageOf(error) }, "[engramind] reclassificação: geração falhou, memórias do lote vão para OUTRO")
        return categoriesFromAnswer(memories, null)
    } finally {
        clearTimeout(timer)
    }
}

async function withRestoredChannel<T>(app: EngramindClient, channel: string, work: () => Promise<T>): Promise<T> {
    const current = await app.channels.get(channel).catch(() => null)
    const archived = Boolean(current?.archived_at)
    if (archived) await app.channels.restore(channel)
    try {
        return await work()
    } finally {
        if (archived) await app.channels.archive(channel).catch((error: unknown) => engramindLog.warn({ channel, err: messageOf(error) }, "[engramind] reclassificação: canal não voltou ao arquivo"))
    }
}

/** Roda a reclassificação inteira. Nunca lança: erro inesperado = `retry`. */
export async function reclassifyOpexMemories(classify: OpexMemoryClassifier = generateOpexMemoryCategories): Promise<ReclassifyOutcome> {
    const outcome: ReclassifyOutcome = { status: "done", changed: 0, skipped: 0, failed: 0 }
    try {
        await dbConnect()
        if (!(await engramindConnection().catch(() => null))) return { ...outcome, status: "retry", reason: "Engramind não configurado" }
        const app = await engramindAppClient()
        if (!app) return { ...outcome, status: "retry", reason: "token de app indisponível" }
        const categoryOutcomes = await ensureCategories(OPEX_ONLY_CATEGORY_LIST, app)
        for (const item of categoryOutcomes.filter((entry) => entry.status !== "exists" && entry.status !== "created")) engramindLog.warn({ category: item.key }, `[engramind] reclassificação: ${item.message}`)
        invalidateCategoryCache()
        const available = await listCategoryKeys(app)

        for (const source of SOURCES) {
            const client = await engramindAgentClient(source.identity)
            if (!client) return { ...outcome, status: "retry", reason: `token do agente ${agentSlug(source.identity)} indisponível` }
            await ensureAgentSubscription(app, agentSlug(source.identity), `${source.prefix}*`, "manage")
            const memories = await listRuleMemories(client, source.prefix)
            const byChannel = new Map<string, ReclassifyMemory[]>()
            for (const memory of memories) byChannel.set(memory.channel, [...(byChannel.get(memory.channel) ?? []), memory])

            for (const [channel, items] of byChannel) {
                const campaignId = channel.slice(source.prefix.length).split("/")[0] ?? ""
                const chosen = new Map<string, string>()
                for (let start = 0; start < items.length; start += BATCH) {
                    const batch = items.slice(start, start + BATCH)
                    const categories = await classify(campaignId, batch)
                    if (!categories) throw new ModelUnavailableError("modelo do Personagem Opex indisponível")
                    for (const [id, category] of categories) chosen.set(id, category)
                }
                await withRestoredChannel(app, channel, async () => {
                    for (const memory of items) {
                        const category = resolveOpexCategory(chosen.get(memory.id) ?? OPEX_MEMORY_FALLBACK_CATEGORY, available) ?? OPEX_MEMORY_FALLBACK_CATEGORY
                        try {
                            await client.call("PATCH", `/v1/memories/${encodeURIComponent(memory.id)}`, { body: { category, expected_version: memory.version } })
                            outcome.changed++
                        } catch (error) {
                            if (engramindCodeOf(error) === "MEMORY_VERSION_CONFLICT") {
                                outcome.skipped++
                                engramindLog.info({ memoryId: memory.id, channel }, "[engramind] reclassificação: memória mudou no meio do processo e foi ignorada")
                                continue
                            }
                            outcome.failed++
                            engramindLog.warn({ memoryId: memory.id, channel, err: messageOf(error) }, "[engramind] reclassificação: memória não ajustada")
                        }
                    }
                })
            }
        }
        await auditEngramind("system:migration", "reclassify_opex_memories", AcaoAuditoria.ATUALIZAR, { alteradas: outcome.changed, ignoradas: outcome.skipped, falhas: outcome.failed })
        engramindLog.info({ ...outcome }, "[engramind] reclassificação das memórias dos Opex concluída")
        return outcome
    } catch (error) {
        engramindLog.warn({ err: messageOf(error) }, "[engramind] reclassificação das memórias dos Opex adiada para o próximo boot")
        return { ...outcome, status: "retry", reason: messageOf(error) }
    }
}
