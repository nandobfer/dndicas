/**
 * Catálogo das integrações administráveis do DnDicas (copiado do Opex).
 *
 * Integrações ativas: Autenticação Google, Pusher, API dndicas, Crons, Provedores de IA (hub `ai`
 * com os provedores `ai_opencode`, `ai_gemini`, `ai_anthropic`, `ai_openai`, `ai_deepseek` e
 * `ai_jev`, que só aparecem dentro do hub), SMTP, Storage S3, Analytics (Umami) e Tradução.
 * `opex` aparece como "Em desenvolvimento" (sem campos, teste, debug nem ações).
 *
 * Fonte única dos metadados: nome, descrição, ambiente padrão e campos. É módulo PURO (sem
 * dependência de servidor) — a tela usa o mesmo catálogo para desenhar o formulário e o servidor o
 * usa para validar, resolver defaults e decidir o que criptografar.
 *
 * Precedência de valores (ver `config.ts`): banco → variável de ambiente legada → default do
 * código. As chaves `env` existem só nas integrações que antes viviam no `.env` (migração inicial;
 * ver também `legacy-env.ts`). ⚠️ Integrações e campos NOVOS não declaram `env`: toda configuração
 * é feita em /integracoes.
 */

import { PUBLIC_API_SPEC_PATH } from "@/lib/public-api/paths"
import type { Schedule } from "./schedule"

export const INTEGRATION_IDS = [
    "google_auth",
    "pusher",
    "internal_api",
    "crons",
    "ai",
    "ai_opencode",
    "ai_gemini",
    "ai_anthropic",
    "ai_openai",
    "ai_deepseek",
    "ai_jev",
    "smtp",
    "storage_s3",
    "analytics_umami",
    "translation",
] as const

export type IntegrationId = (typeof INTEGRATION_IDS)[number]

/** Integrações exibidas na lista como "Em desenvolvimento" (sem configuração nem ações). */
export const IN_DEVELOPMENT_INTEGRATIONS = [
    {
        id: "opex",
        name: "Opex",
        description: "Envia as tarefas da central de feedback para o Opex",
    },
] as const satisfies readonly { id: string; name: string; description: string }[]

export type InDevelopmentIntegrationId = (typeof IN_DEVELOPMENT_INTEGRATIONS)[number]["id"]

export function getInDevelopmentIntegration(id: string) {
    return IN_DEVELOPMENT_INTEGRATIONS.find((item) => item.id === id)
}

/** A integração ainda está "Em desenvolvimento" (sem configuração; o que depende dela fica bloqueado)? */
export function isIntegrationInDevelopment(id: string): boolean {
    return getInDevelopmentIntegration(id) !== undefined
}

export type IntegrationEnvironment = "interno" | "externo"

export const INTEGRATION_ENVIRONMENT_LABELS: Record<IntegrationEnvironment, string> = {
    interno: "Interno",
    externo: "Externo",
}

/**
 * `token`: texto visível com ações Copiar e Gerar novo token (ex.: token entregue a clientes).
 * `textarea`: texto longo (até 2000 caracteres). `select`: um dos `options` em lista suspensa.
 * `segmented`: um dos `options` em botões lado a lado (poucas opções, ex.: Cluster | Host).
 */
export type PublicFieldKind = "text" | "url" | "number" | "boolean" | "token" | "textarea" | "select" | "segmented" | "cron-jobs"

/**
 * Card que desenha o campo. Sem grupo, o campo aparece em "Campos públicos"/"Campos privados".
 * `card`: campo gravado SOMENTE pela rota de um card próprio da integração — fica fora do
 * detalhe e do PATCH genérico.
 */
export type FieldGroup = "card"

/** Campos gravados só pela rota do próprio card (fora do detalhe e do PATCH genérico). */
export const isCardManagedField = (field: { group?: FieldGroup }) => field.group === "card"

export interface FieldOption {
    readonly value: string
    readonly label: string
}

