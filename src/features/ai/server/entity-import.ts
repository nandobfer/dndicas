import { AiProviderError } from "@/lib/ai/errors"
import { generateAiText } from "@/lib/ai/stream"
import { ENTITY_IMPORT_CONSUMPTION_ORIGIN } from "../constants"
import { memoriesSection } from "../memories-prompt"
import { agentMemoryTexts } from "./agent-memory-service"
import { availabilityOfEntityImport, loadEntityImportSettings } from "./settings"

/**
 * Agente "Importador 5etools": traduz o conteúdo importado do 5etools (tela de geração por IA e
 * scripts de seed) no provedor e modelo configurados em Integrações › Provedores de IA. Sem
 * configuração não há fallback: lança `AiProviderError` com o motivo.
 */
export async function generateEntityImportText(prompt: string, options: { subject?: string | null; signal?: AbortSignal } = {}): Promise<string> {
    const { settings } = await loadEntityImportSettings()
    const availability = await availabilityOfEntityImport(settings)
    if (!availability.available || !settings.provider || !settings.model) {
        throw new AiProviderError(availability.reason ?? "O Importador 5etools não está configurado em Integrações › Provedores de IA.")
    }
    const memories = await agentMemoryTexts(["entity-import"])
    const { text } = await generateAiText({
        provider: settings.provider,
        model: settings.model,
        agent: settings.agent,
        variant: settings.variant,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        instructions: settings.instructions.trim() + memoriesSection(memories),
        prompt,
        title: "Importador 5etools",
        signal: options.signal,
        consumption: { origin: ENTITY_IMPORT_CONSUMPTION_ORIGIN, subject: options.subject ?? null },
    })
    return text
}
