import { z } from "zod"
import { assertCatalog, availability, loadFeature, normalizeProvider, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { MADDOX_FEATURE, type MaddoxRigorLevel } from "../constants"
import { resolveInterviewerModel, resolveNarratorModel, resolveOpexCharacterModel } from "../model-resolution"
import { DEFAULT_MADDOX_SETTINGS, maddoxSettingsSchema, type MaddoxRigorModel, type MaddoxSettings } from "../schemas"
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
        opexCharacter: { ...DEFAULT_MADDOX_SETTINGS.opexCharacter, ...(value.opexCharacter ?? {}) },
        rigorModels: { main: value.rigorModels?.main ?? [], interviewer: value.rigorModels?.interviewer ?? [], opexCharacter: value.rigorModels?.opexCharacter ?? [] },
        avatar: { ...DEFAULT_MADDOX_SETTINGS.avatar, ...(value.avatar ?? {}) },
        opencode: { ...DEFAULT_MADDOX_SETTINGS.opencode, ...(value.opencode ?? {}) },
        jev: { ...DEFAULT_MADDOX_SETTINGS.jev, ...(value.jev ?? {}) },
        sceneImages: {
            ...DEFAULT_MADDOX_SETTINGS.sceneImages,
            ...(value.sceneImages ?? {}),
            situations: { ...DEFAULT_MADDOX_SETTINGS.sceneImages.situations, ...(value.sceneImages?.situations ?? {}) },
        },
    }
}

export async function loadMaddoxSettings(): Promise<{ settings: MaddoxSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<MaddoxSettings>(MADDOX_FEATURE, z.preprocess(withMaddoxDefaults, maddoxSettingsSchema), DEFAULT_MADDOX_SETTINGS)
}

/** Disponibilidade do Maddox; com `rigor`, a do modelo que o narrador usa nesse nível (DND-32). */
export async function maddoxAvailability(settings: MaddoxSettings, rigor?: MaddoxRigorLevel | null): Promise<AiFeatureAvailability> {
    const model = rigor ? resolveNarratorModel(settings, rigor) : null
    return availability({ enabled: settings.enabled, provider: model?.provider ?? settings.main.provider, model: model?.model ?? settings.main.model }, '"Agente Maddox"')
}

/**
 * Disponibilidade para adicionar um Personagem Opex (DND-26): o Maddox ativo com o entrevistador e o modelo do
 * Personagem Opex resolvidos no rigor da campanha. Indisponível = a mesma mensagem do Agente Maddox.
 */
export async function maddoxOpexAvailability(settings: MaddoxSettings, rigor: MaddoxRigorLevel): Promise<AiFeatureAvailability> {
    const base = await maddoxAvailability(settings, rigor)
    if (!base.available) return base
    for (const model of [resolveInterviewerModel(settings, rigor), resolveOpexCharacterModel(settings, rigor)]) {
        const result = await availability({ enabled: settings.enabled, provider: model?.provider ?? null, model: model?.model ?? null }, '"Agente Maddox"')
        if (!result.available) return result
    }
    return base
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
    const opexCharacter = input.opexCharacter.provider
        ? normalizeProvider({ enabled: false, ...input.opexCharacter, temperature: null, maxOutputTokens: null })
        : { provider: null, model: null, agent: null, variant: null }
    const rigorBlock = (block: MaddoxRigorModel): MaddoxRigorModel => {
        const value = normalizeProvider({ enabled: false, ...block, temperature: null, maxOutputTokens: null })
        return { rigor: block.rigor, provider: value.provider, model: value.model, agent: value.agent, variant: value.variant }
    }
    return {
        ...input,
        main: { provider: main.provider, model: main.model, agent: main.agent, variant: main.variant, temperature: main.temperature, maxOutputTokens: main.maxOutputTokens } as MaddoxSettings["main"],
        interviewer: { provider: interviewer.provider, model: interviewer.model, agent: interviewer.agent, variant: interviewer.variant } as MaddoxSettings["interviewer"],
        opexCharacter: { provider: opexCharacter.provider, model: opexCharacter.model, agent: opexCharacter.agent, variant: opexCharacter.variant } as MaddoxSettings["opexCharacter"],
        rigorModels: { main: input.rigorModels.main.map(rigorBlock), interviewer: input.rigorModels.interviewer.map(rigorBlock), opexCharacter: input.rigorModels.opexCharacter.map(rigorBlock) },
        avatar: { url: input.avatar.url?.trim() || null, persona: input.avatar.persona },
        opencode: { ...input.opencode, directory: input.opencode.directory?.trim() || null },
        sceneImages: { ...input.sceneImages, style: input.sceneImages.style.trim() },
    }
}

/** Salva conferindo no catálogo os modelos, variantes e agentes do OpenCode do Maddox, do entrevistador e de cada rigor. */
export async function saveMaddoxSettings(input: MaddoxSettings, actorId: string): Promise<MaddoxSettingsDto> {
    const next = normalizeMaddoxSettings(input)
    await assertCatalog({ enabled: next.enabled, ...next.main })
    if (next.interviewer.provider) await assertCatalog({ enabled: next.enabled, ...next.interviewer, temperature: null, maxOutputTokens: null })
    if (next.opexCharacter.provider) await assertCatalog({ enabled: next.enabled, ...next.opexCharacter, temperature: null, maxOutputTokens: null })
    for (const block of [...next.rigorModels.main, ...next.rigorModels.interviewer, ...next.rigorModels.opexCharacter]) {
        await assertCatalog({ enabled: next.enabled, provider: block.provider, model: block.model, agent: block.agent, variant: block.variant, temperature: null, maxOutputTokens: null })
    }
    const before = await loadMaddoxSettings()
    await persistFeature(MADDOX_FEATURE, next, actorId, before)
    return getMaddoxSettings()
}
