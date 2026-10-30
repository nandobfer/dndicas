/** Constantes das features de IA (módulo puro). */

import type { AiProviderId } from "@/lib/ai/providers"

/** Abas da página "Provedores de IA". `provedores` é a padrão (omitida da URL). */
export const AI_TABS = ["provedores", "gerador-imagens", "entender-com-ia", "importador-5etools", "agente-opex", "agente-maddox", "resumo-memorias"] as const
export type AiTab = (typeof AI_TABS)[number]

/**
 * Abas da página de um provedor de IA (`/integracoes/ia/opencode`). `configuracao` é a padrão
 * (omitida da URL). Gemini, Anthropic, OpenAI e DeepSeek não têm consumo próprio medido aqui, então não
 * têm a aba Consumo.
 */
export const AI_PROVIDER_TABS = ["configuracao", "modelos", "consumo"] as const
export type AiProviderTab = (typeof AI_PROVIDER_TABS)[number]

/** Abas mostradas em cada provedor. [`configuracao`, `modelos`] ou com `consumo`. */
export const AI_PROVIDER_TAB_IDS: Record<AiProviderId, readonly AiProviderTab[]> = {
    opencode: ["configuracao", "modelos", "consumo"],
    gemini: ["configuracao", "modelos"],
    anthropic: ["configuracao", "modelos"],
    openai: ["configuracao", "modelos"],
    deepseek: ["configuracao", "modelos"],
    jev: ["configuracao", "modelos", "consumo"],
}

/** Agentes (features) do app que usam IA — uma configuração salva por feature em `ai_feature_settings`. */
export const IMAGE_GENERATOR_FEATURE = "image-generator"
export const ENTITY_UNDERSTANDING_FEATURE = "entity-understanding"
export const ENTITY_IMPORT_FEATURE = "entity-import"
export const AI_FEATURE_IDS = [IMAGE_GENERATOR_FEATURE, ENTITY_UNDERSTANDING_FEATURE, ENTITY_IMPORT_FEATURE] as const
export type AiFeatureId = (typeof AI_FEATURE_IDS)[number]

/** Origens do painel de consumo (`ai_consumption_logs`). */
export const IMAGE_GENERATOR_CONSUMPTION_ORIGIN = "image-generator"
export const ENTITY_UNDERSTANDING_CONSUMPTION_ORIGIN = "entity-understanding"
export const ENTITY_IMPORT_CONSUMPTION_ORIGIN = "entity-import"

export const AI_AUDIT_ENTITY = "FeatureIA"

/** Evento em `private-app` quando a configuração de uma feature muda. Payload: `{ feature }`. */
export const AI_FEATURE_UPDATED_EVENT = "ai-feature-updated"

// ── Memórias dos agentes ───────────────────────────────────────────────────────

export const AI_MEMORY_AUDIT_ENTITY = "MemoriaAgente"
/** Evento no canal da integração "Provedores de IA" quando as memórias de uma lista mudam. Payload: `{ agentId }`. */
export const AI_MEMORIES_UPDATED_EVENT = "ai-memories-updated"

// ── Resumo de memórias ─────────────────────────────────────────────────────────

/** Uso "Resumo de memórias" em `ai_feature_settings`: formata e resume as memórias dos agentes. */
export const MEMORY_SUMMARY_FEATURE = "memory-summary"
export const MEMORY_SUMMARY_CONSUMPTION_ORIGIN = "memory-summary"
export const SUMMARY_MAX_LENGTH_MIN = 40
export const SUMMARY_MAX_LENGTH_MAX = 200
export const SUMMARY_MAX_LENGTH_DEFAULT = 80

export const DEFAULT_MEMORY_SUMMARY_INSTRUCTIONS = `Você organiza instruções e memórias dos agentes de IA do DnDicas.
- Corrija ortografia e pontuação, deixe o texto claro e direto, em português do Brasil, sem mudar o sentido nem acrescentar fatos.
- Escreva um resumo de UMA linha, curto, que identifique a memória numa lista.`

// ── Gerador de imagens ─────────────────────────────────────────────────────────

/** Proporções aceitas pelo botão "Gerar com IA" (o uploader escolhe pela variante do campo). */
export const IMAGE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number]

/** Limite do arquivo gerado (o mesmo do upload manual). */
export const MAX_GENERATED_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export const DEFAULT_IMAGE_GENERATOR_INSTRUCTIONS = [
    "Você é um diretor de arte especializado em Dungeons & Dragons 5e, criando ilustrações com aparência premium de livro oficial.",
    "Crie uma única arte final, priorizando leitura clara do sujeito principal e enquadramento adequado para uso como imagem de catálogo.",
    "A estética deve ser coerente com D&D: realismo clássico, fantasia heroica, acabamento editorial, iluminação dramática, riqueza de materiais, silhueta legível e consistência com artes de sourcebooks oficiais.",
    "Regras obrigatórias: sem texto, sem logos, sem molduras, sem watermark, sem interface, sem colagem, sem múltiplos quadros e sem visual fotográfico moderno fora do tema de fantasia.",
    "Use TODO o JSON do formulário como fonte de verdade. Não dependa de campos específicos; leia o objeto inteiro e extraia dele o que for necessário para representar com precisão a entidade.",
    "Prefira uma saída visualmente rica, mas com composição eficiente para web e adequada a um arquivo final de até 5MB.",
].join("\n")

// ── Entender com IA ────────────────────────────────────────────────────────────

export const ENTITY_UNDERSTANDING_TOOL_ROUNDS_MIN = 1
export const ENTITY_UNDERSTANDING_TOOL_ROUNDS_MAX = 10
export const ENTITY_UNDERSTANDING_TOOL_ROUNDS_DEFAULT = 4

export const DEFAULT_ENTITY_UNDERSTANDING_INSTRUCTIONS = [
    "Você é o assistente de IA do DnDicas, especializado em D&D 5e e no catálogo interno do produto.",
    "Responda sempre em pt-BR para usuário final, de forma breve, prática e clara.",
    "Não mencione JSON, campos internos, IDs, banco de dados, schemas, código ou detalhes técnicos.",
    "Use somente as informações recebidas ou consultadas pelas ferramentas. Não invente regras.",
    "Se faltar contexto, peça uma pergunta mais específica.",
    "Quando fizer sentido, explique como usar a entidade em mesa, criação de personagem, preparação de campanha ou consulta de regras.",
].join("\n")

// ── Importador 5etools ─────────────────────────────────────────────────────────

export const DEFAULT_ENTITY_IMPORT_INSTRUCTIONS = [
    "Você traduz conteúdo oficial de Dungeons & Dragons 5e do inglês para o português do Brasil, para o catálogo do DnDicas.",
    "Use a terminologia oficial da edição brasileira do Livro do Jogador (2024) e preserve números, dados (ex.: 2d6), distâncias e marcações.",
    "Não acrescente nem remova informações; não explique, não comente: devolva só a tradução pedida no formato pedido.",
].join("\n")