/** Campo exibido (e exigido) só quando outro campo público tem o valor indicado. */
export interface FieldCondition {
    readonly field: string
    readonly equals: string
}

export type PublicFieldValue = string | number | boolean | CronJobConfig[]

export interface PublicFieldDef {
    readonly key: string
    readonly label: string
    readonly description?: string
    readonly kind: PublicFieldKind
    /** Variáveis legadas, em ordem de preferência. */
    readonly env?: readonly string[]
    readonly defaultValue?: PublicFieldValue
    readonly placeholder?: string
    readonly unit?: string
    readonly min?: number
    readonly max?: number
    readonly required?: boolean
    /** Somente `select` e `segmented`. */
    readonly options?: readonly FieldOption[]
    readonly group?: FieldGroup
    /**
     * Sem condição, o campo sempre aparece. Com condição, some da tela quando ela não vale e o
     * valor salvo é preservado (volta a valer quando a condição volta a ser verdadeira).
     */
    readonly visibleWhen?: FieldCondition
    /** Somente `url`: aceita só a origem (`esquema://host:porta`), sem caminho. */
    readonly urlOriginOnly?: boolean
    /**
     * Somente `url`: endereços do navegador para o Pusher/Soketi, um ou mais (separados por vírgula),
     * cada um com caminho opcional; o cliente usa o que combina com o host da página.
     */
    readonly pusherClientUrls?: boolean
}

export interface SecretFieldDef {
    readonly key: string
    readonly label: string
    readonly description?: string
    readonly env?: readonly string[]
    readonly required?: boolean
    readonly group?: FieldGroup
}

export interface IntegrationDef {
    readonly id: IntegrationId
    readonly name: string
    /** Uma linha, curta — a tabela trunca o excedente. */
    readonly description: string
    readonly defaultEnvironment: IntegrationEnvironment
    /**
     * Adaptador do explorador: campo público com a URL base das chamadas e autenticação injetada
     * pelo servidor. Sem adaptador, as chamadas seguem o `servers` da especificação e vão sem
     * credenciais. Ver `src/features/integrations/openapi/adapters.ts`.
     */
    readonly explorer?: ExplorerAdapterDef
    /**
     * Documentação servida pela própria aplicação: caminho relativo à URL interna. Quando
     * presente, a `swaggerUrl` é derivada automaticamente e não pode ser editada.
     */
    readonly managedSwaggerPath?: string
    /** Variáveis legadas que ligavam o debug antes desta tela. */
    readonly debugEnv?: readonly string[]
    /** Pusher não retransmite os próprios logs de debug (recursão). */
    readonly streamsDebugOverPusher: boolean
    /**
     * Integração-filha: some da lista de `/integracoes` e aparece dentro da página da mãe (ex.:
     * provedores de IA dentro de "Provedores de IA"). O voltar da página leva à mãe.
     */
    readonly parent?: IntegrationId
    readonly publicFields: readonly PublicFieldDef[]
    readonly secretFields: readonly SecretFieldDef[]
}

/** Declaração pura do adaptador; os headers são montados no servidor (`openapi/adapters.ts`). */
export interface ExplorerAdapterDef {
    /** Campo público com a URL base; `"internal"` usa a URL interna da própria aplicação. */
    readonly baseUrlField: string
    /** Usa só a origem do campo (ex.: a URL salva aponta para um endpoint específico). */
    readonly originOnly?: boolean
    /** Resumo exibido no explorador (nunca o valor da credencial). */
    readonly authLabel: string
}

/** `baseUrlField` especial: URL interna da aplicação (`getInternalBaseUrl`). */
export const EXPLORER_INTERNAL_BASE_URL = "internal"

// ---------------------------------------------------------------------------
// Crons
// ---------------------------------------------------------------------------

export type CronJobKind = "http" | "internal"

/** Escopo de varredura das rotinas internas que processam tarefas (hoje: tags de tarefas concluídas). */
export type CronJobScope = "pending" | "all"

