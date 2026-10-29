import type { ZodType } from "zod"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AiFeatureSetting } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { getAiProviderStatuses, listAiAgents, listAiImageModels, listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"
import { publishAppEvent } from "@/lib/pusher/channels"
import { AI_AUDIT_ENTITY, AI_FEATURE_UPDATED_EVENT, ENTITY_IMPORT_FEATURE, ENTITY_UNDERSTANDING_FEATURE, IMAGE_GENERATOR_FEATURE } from "../constants"
import {
    DEFAULT_ENTITY_IMPORT_SETTINGS,
    DEFAULT_ENTITY_UNDERSTANDING_SETTINGS,
    DEFAULT_IMAGE_GENERATOR_SETTINGS,
    entityImportSettingsSchema,
    entityUnderstandingSettingsSchema,
    imageGeneratorSettingsSchema,
    type EntityImportSettings,
    type EntityUnderstandingSettings,
    type ImageGeneratorSettings,
} from "../schemas"
import type { AiFeatureAvailability, EntityImportSettingsDto, EntityUnderstandingSettingsDto, ImageGeneratorSettingsDto } from "../types"

/** Campos de provedor comuns a toda feature de IA. */
export type ProviderSettings = {
    enabled: boolean
    provider: AiProviderId | null
    model: string | null
    agent: string | null
    variant: string | null
    temperature: number | null
    maxOutputTokens: number | null
}

/** Configuração salva (validada); inválida ou ausente cai nos valores iniciais. */
export async function loadFeature<T>(feature: string, schema: ZodType<T>, defaults: T): Promise<{ settings: T; isDefault: boolean; updatedAt: Date | null }> {
    await dbConnect()
    const doc = await AiFeatureSetting.findOne({ feature }).lean()
    if (!doc) return { settings: defaults, isDefault: true, updatedAt: null }
    const parsed = schema.safeParse({ ...defaults, ...doc.settings })
    return { settings: parsed.success ? parsed.data : defaults, isDefault: !parsed.success, updatedAt: doc.updatedAt ?? null }
}

/** Pode ser usada agora? Sem `available`, `reason` explica (botão desabilitado com o motivo). */
export async function availability(settings: { enabled: boolean; provider: AiProviderId | null; model: string | null }, featureLabel: string): Promise<AiFeatureAvailability> {
    if (!settings.enabled) return { available: false, reason: `${featureLabel} está desativada em Integrações › Provedores de IA` }
    if (!settings.provider || !settings.model) return { available: false, reason: "Selecione o provedor e o modelo em Integrações › Provedores de IA" }
    const status = (await getAiProviderStatuses()).find((item) => item.id === settings.provider)
    if (!status?.configured) return { available: false, reason: `${getAiProvider(settings.provider).name} não está configurado` }
    if (!status.connected) return { available: false, reason: `${getAiProvider(settings.provider).name} não está conectado: teste a conexão em Integrações › Provedores de IA` }
    return { available: true, reason: null }
}

/** Confere no provedor o modelo, a variante e o agente escolhidos. */
export async function assertCatalog(settings: ProviderSettings): Promise<void> {
    if (!settings.provider || !settings.model) return
    const provider = getAiProvider(settings.provider)
    const status = (await getAiProviderStatuses()).find((item) => item.id === settings.provider)
    if (!status?.connected) {
        if (settings.enabled) throw new DomainError(409, `${provider.name} não está conectado: teste a conexão antes de ativar a feature`, "AI_PROVIDER_DISCONNECTED")
        return
    }
    try {
        const models = await listAiModels(settings.provider)
        const model = models.find((item) => item.id === settings.model)
        if (!model) throw new DomainError(400, `Modelo ${settings.model} não está disponível no ${provider.name}`, "AI_MODEL_NOT_FOUND")
        if (settings.variant && !model.variants.includes(settings.variant)) throw new DomainError(400, `${provider.variantLabel} "${settings.variant}" não existe no modelo ${model.name}`, "AI_VARIANT_NOT_FOUND")
        if (provider.supportsAgent && settings.agent) {
            const agents = await listAiAgents()
            if (!agents.some((agent) => agent.id === settings.agent)) throw new DomainError(400, `Agente ${settings.agent} não existe no OpenCode`, "AI_AGENT_NOT_FOUND")
        }
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
}

/** Campos que não se aplicam ao provedor escolhido são gravados vazios. */
export function normalizeProvider<T extends ProviderSettings>(input: T): T {
    const provider = input.provider ? getAiProvider(input.provider) : null
    return {
        ...input,
        agent: provider?.supportsAgent ? input.agent || null : null,
        variant: input.variant || null,
        temperature: provider?.supportsSampling ? input.temperature : null,
        maxOutputTokens: provider?.supportsSampling ? input.maxOutputTokens : null,
    }
}

export async function persistFeature<T>(feature: string, next: T, actorId: string, before: { isDefault: boolean; settings: T }): Promise<void> {
    await AiFeatureSetting.updateOne({ feature }, { $set: { settings: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: AI_AUDIT_ENTITY,
        entidadeId: feature,
        acao: before.isDefault ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR,
        antes: before.isDefault ? undefined : (before.settings as Record<string, unknown>),
        depois: next as Record<string, unknown>,
    })
    await publishAppEvent(AI_FEATURE_UPDATED_EVENT, { feature }).catch(() => undefined)
}

// ── Gerador de imagens ───────────────────────────────────────────────────────

export async function loadImageGeneratorSettings(): Promise<{ settings: ImageGeneratorSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(IMAGE_GENERATOR_FEATURE, imageGeneratorSettingsSchema, DEFAULT_IMAGE_GENERATOR_SETTINGS)
}

export async function availabilityOfImageGenerator(settings: ImageGeneratorSettings): Promise<AiFeatureAvailability> {
    return availability(settings, '"Gerador de imagens"')
}

export async function getImageGeneratorSettings(): Promise<ImageGeneratorSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadImageGeneratorSettings()
    return { settings, isDefault, availability: await availabilityOfImageGenerator(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

/** Confere no provedor o modelo de imagem escolhido. */
async function assertImageCatalog(settings: ImageGeneratorSettings): Promise<void> {
    if (!settings.provider || !settings.model) return
    const provider = getAiProvider(settings.provider)
    const status = (await getAiProviderStatuses()).find((item) => item.id === settings.provider)
    if (!status?.connected) {
        if (settings.enabled) throw new DomainError(409, `${provider.name} não está conectado: teste a conexão antes de ativar o agente`, "AI_PROVIDER_DISCONNECTED")
        return
    }
    try {
        const models = await listAiImageModels(settings.provider)
        if (!models.some((item) => item.id === settings.model)) throw new DomainError(400, `Modelo de imagem ${settings.model} não está disponível no ${provider.name}`, "AI_MODEL_NOT_FOUND")
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
}

export async function saveImageGeneratorSettings(input: ImageGeneratorSettings, actorId: string): Promise<ImageGeneratorSettingsDto> {
    await assertImageCatalog(input)
    const before = await loadImageGeneratorSettings()
    await persistFeature(IMAGE_GENERATOR_FEATURE, input, actorId, before)
    return getImageGeneratorSettings()
}

// ── Entender com IA ──────────────────────────────────────────────────────────

export async function loadEntityUnderstandingSettings(): Promise<{ settings: EntityUnderstandingSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(ENTITY_UNDERSTANDING_FEATURE, entityUnderstandingSettingsSchema, DEFAULT_ENTITY_UNDERSTANDING_SETTINGS)
}

export async function availabilityOfEntityUnderstanding(settings: EntityUnderstandingSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, '"Entender com IA"')
}

export async function getEntityUnderstandingSettings(): Promise<EntityUnderstandingSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadEntityUnderstandingSettings()
    return { settings, isDefault, availability: await availabilityOfEntityUnderstanding(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export async function saveEntityUnderstandingSettings(input: EntityUnderstandingSettings, actorId: string): Promise<EntityUnderstandingSettingsDto> {
    const main = normalizeProvider({ enabled: input.enabled, ...input.main, agent: null })
    const next: EntityUnderstandingSettings = {
        ...input,
        main: { provider: main.provider as EntityUnderstandingSettings["main"]["provider"], model: main.model, variant: main.variant, temperature: main.temperature, maxOutputTokens: main.maxOutputTokens },
    }
    await assertCatalog(main)
    const before = await loadEntityUnderstandingSettings()
    await persistFeature(ENTITY_UNDERSTANDING_FEATURE, next, actorId, before)
    return getEntityUnderstandingSettings()
}

// ── Importador 5etools ───────────────────────────────────────────────────────

export async function loadEntityImportSettings(): Promise<{ settings: EntityImportSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature(ENTITY_IMPORT_FEATURE, entityImportSettingsSchema, DEFAULT_ENTITY_IMPORT_SETTINGS)
}

export async function availabilityOfEntityImport(settings: EntityImportSettings): Promise<AiFeatureAvailability> {
    return availability(settings, '"Importador 5etools"')
}

export async function getEntityImportSettings(): Promise<EntityImportSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadEntityImportSettings()
    return { settings, isDefault, availability: await availabilityOfEntityImport(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export async function saveEntityImportSettings(input: EntityImportSettings, actorId: string): Promise<EntityImportSettingsDto> {
    const next = normalizeProvider(input)
    await assertCatalog(next)
    const before = await loadEntityImportSettings()
    await persistFeature(ENTITY_IMPORT_FEATURE, next, actorId, before)
    return getEntityImportSettings()
}
