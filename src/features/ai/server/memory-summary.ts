import { streamAi } from "@/lib/ai/stream"
import { getAiProvider } from "@/lib/ai/providers"
import { MEMORY_SUMMARY_CONSUMPTION_ORIGIN, MEMORY_SUMMARY_FEATURE } from "../constants"
import { buildSummaryInstructions, fallbackSummary, normalizeText, parseFormattedMemory, type FormattedMemory } from "../memory-summary"
import { DEFAULT_MEMORY_SUMMARY_SETTINGS, memorySummarySettingsSchema, type MemorySummarySettings } from "../schemas"
import type { AiFeatureAvailability, MemorySummarySettingsDto } from "../types"
import { assertCatalog, availability, loadFeature, persistFeature } from "./settings"

/** Uso "Resumo de memórias" (SOMENTE servidor), copiado do uso "Resumo" do Ciliar. */

export function loadMemorySummarySettings() {
    return loadFeature<MemorySummarySettings>(MEMORY_SUMMARY_FEATURE, memorySummarySettingsSchema, DEFAULT_MEMORY_SUMMARY_SETTINGS)
}

export function memorySummaryAvailability(settings: MemorySummarySettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, 'O "Resumo de memórias"')
}

export async function getMemorySummarySettings(): Promise<MemorySummarySettingsDto> {
    const { settings, isDefault, updatedAt } = await loadMemorySummarySettings()
    return { settings, isDefault, availability: await memorySummaryAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export async function saveMemorySummarySettings(input: MemorySummarySettings, actorId: string): Promise<MemorySummarySettingsDto> {
    const supportsSampling = input.main.provider ? getAiProvider(input.main.provider).supportsSampling : false
    const next: MemorySummarySettings = {
        ...input,
        main: { ...input.main, variant: input.main.variant || null, temperature: supportsSampling ? input.main.temperature : null, maxOutputTokens: supportsSampling ? input.main.maxOutputTokens : null },
    }
    await assertCatalog({ enabled: next.enabled, provider: next.main.provider, model: next.main.model, variant: next.main.variant, agent: null, temperature: null, maxOutputTokens: null })
    const before = await loadMemorySummarySettings()
    await persistFeature(MEMORY_SUMMARY_FEATURE, next, actorId, before)
    return getMemorySummarySettings()
}

/**
 * Formata o texto livre de uma memória e gera o resumo de uma linha mostrado nas listas. Nunca
 * lança: sem IA (desligada, indisponível ou falha), salva o texto como escrito e um resumo de
 * reserva — e avisa quem chamou (`formatadaPorIa: false`).
 */
export async function formatMemory(texto: string): Promise<FormattedMemory & { formatadaPorIa: boolean }> {
    const { settings } = await loadMemorySummarySettings()
    const original = normalizeText(texto)
    const fallback = { texto: original, resumo: fallbackSummary(original, settings.maxLength), formatadaPorIa: false }
    const status = await memorySummaryAvailability(settings).catch(() => ({ available: false }))
    const { provider, model, variant, temperature, maxOutputTokens } = settings.main
    if (!status.available || !provider || !model) return fallback
    let text = ""
    let failed = false
    const signal = AbortSignal.timeout(30_000)
    try {
        for await (const event of streamAi({
            provider,
            model,
            variant,
            temperature,
            maxOutputTokens,
            instructions: buildSummaryInstructions(settings.instructions, settings.maxLength),
            prompt: `Memória:\n${original}`,
            signal,
            consumption: { origin: MEMORY_SUMMARY_CONSUMPTION_ORIGIN },
        })) {
            if (event.type === "delta") text += event.text
            if (event.type === "error") failed = true
        }
    } catch {
        failed = true
    }
    if (failed) return fallback
    const parsed = parseFormattedMemory(text, settings.maxLength)
    return parsed ? { ...parsed, formatadaPorIa: true } : fallback
}