export interface CronJobConfig {
    id: string
    label: string
    kind: CronJobKind
    /** Somente `http`: rota da própria aplicação chamada com `Bearer CRON_SECRET`. */
    path?: string
    schedule: Schedule
    enabled: boolean
    /** Somente rotinas que aceitam escolher o escopo (`jobSupportsScope`). `pending` = só o que falta/está desatualizado. */
    scope?: CronJobScope
}

export const HEALTH_CHECK_JOB_ID = "integrations-health-check"
/**
 * Limpeza do Agente Opex: arquivos do chat enviados e não usados numa mensagem em 24 h (S3 + metadados)
 * e sessões de visitantes expiradas (com mensagens, ações e arquivos).
 */
export const OPEX_FILES_CLEANUP_JOB_ID = "opex-files-cleanup"

/** Rotinas internas de uma integração ativável (id da rotina → id da integração): somem de Crons com ela desativada. */
export const INTEGRATION_CRON_JOBS: Readonly<Record<string, IntegrationId>> = {}

export function cronJobIntegration(jobId: string): IntegrationId | null {
    return INTEGRATION_CRON_JOBS[jobId] ?? null
}

/** Rotinas internas que deixam escolher o escopo (`scope`). Nenhuma no DnDicas hoje. */
const SCOPED_JOB_IDS: readonly string[] = []

export function jobSupportsScope(jobId: string): boolean {
    return SCOPED_JOB_IDS.includes(jobId)
}

/** Opções de escopo da rotina (`scope`). */
export const CRON_JOB_SCOPE_OPTIONS = [
    { value: "pending", label: "Só pendentes" },
    { value: "all", label: "Todas" },
] as const satisfies readonly { value: CronJobScope; label: string }[]

/** Rotinas padrão. */
export const DEFAULT_CRON_JOBS: CronJobConfig[] = [
    {
        id: HEALTH_CHECK_JOB_ID,
        label: "Verificação de status das integrações",
        kind: "internal",
        schedule: { type: "interval", minutes: 5 },
        enabled: true,
    },
    {
        id: OPEX_FILES_CLEANUP_JOB_ID,
        label: "Limpar arquivos pendentes e sessões de visitantes expiradas do Agente Opex",
        kind: "internal",
        schedule: { type: "interval", minutes: 60 },
        enabled: true,
    },
]

// ---------------------------------------------------------------------------
// Pusher
// ---------------------------------------------------------------------------

/** `cluster`: Pusher na nuvem. `host`: servidor próprio compatível (ex.: Soketi) por URL. */
export type PusherMode = "cluster" | "host"

export const PUSHER_MODE_OPTIONS = [
    { value: "cluster", label: "Cluster Pusher" },
    { value: "host", label: "Host próprio" },
] as const satisfies readonly FieldOption[]

// ---------------------------------------------------------------------------
// Provedores de IA
// ---------------------------------------------------------------------------

export const OPENCODE_DEFAULT_URL = "http://127.0.0.1:4096"

// ---------------------------------------------------------------------------
// Campos condicionais
// ---------------------------------------------------------------------------

/** Valor de um campo para a condição: vazio cai no default do campo controlador. */
function conditionValue(fields: readonly PublicFieldDef[], values: Record<string, unknown>, key: string): string {
    const raw = values[key]
    if (raw !== undefined && raw !== null && raw !== "") return String(raw)
    const controller = fields.find((field) => field.key === key)
    return controller?.defaultValue === undefined ? "" : String(controller.defaultValue)
}

/** O campo aparece (e vale) com os valores informados? */
export function isPublicFieldVisible(
    field: PublicFieldDef,
    fields: readonly PublicFieldDef[],
    values: Record<string, unknown>,
): boolean {
    if (!field.visibleWhen) return true
    return conditionValue(fields, values, field.visibleWhen.field) === field.visibleWhen.equals
}

