import { z } from "zod"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { getAiProvider } from "@/lib/ai/providers"
import { DomainError } from "@/lib/api/route"
import { OPEX_FEATURE } from "../constants"
import { migrateLegacyToolSettings, type OpexToolMetaDto } from "../tool-tree"
import { DEFAULT_OPEX_AGENT_SETTINGS, opexAgentSettingsSchema, type OpexAgentSettings, type OpexMainModel, type OpexTitleModel } from "../schemas"
import type { OpexAgentSettingsDto } from "../types"

/** Metadados das ferramentas (import dinâmico: o registro importa serviços que leem esta configuração). */
async function toolMetas(): Promise<OpexToolMetaDto[]> {
    const { opexToolMetas } = await import("./tools/registry")
    return opexToolMetas()
}

export async function loadOpexSettings(): Promise<{ settings: OpexAgentSettings; isDefault: boolean; updatedAt: Date | null }> {
    // Configurações salvas antes de um campo novo existir recebem o padrão dele antes de validar.
    const metas = await toolMetas()
    return loadFeature<OpexAgentSettings>(OPEX_FEATURE, z.preprocess((saved) => withDefaults(saved, metas), opexAgentSettingsSchema), DEFAULT_OPEX_AGENT_SETTINGS)
}

/**
 * Completa a configuração salva com os padrões dos campos novos e converte o formato antigo (grupos
 * ligados/desligados + política geral de confirmação) para a seleção e confirmação por ferramenta.
 */
export function withDefaults(saved: unknown, metas: readonly OpexToolMetaDto[] = []): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = migrateLegacyToolSettings(saved as Record<string, unknown>, metas) as Partial<OpexAgentSettings>
    return {
        ...DEFAULT_OPEX_AGENT_SETTINGS,
        ...value,
        files: { ...DEFAULT_OPEX_AGENT_SETTINGS.files, ...(value.files ?? {}) },
        anonymous: { ...DEFAULT_OPEX_AGENT_SETTINGS.anonymous, ...(value.anonymous ?? {}) },
    }
}

export async function opexAvailability(settings: OpexAgentSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, '"Agente Opex"')
}

export async function getOpexSettings(): Promise<OpexAgentSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadOpexSettings()
    return { settings, isDefault, availability: await opexAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null, tools: await toolMetas() }
}

function normalizeMain(main: OpexMainModel): OpexMainModel {
    const supportsSampling = main.provider ? getAiProvider(main.provider).supportsSampling : false
    return {
        ...main,
        variant: main.variant || null,
        temperature: supportsSampling ? main.temperature : null,
        maxOutputTokens: supportsSampling ? main.maxOutputTokens : null,
    }
}

function normalizeTitle(title: OpexTitleModel): OpexTitleModel {
    if (!title.provider) return { provider: null, model: null, variant: null }
    return { ...title, variant: title.variant || null }
}

export function normalizeOpexSettings(input: OpexAgentSettings, metas: readonly OpexToolMetaDto[] = []): OpexAgentSettings {
    const known = new Map(metas.map((tool) => [tool.name, tool]))
    if (metas.length) {
        const unknown = [...input.disabledTools, ...Object.keys(input.confirmationOverrides)].find((name) => !known.has(name))
        if (unknown) throw new DomainError(400, `Ferramenta desconhecida: ${unknown}`, "OPEX_TOOL_NOT_FOUND")
    }
    return {
        ...input,
        main: normalizeMain(input.main),
        title: normalizeTitle(input.title),
        // Sempre ligadas nunca ficam desligadas; sem repetição.
        disabledTools: [...new Set(input.disabledTools)].filter((name) => !known.get(name)?.alwaysOn),
    }
}

/** Salva conferindo no catálogo os modelos e variantes do agente e do subagente de título. */
export async function saveOpexSettings(input: OpexAgentSettings, actorId: string): Promise<OpexAgentSettingsDto> {
    const next = normalizeOpexSettings(input, await toolMetas())
    await assertCatalog({ enabled: next.enabled, provider: next.main.provider, model: next.main.model, variant: next.main.variant, agent: null, temperature: null, maxOutputTokens: null })
    if (next.title.provider) {
        await assertCatalog({ enabled: next.enabled, provider: next.title.provider, model: next.title.model, variant: next.title.variant, agent: null, temperature: null, maxOutputTokens: null })
    }
    const before = await loadOpexSettings()
    await persistFeature(OPEX_FEATURE, next, actorId, before)
    return getOpexSettings()
}
