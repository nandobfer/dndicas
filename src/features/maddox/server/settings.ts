import { z } from "zod"
import { assertCatalog, availability, loadFeature, normalizeProvider, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { MADDOX_FEATURE } from "../constants"
import { DEFAULT_MADDOX_SETTINGS, maddoxSettingsSchema, type MaddoxSettings } from "../schemas"
import type { MaddoxSettingsDto } from "../types"
import { getAllMaddoxScripts } from "./scripts"

/** Configuração do Agente Maddox (`ai_feature_settings`, feature `maddox`) — SOMENTE servidor. */

/** Configurações salvas antes de um campo novo existir recebem o padrão dele antes de validar. */
export function withMaddoxDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = saved as Partial<MaddoxSettings>
    return {
        ...DEFAULT_MADDOX_SETTINGS,
        ...value,
        main: { ...DEFAULT_MADDOX_SETTINGS.main, ...(value.main ?? {}) },
        interviewer: { ...DEFAULT_MADDOX_SETTINGS.interviewer, ...(value.interviewer ?? {}) },
        avatar: { ...DEFAULT_MADDOX_SETTINGS.avatar, ...(value.avatar ?? {}) },
        opencode: { ...DEFAULT_MADDOX_SETTINGS.opencode, ...(value.opencode ?? {}) },
        jev: { ...DEFAULT_MADDOX_SETTINGS.jev, ...(value.jev ?? {}) },
    }
}

export async function loadMaddoxSettings(): Promise<{ settings: MaddoxSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<MaddoxSettings>(MADDOX_FEATURE, z.preprocess(withMaddoxDefaults, maddoxSettingsSchema), DEFAULT_MADDOX_SETTINGS)
}

export async function maddoxAvailability(settings: MaddoxSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, '"Agente Maddox"')
}

export async function getMaddoxSettings(): Promise<MaddoxSettingsDto> {
    const [{ settings, isDefault, updatedAt }, scripts] = await Promise.all([loadMaddoxSettings(), getAllMaddoxScripts()])
    return { settings, isDefault, availability: await maddoxAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null, scripts }
}

/** Campos que não se aplicam ao provedor escolhido (agente fora do OpenCode, amostragem) são gravados vazios. */
export function normalizeMaddoxSettings(input: MaddoxSettings): MaddoxSettings {
    const main = normalizeProvider({ enabled: input.enabled, ...input.main })
    const interviewer = input.interviewer.provider
        ? normalizeProvider({ enabled: false, ...input.interviewer, temperature: null, maxOutputTokens: null })
        : { provider: null, model: null, agent: null, variant: null }
    return {
        ...input,
        main: { provider: main.provider, model: main.model, agent: main.agent, variant: main.variant, temperature: main.temperature, maxOutputTokens: main.maxOutputTokens } as MaddoxSettings["main"],
        interviewer: { provider: interviewer.provider, model: interviewer.model, agent: interviewer.agent, variant: interviewer.variant } as MaddoxSettings["interviewer"],
        avatar: { url: input.avatar.url?.trim() || null, persona: input.avatar.persona },
        opencode: { ...input.opencode, directory: input.opencode.directory?.trim() || null },
    }
}

/** Salva conferindo no catálogo os modelos, variantes e agentes do OpenCode do Maddox e do entrevistador. */
export async function saveMaddoxSettings(input: MaddoxSettings, actorId: string): Promise<MaddoxSettingsDto> {
    const next = normalizeMaddoxSettings(input)
    await assertCatalog({ enabled: next.enabled, ...next.main })
    if (next.interviewer.provider) await assertCatalog({ enabled: next.enabled, ...next.interviewer, temperature: null, maxOutputTokens: null })
    const before = await loadMaddoxSettings()
    await persistFeature(MADDOX_FEATURE, next, actorId, before)
    return getMaddoxSettings()
}