/**
 * Campo condicional obrigatório que ficaria vazio com os valores informados. Só olha campos com
 * `visibleWhen` e só quando a mudança (`touched`) toca o campo ou o seu controlador — assim trocar
 * o modo sem preencher o campo exigido é recusado, sem travar edições alheias em configurações
 * antigas.
 */
export function findMissingConditionalField(
    fields: readonly PublicFieldDef[],
    values: Record<string, unknown>,
    touched: readonly string[],
): PublicFieldDef | undefined {
    return fields.find((field) => {
        if (!field.required || !field.visibleWhen) return false
        if (!touched.includes(field.key) && !touched.includes(field.visibleWhen.field)) return false
        if (!isPublicFieldVisible(field, fields, values)) return false
        const value = values[field.key]
        return value === undefined || value === null || String(value).trim() === ""
    })
}
// ---------------------------------------------------------------------------
// Analytics e tradução
// ---------------------------------------------------------------------------

export const UMAMI_DEFAULT_SCRIPT_URL = "https://analytics.nandoburgos.dev/script.js"
export const UMAMI_DEFAULT_WEBSITE_ID = "6914445b-f309-4d5a-85b3-ef9c5fc30866"

export const TRANSLATION_PROVIDER_OPTIONS = [
    { value: "ai", label: "IA (agente Importador 5etools)" },
    { value: "google", label: "Google Cloud Translation" },
    { value: "libretranslate", label: "LibreTranslate" },
] as const satisfies readonly FieldOption[]

// ---------------------------------------------------------------------------
// O catálogo
// ---------------------------------------------------------------------------

