import { createHash } from "crypto"
import { appendBasePath } from "@/lib/base-path"
import { logger } from "@/lib/logger"
import { decryptSecret, isEncryptedSecret } from "@/lib/crypto/secretBox"
import {
    DEFAULT_CRON_JOBS,
    getIntegrationDef,
    isPublicFieldVisible,
    type CronJobConfig,
    type IntegrationDef,
    type IntegrationEnvironment,
    type IntegrationId,
    type PublicFieldDef,
    type PublicFieldValue,
} from "./catalog"
import { readLegacyEnv } from "./legacy-env"
import { loadStoredIntegration, type StoredIntegration } from "./store"

/**
 * Resolvedor de configuração das integrações — SOMENTE servidor.
 *
 * Precedência por campo: valor no banco → variável de ambiente legada → default do código.
 * Segredos: valor criptografado no banco (descriptografado aqui) → `.env`. Um segredo
 * limpo explicitamente (`null` no banco) NÃO cai no `.env`: limpar significa desligar.
 */

export interface IntegrationConfigMap {
    perfix: Record<string, never>
    opex: { baseUrl?: string; internalUrl?: string; clientToken?: string }
    google_auth: { clientId?: string; clientSecret?: string }
    pusher: {
        /** `cluster` (Pusher na nuvem) ou `host` (servidor próprio, ex.: Soketi). */
        mode: string
        appId?: string
        key?: string
        cluster: string
        url?: string
        clientKey?: string
        clientCluster?: string
        clientUrl?: string
        secret?: string
    }
    internal_api: Record<string, never>
    crons: { schedulerEnabled: boolean; internalBaseUrl?: string; jobs: CronJobConfig[]; cronSecret?: string }
    ai: Record<string, never>
    ai_opencode: { baseUrl?: string; directory?: string; password?: string }
    ai_gemini: { apiKey?: string }
    ai_anthropic: { apiKey?: string }
    ai_openai: { apiKey?: string }
    ai_deepseek: { apiKey?: string }
    ai_jev: { apiKey?: string }
    smtp: { host?: string; port: number; user?: string; from?: string; password?: string }
    storage_s3: {
        endpoint?: string
        publicEndpoint?: string
        region: string
        bucket: string
        signedUrlExpiresSeconds: number
        accessKey?: string
        secretKey?: string
    }
    analytics_umami: { active: boolean; scriptUrl: string; websiteId: string }
    translation: {
        provider: string
        libretranslateUrl?: string
        libretranslatePort: number
        googleApiKey?: string
        libretranslateApiKey?: string
    }
}

export type SecretSource = "db" | "env" | "none"

export interface ResolvedIntegration<Id extends IntegrationId = IntegrationId> {
    id: Id
    environment: IntegrationEnvironment
    debugMode: boolean
    /** Documentação Swagger (OpenAPI 3.x) cadastrada; sem fallback do `.env`. */
    swaggerUrl?: string
    values: IntegrationConfigMap[Id]
    /** Hash dos valores efetivos. Singletons se reconstroem quando ele muda. */
    version: string
    /** De onde veio cada segredo — a tela mostra sem nunca devolver o valor. */
    secretSources: Record<string, SecretSource>
    /** Segredos que existem no banco mas não puderam ser descriptografados. */
    secretErrors: string[]
    stored: boolean
}

function readEnv(names: readonly string[] | undefined): string | undefined {
    return readLegacyEnv(names)
}

function envFlag(names: readonly string[] | undefined): boolean {
    const value = readEnv(names)?.toLowerCase()
    return value === "true" || value === "1"
}

export function coercePublicValue(field: PublicFieldDef, raw: unknown): PublicFieldValue | undefined {
    if (raw === undefined || raw === null) return undefined
    switch (field.kind) {
        case "number": {
            const n = typeof raw === "number" ? raw : Number(String(raw).trim())
            return Number.isFinite(n) ? n : undefined
        }
        case "boolean":
            if (typeof raw === "boolean") return raw
            return ["true", "1"].includes(String(raw).trim().toLowerCase())
        case "cron-jobs":
            return Array.isArray(raw) ? (raw as CronJobConfig[]) : undefined
        default: {
            const s = String(raw).trim()
            return s === "" ? undefined : s
        }
    }
}

/**
 * Rotinas internas são do código (não se criam nem se removem na tela, só se ligam/desligam):
 * as que faltam na lista salva entram com o padrão, para uma rotina nova aparecer também em quem
 * já salvou os Crons.
 */
export function withBuiltInJobs(jobs: unknown): CronJobConfig[] {
    if (!Array.isArray(jobs)) return DEFAULT_CRON_JOBS
    const saved = jobs as CronJobConfig[]
    const missing = DEFAULT_CRON_JOBS.filter((job) => job.kind === "internal" && !saved.some((item) => item.id === job.id))
    return missing.length ? [...saved, ...missing] : saved
}

/** Valor efetivo de um campo público, com a precedência banco → env → default. */
export function resolvePublicField(field: PublicFieldDef, stored: StoredIntegration | null): PublicFieldValue | undefined {
    if (stored && Object.prototype.hasOwnProperty.call(stored.publicValues ?? {}, field.key)) {
        const fromDb = coercePublicValue(field, stored.publicValues[field.key])
        // Campo salvo vazio: respeita o vazio, exceto quando há default (ex.: URL da API).
        return fromDb ?? (field.defaultValue as PublicFieldValue | undefined)
    }
    const fromEnv = coercePublicValue(field, readEnv(field.env))
    if (fromEnv !== undefined) return fromEnv
    return field.defaultValue
}

