import { z } from "zod"
import type { ZodType } from "zod"
import { entityImportSettingsSchema, entityUnderstandingSettingsSchema, imageGeneratorSettingsSchema, memorySummarySettingsSchema } from "@/features/ai/schemas"
import {
    getEntityImportSettings,
    getEntityUnderstandingSettings,
    getImageGeneratorSettings,
    saveEntityImportSettings,
    saveEntityUnderstandingSettings,
    saveImageGeneratorSettings,
} from "@/features/ai/server/settings"
import { getMemorySummarySettings, saveMemorySummarySettings } from "@/features/ai/server/memory-summary"
import { defineTool } from "./define"
import { deepMerge, parseJsonObject } from "./json"

interface FeatureSettingsHandler {
    schema: ZodType<unknown>
    get: () => Promise<{ settings: unknown }>
    save: (input: never, actorId: string) => Promise<unknown>
}

/** Agentes de IA do DnDicas configuráveis pelo Agente Opex (a configuração dele mesmo fica de fora). */
const AI_FEATURES = {
    "image-generator": { schema: imageGeneratorSettingsSchema, get: getImageGeneratorSettings, save: saveImageGeneratorSettings },
    "entity-understanding": { schema: entityUnderstandingSettingsSchema, get: getEntityUnderstandingSettings, save: saveEntityUnderstandingSettings },
    "entity-import": { schema: entityImportSettingsSchema, get: getEntityImportSettings, save: saveEntityImportSettings },
    "memory-summary": { schema: memorySummarySettingsSchema, get: getMemorySummarySettings, save: saveMemorySummarySettings },
} satisfies Record<string, FeatureSettingsHandler>

const AI_FEATURE_KEYS = Object.keys(AI_FEATURES) as [keyof typeof AI_FEATURES, ...(keyof typeof AI_FEATURES)[]]

export const aiSettingsTools = [
    defineTool({
        name: "get_ai_feature_settings",
        group: "ai-settings",
        label: "Ler agente de IA",
        risk: "read",
        minRole: "admin",
        permission: "integrations.ai.view",
        description:
            'Configuração de um agente de IA do DnDicas (provedor, modelo, instruções...) e se ele pode ser usado agora: image-generator = "Gerador de imagens", entity-understanding = "Entender com IA", entity-import = "Importador 5etools", memory-summary = "Resumo de memórias".',
        input: z.object({ feature: z.enum(AI_FEATURE_KEYS) }),
        execute: async ({ feature }) => AI_FEATURES[feature].get(),
    }),
    defineTool({
        name: "update_ai_feature_settings",
        group: "ai-settings",
        label: "Configurar agente de IA",
        risk: "write",
        minRole: "admin",
        permission: "integrations.ai.edit",
        description: "Altera a configuração de um agente de IA. `patchJson` é mesclado sobre a configuração atual (veja get_ai_feature_settings); o provedor precisa estar conectado para ativar.",
        input: z.object({ feature: z.enum(AI_FEATURE_KEYS), patchJson: z.string() }),
        summarize: (input) => `Alterar a configuração do agente de IA ${input.feature}`,
        execute: async ({ feature, patchJson }, context) => {
            const handler: FeatureSettingsHandler = AI_FEATURES[feature]
            const current = await handler.get()
            const next = handler.schema.parse(deepMerge(current.settings, parseJsonObject(patchJson, "patchJson")))
            return handler.save(next as never, context.actorId)
        },
    }),
]