export const INTEGRATIONS: readonly IntegrationDef[] = [
    {
        id: "google_auth",
        name: "Autenticação Google",
        description: "Login com conta Google (OAuth) na tela de entrada",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        publicFields: [
            {
                key: "clientId",
                label: "Client ID",
                description: "ID do cliente OAuth 2.0 (console.cloud.google.com › APIs e serviços › Credenciais)",
                kind: "text",
                env: ["GOOGLE_CLIENT_ID"],
                required: true,
            },
        ],
        secretFields: [{ key: "clientSecret", label: "Client secret", env: ["GOOGLE_CLIENT_SECRET"], required: true }],
    },
    {
        id: "pusher",
        name: "Pusher",
        description: "Eventos em tempo real para as telas do app",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: false,
        publicFields: [
            {
                key: "mode",
                label: "Conexão",
                description: "Cluster do Pusher na nuvem ou servidor próprio compatível (ex.: Soketi)",
                kind: "segmented",
                options: PUSHER_MODE_OPTIONS,
                env: ["PUSHER_MODE"],
                defaultValue: "cluster",
                required: true,
            },
            { key: "appId", label: "App ID", kind: "text", env: ["PUSHER_APP_ID"], required: true },
            { key: "key", label: "Key", kind: "text", env: ["PUSHER_APP_KEY", "PUSHER_KEY"], required: true },
            {
                key: "cluster",
                label: "Cluster",
                kind: "text",
                env: ["PUSHER_CLUSTER"],
                defaultValue: "sa1",
                required: true,
                visibleWhen: { field: "mode", equals: "cluster" },
            },
            {
                key: "url",
                label: "URL do servidor",
                description: "Usada pelo servidor do app para publicar eventos",
                kind: "url",
                env: ["PUSHER_URL"],
                placeholder: "http://soketi:6001",
                required: true,
                urlOriginOnly: true,
                visibleWhen: { field: "mode", equals: "host" },
            },
            {
                key: "clientKey",
                label: "Key pública do cliente",
                description: "Vazio usa a mesma Key do servidor",
                kind: "text",
                env: ["PUSHER_PUBLIC_APP_KEY", "NEXT_PUBLIC_PUSHER_APP_KEY", "NEXT_PUBLIC_PUSHER_KEY"],
            },
            {
                key: "clientCluster",
                label: "Cluster público do cliente",
                description: "Vazio usa o mesmo cluster do servidor",
                kind: "text",
                env: ["PUSHER_PUBLIC_CLUSTER", "NEXT_PUBLIC_PUSHER_CLUSTER"],
                visibleWhen: { field: "mode", equals: "cluster" },
            },
            {
                key: "clientUrl",
                label: "URL pública do cliente",
                description:
                    "Usada pelo navegador; vazio usa a URL do servidor. Vários endereços separados por vírgula (ex.: IP e domínio): vale o de mesmo host da página. Aceita caminho de proxy",
                kind: "url",
                env: ["NEXT_PUBLIC_PUSHER_URL"],
                placeholder: "ws://192.168.0.64:6001, wss://dominio.com.br/prefixo/soketi",
                pusherClientUrls: true,
                visibleWhen: { field: "mode", equals: "host" },
            },
        ],
        secretFields: [{ key: "secret", label: "Secret", env: ["PUSHER_APP_SECRET", "PUSHER_SECRET"], required: true }],
    },
    {
        id: "internal_api",
        name: "API dndicas",
        description: "Documentação OpenAPI da API do app e servidor MCP do DnDicas",
        defaultEnvironment: "interno",
        explorer: { baseUrlField: EXPLORER_INTERNAL_BASE_URL, authLabel: "Sem credencial: as chamadas usam o acesso de visitante" },
        managedSwaggerPath: PUBLIC_API_SPEC_PATH,
        streamsDebugOverPusher: true,
        publicFields: [],
        secretFields: [],
    },
    {
        id: "crons",
        name: "Crons",
        description: "Rotinas agendadas executadas pelo próprio app",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [
            { key: "schedulerEnabled", label: "Agendador ativo", description: "Desligado, nenhuma rotina é disparada (inclusive a limpeza do Agente Opex); os jobs agendados pelos usuários no Agente Opex continuam rodando", kind: "boolean", defaultValue: true },
            {
                key: "internalBaseUrl",
                label: "URL base interna",
                description: "Vazio usa http://127.0.0.1 na porta do processo",
                kind: "url",
                placeholder: "http://127.0.0.1:4005",
            },
            { key: "jobs", label: "Rotinas", kind: "cron-jobs", defaultValue: DEFAULT_CRON_JOBS },
        ],
        secretFields: [{ key: "cronSecret", label: "Cron secret", description: "Bearer exigido pelas rotas /api/routines/*", env: ["CRON_SECRET"], required: true }],
    },
    {
        id: "ai",
        name: "Provedores de IA",
        description: "Provedores de IA (OpenCode, Gemini, Anthropic, OpenAI, DeepSeek, JEV) e os agentes do app que os usam",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        publicFields: [],
        secretFields: [],
    },
    {
        id: "ai_opencode",
        name: "OpenCode",
        description: "Servidor OpenCode 2.x: modelos e agentes das suas contas e assinaturas",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [
            {
                key: "baseUrl",
                label: "URL do servidor",
                description: "Endereço do opencode serve (2.x) que o servidor do app alcança. Em Docker, use o IP do host, não 127.0.0.1",
                kind: "url",
                placeholder: OPENCODE_DEFAULT_URL,
                required: true,
                urlOriginOnly: true,
            },
            {
                key: "directory",
                label: "Diretório das sessões",
                description: "Pasta (na máquina do OpenCode, precisa existir) em que as sessões do app são criadas; vazio usa a do servidor",
                kind: "text",
                placeholder: "/home/usuario/dndicas-ia",
            },
        ],
        secretFields: [
            {
                key: "password",
                label: "Senha do servidor",
                description: "OPENCODE_PASSWORD do opencode serve (usuário opencode, autenticação Basic)",
                required: true,
            },
        ],
    },
    {
        id: "ai_gemini",
        name: "Gemini",
        description: "Modelos Google Gemini pela API do Google AI Studio",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave do Google AI Studio (aistudio.google.com/apikey)", env: ["GOOGLE_API_KEY"], required: true }],
    },
    {
        id: "ai_anthropic",
        name: "Anthropic",
        description: "Modelos Claude pela API da Anthropic",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave do Claude Console (platform.claude.com/settings/keys)", required: true }],
    },
    {
        id: "ai_openai",
        name: "OpenAI",
        description: "Modelos GPT e da série o pela API da OpenAI",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave da plataforma OpenAI (platform.openai.com/api-keys)", required: true }],
    },
    {
        id: "ai_deepseek",
        name: "DeepSeek",
        description: "Modelos DeepSeek pela API da DeepSeek",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave da plataforma DeepSeek (platform.deepseek.com/api_keys)", required: true }],
    },
    {
        id: "ai_jev",
        name: "JEV",
        description: "Modelo TypeSafe (JEV) de decisão estruturada, não de geração de texto",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        parent: "ai",
        publicFields: [],
        secretFields: [{ key: "apiKey", label: "API key", description: "Chave da TypeSafe (console.typesafe.ai/keys)", required: true }],
    },
    {
        id: "smtp",
        name: "SMTP",
        description: "Envio de e-mails transacionais",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [
            { key: "host", label: "Host", kind: "text", env: ["SMTP_HOST"], required: true },
            { key: "port", label: "Porta", kind: "number", env: ["SMTP_PORT"], defaultValue: 587, min: 1, max: 65535, required: true },
            { key: "user", label: "Usuário", kind: "text", env: ["SMTP_USER"] },
            { key: "from", label: "Remetente", kind: "text", env: ["SMTP_FROM"], placeholder: "DnDicas <nao-responda@exemplo.com>" },
        ],
        secretFields: [{ key: "password", label: "Senha", env: ["SMTP_PASS"] }],
    },
    {
        id: "storage_s3",
        name: "Storage S3",
        description: "Armazenamento de arquivos em MinIO/S3 compatível",
        defaultEnvironment: "interno",
        streamsDebugOverPusher: true,
        publicFields: [
            { key: "endpoint", label: "Endpoint", kind: "url", env: ["S3_ENDPOINT"], required: true },
            {
                key: "publicEndpoint",
                label: "Endpoint público (navegador)",
                kind: "url",
                placeholder: "http://localhost:9000",
                description:
                    "Endereço do storage visto pelo navegador, usado nas URLs assinadas de upload e mídia. Preencha quando o Endpoint for um nome interno (ex.: container Docker). Vazio = usa o Endpoint.",
            },
            { key: "region", label: "Região", kind: "text", env: ["S3_REGION"], defaultValue: "us-east-1", required: true },
            { key: "bucket", label: "Bucket", kind: "text", env: ["S3_BUCKET"], defaultValue: "default", required: true },
            { key: "signedUrlExpiresSeconds", label: "Expiração da URL assinada", kind: "number", unit: "s", defaultValue: 3600, min: 60, max: 604_800 },
        ],
        secretFields: [
            { key: "accessKey", label: "Access key", env: ["S3_ACCESS_KEY"], required: true },
            { key: "secretKey", label: "Secret key", env: ["S3_SECRET_KEY"], required: true },
        ],
    },
    {
        id: "analytics_umami",
        name: "Analytics (Umami)",
        description: "Script de métricas de acesso carregado em todas as páginas",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        publicFields: [
            { key: "active", label: "Integração ativa", description: "Desativada, o script do Umami não é carregado", kind: "boolean", defaultValue: true },
            { key: "scriptUrl", label: "URL do script", kind: "url", defaultValue: UMAMI_DEFAULT_SCRIPT_URL, placeholder: UMAMI_DEFAULT_SCRIPT_URL, required: true },
            { key: "websiteId", label: "Website ID", kind: "text", defaultValue: UMAMI_DEFAULT_WEBSITE_ID, required: true },
        ],
        secretFields: [],
    },
    {
        id: "translation",
        name: "Tradução",
        description: "Tradutores usados pela importação do 5etools e pelos scripts de seed",
        defaultEnvironment: "externo",
        streamsDebugOverPusher: true,
        publicFields: [
            {
                key: "provider",
                label: "Tradutor padrão",
                description: "Usado pelos scripts de seed quando nenhum tradutor é informado na linha de comando",
                kind: "select",
                options: TRANSLATION_PROVIDER_OPTIONS,
                defaultValue: "ai",
                required: true,
            },
            {
                key: "libretranslateUrl",
                label: "URL do LibreTranslate",
                description: "Vazio usa o servidor local iniciado pelos scripts (http://127.0.0.1 na porta abaixo)",
                kind: "url",
                env: ["LIBRETRANSLATE_URL"],
                placeholder: "http://127.0.0.1:5000",
            },
            { key: "libretranslatePort", label: "Porta do LibreTranslate local", kind: "number", env: ["LIBRETRANSLATE_PORT"], defaultValue: 5000, min: 1, max: 65535 },
        ],
        secretFields: [
            { key: "googleApiKey", label: "API key do Google Cloud Translation", env: ["GOOGLE_CLOUD_TRANSLATION_API_KEY"] },
            { key: "libretranslateApiKey", label: "API key do LibreTranslate", env: ["LIBRETRANSLATE_API_KEY"] },
        ],
    },
]