function resolveSecret(
    key: string,
    env: readonly string[] | undefined,
    stored: StoredIntegration | null,
    integrationId: string,
    errors: string[],
): { value?: string; source: SecretSource } {
    const secretValues = stored?.secretValues ?? {}
    if (stored && Object.prototype.hasOwnProperty.call(secretValues, key)) {
        const box = secretValues[key]
        if (box === null) return { source: "none" }
        if (isEncryptedSecret(box)) {
            try {
                return { value: decryptSecret(box), source: "db" }
            } catch (error) {
                errors.push(key)
                logger.error(
                    { integrationId, key, err: error instanceof Error ? error.message : error },
                    "[integrations] Falha ao descriptografar segredo; usando fallback do .env",
                )
            }
        }
    }
    const fromEnv = readEnv(env)
    return fromEnv ? { value: fromEnv, source: "env" } : { source: "none" }
}

export function buildResolvedIntegration<Id extends IntegrationId>(
    def: IntegrationDef,
    stored: StoredIntegration | null,
): ResolvedIntegration<Id> {
    const values: Record<string, unknown> = {}
    for (const field of def.publicFields) values[field.key] = resolvePublicField(field, stored)

    const secretSources: Record<string, SecretSource> = {}
    const secretErrors: string[] = []
    for (const field of def.secretFields) {
        const { value, source } = resolveSecret(field.key, field.env, stored, def.id, secretErrors)
        values[field.key] = value
        secretSources[field.key] = source
    }

    if (def.id === "crons") values.jobs = withBuiltInJobs(values.jobs)

    const environment = stored?.environment ?? def.defaultEnvironment
    const debugMode = stored ? stored.debugMode === true : envFlag(def.debugEnv)
    const version = createHash("sha1")
        .update(JSON.stringify([environment, debugMode, values]))
        .digest("hex")
        .slice(0, 12)

    return {
        id: def.id as Id,
        environment,
        debugMode,
        swaggerUrl: stored?.swaggerUrl?.trim() || undefined,
        values: values as unknown as IntegrationConfigMap[Id],
        version,
        secretSources,
        secretErrors,
        stored: stored !== null,
    }
}

/**
 * Todos os campos obrigatórios preenchidos (públicos visíveis fora de card e segredos legíveis)?
 * Não diz se a conexão funciona — isso é o status do teste.
 */
export function isIntegrationConfigured(def: IntegrationDef, resolved: Pick<ResolvedIntegration, "values" | "secretSources" | "secretErrors">): boolean {
    const values = resolved.values as unknown as Record<string, unknown>
    const publicOk = def.publicFields.every((field) => {
        if (!field.required || field.group || !isPublicFieldVisible(field, def.publicFields, values)) return true
        const value = values[field.key]
        return value !== undefined && value !== null && String(value).trim() !== ""
    })
    const secretsOk = def.secretFields.every(
        (field) => !field.required || field.group || (resolved.secretSources[field.key] !== "none" && !resolved.secretErrors.includes(field.key)),
    )
    return publicOk && secretsOk
}

async function safeLoad(id: IntegrationId): Promise<StoredIntegration | null> {
    try {
        return await loadStoredIntegration(id)
    } catch (error) {
        // Banco indisponível não pode derrubar a integração: o .env continua valendo.
        logger.warn(
            { integrationId: id, err: error instanceof Error ? error.message : error },
            "[integrations] Configuração do banco indisponível; usando .env",
        )
        return null
    }
}

export async function getIntegration<Id extends IntegrationId>(id: Id): Promise<ResolvedIntegration<Id>> {
    const def = getIntegrationDef(id)
    const resolved = buildResolvedIntegration<Id>(def, await safeLoad(id))
    const managed = await managedSwaggerUrl(def)
    return managed ? { ...resolved, swaggerUrl: managed } : resolved
}

/**
 * Documentação servida pela própria aplicação (`managedSwaggerPath`): URL interna +
 * caminho. Sobrepõe qualquer valor salvo; `undefined` para as demais integrações.
 */
export async function managedSwaggerUrl(def: IntegrationDef): Promise<string | undefined> {
    if (!def.managedSwaggerPath) return undefined
    return `${await getInternalBaseUrl()}${def.managedSwaggerPath}`
}

export async function getIntegrationConfig<Id extends IntegrationId>(id: Id): Promise<IntegrationConfigMap[Id]> {
    return (await getIntegration(id)).values
}

/** URL padrão para o servidor chamar a si mesmo: a porta do processo (Docker define `PORT`). */
export function defaultInternalBaseUrl(): string {
    return `http://127.0.0.1:${process.env.PORT?.trim() || "4005"}`
}

/**
 * URL para o servidor chamar a si mesmo (crons e teste da API interna), já com o subcaminho
 * público (`basePath`): os chamadores só acrescentam `/api/...`.
 */
export async function getInternalBaseUrl(): Promise<string> {
    const { internalBaseUrl } = await getIntegrationConfig("crons")
    return appendBasePath(internalBaseUrl?.trim() || defaultInternalBaseUrl())
}