const BY_ID = new Map<string, IntegrationDef>(INTEGRATIONS.map((def) => [def.id, def]))

export function isIntegrationId(value: string): value is IntegrationId {
    return BY_ID.has(value)
}

export function getIntegrationDef(id: IntegrationId): IntegrationDef
export function getIntegrationDef(id: string): IntegrationDef | undefined
export function getIntegrationDef(id: string): IntegrationDef | undefined {
    return BY_ID.get(id)
}

/** Descrição do campo "Documentação Swagger (OpenAPI)", comum a todas as integrações. */
export const SWAGGER_URL_DESCRIPTION =
    "URL de uma documentação OpenAPI 3.x (JSON): a especificação (ex.: /openapi.json) ou a página do Swagger UI que a publica (ex.: /docs). Outros formatos não são aceitos."

export const INTEGRATIONS_BASE_PATH = "/integracoes"

/** Rotas próprias (fora de `/integracoes/[id]`). */
const CUSTOM_PATHS: Partial<Record<IntegrationId, string>> = {
    ai: `${INTEGRATIONS_BASE_PATH}/ia`,
    ai_opencode: `${INTEGRATIONS_BASE_PATH}/ia/opencode`,
    ai_gemini: `${INTEGRATIONS_BASE_PATH}/ia/gemini`,
    ai_anthropic: `${INTEGRATIONS_BASE_PATH}/ia/anthropic`,
    ai_openai: `${INTEGRATIONS_BASE_PATH}/ia/openai`,
    ai_deepseek: `${INTEGRATIONS_BASE_PATH}/ia/deepseek`,
    ai_jev: `${INTEGRATIONS_BASE_PATH}/ia/jev`,
}

export function integrationPath(id: IntegrationId): string {
    return CUSTOM_PATHS[id] ?? `${INTEGRATIONS_BASE_PATH}/${id}`
}

/** A integração tem rota própria (a página genérica `/integracoes/[id]` redireciona para ela). */
export function hasCustomIntegrationPath(id: IntegrationId): boolean {
    return CUSTOM_PATHS[id] !== undefined
}

export function integrationDebugChannel(id: IntegrationId): string {
    return `private-integration-${id}`
}

export const INTEGRATION_DEBUG_EVENT = "debug-log"

/**
 * Início/fim de um teste de conexão (manual ou automático), no mesmo canal privado do debug —
 * só ids do catálogo são autorizados (`channel-auth.ts`). Payload: `IntegrationStatusEvent`.
 */
export const INTEGRATION_STATUS_EVENT = "status-updated"

