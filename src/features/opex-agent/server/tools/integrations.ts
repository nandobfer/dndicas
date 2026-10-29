import { z } from "zod"
import { INTEGRATION_IDS, getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { getIntegrationDetail, IntegrationUpdateError, listIntegrations, updateIntegration } from "@/features/integrations/services/integration-service"
import { runIntegrationTest } from "@/features/integrations/services/integration-test-runner"
import { buildIntegrationUpdateSchema, type IntegrationUpdateInput } from "@/features/integrations/schemas/integration.schema"
import { runJobNow } from "@/features/integrations/scheduler/cron-scheduler"
import { defineTool, OpexToolError } from "./define"
import { parseJsonObject } from "./json"

const integrationId = z.enum(INTEGRATION_IDS).describe("Id da integração (de list_integrations)")
const SECRET_REDACTED = "[segredo omitido]"

/** Erros de validação/regra da integração viram mensagens para o modelo. */
async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run()
    } catch (error) {
        if (error instanceof IntegrationUpdateError) throw new OpexToolError(error.message)
        throw error
    }
}

function fieldsOf(id: IntegrationId) {
    const def = getIntegrationDef(id)
    return {
        publicFields: def.publicFields.map((field) => ({ key: field.key, label: field.label, kind: field.kind, description: field.description ?? null, options: field.options ?? null, cardManaged: field.group === "card" })),
        secretFields: def.secretFields.map((field) => ({ key: field.key, label: field.label, description: field.description ?? null, cardManaged: field.group === "card" })),
    }
}

const updateInput = z.object({
    id: integrationId,
    publicValuesJson: z.string().optional().describe('Objeto JSON com os campos públicos a alterar (chave → valor), ex.: {"internalBaseUrl": "http://localhost:4005"}'),
    secrets: z
        .array(z.object({ key: z.string(), value: z.string().nullable().describe("null limpa o segredo") }))
        .optional()
        .describe("Segredos a gravar (nunca são lidos de volta)"),
    environment: z.enum(["interno", "externo"]).optional(),
    debugMode: z.boolean().optional(),
})

export const integrationTools = [
    defineTool({
        name: "list_integrations",
        group: "integrations",
        minRole: "admin",
        permission: "integrations.access",
        label: "Listar integrações",
        risk: "read",
        description: "Integrações do app com situação (configurada, saúde do último teste, modo debug).",
        input: z.object({}),
        execute: async () => listIntegrations(),
    }),
    defineTool({
        name: "get_integration",
        group: "integrations",
        minRole: "admin",
        permissionFor: ({ id }) => `integrations.${id}.view`,
        label: "Ler integração",
        risk: "read",
        description: "Configuração de uma integração: valores públicos, quais segredos estão definidos (nunca o valor), saúde e a definição dos campos (chaves e tipos para update_integration).",
        input: z.object({ id: integrationId }),
        execute: async ({ id }) => ({ ...(await getIntegrationDetail(id)), fields: fieldsOf(id) }),
    }),
    defineTool({
        name: "update_integration",
        group: "integrations",
        minRole: "admin",
        permissionFor: ({ id }) => `integrations.${id}.edit`,
        label: "Configurar integração",
        risk: "destructive",
        description:
            "Altera campos públicos, segredos (gravar ou limpar), ambiente ou modo debug de uma integração. Os campos são validados pela definição da integração (veja get_integration). Os crons ficam no campo `jobs` da integração `crons`.",
        input: updateInput,
        summarize: (input) => {
            const parts = [
                input.publicValuesJson ? "campos públicos" : null,
                input.secrets?.length ? `segredos (${input.secrets.map((secret) => secret.key).join(", ")})` : null,
                input.environment ? "ambiente" : null,
                input.debugMode !== undefined ? "modo debug" : null,
            ].filter(Boolean)
            return `Alterar ${parts.join(", ") || "a configuração"} da integração ${getIntegrationDef(input.id).name}`
        },
        redact: (input) => ({ ...input, secrets: input.secrets?.map((secret) => ({ key: secret.key, value: secret.value === null ? null : SECRET_REDACTED })) }),
        execute: async (input, context) => {
            const body: IntegrationUpdateInput = {
                ...(input.environment ? { environment: input.environment } : {}),
                ...(input.debugMode !== undefined ? { debugMode: input.debugMode } : {}),
                ...(input.publicValuesJson ? { publicValues: parseJsonObject(input.publicValuesJson, "publicValuesJson") } : {}),
                ...(input.secrets?.length
                    ? { secrets: Object.fromEntries(input.secrets.map((secret) => [secret.key, secret.value === null ? { action: "clear" as const } : { action: "set" as const, value: secret.value }])) }
                    : {}),
            }
            const parsed = buildIntegrationUpdateSchema(getIntegrationDef(input.id)).parse(body)
            const detail = await guard(() => updateIntegration(input.id, parsed as IntegrationUpdateInput, context.actorId))
            return { ok: true, publicValues: detail.publicValues, secrets: detail.secrets, health: detail.health }
        },
    }),
    defineTool({
        name: "test_integration",
        group: "integrations",
        minRole: "admin",
        permissionFor: ({ id }) => `integrations.${id}.test`,
        label: "Testar integração",
        risk: "read",
        description: "Executa o teste de conexão da integração e devolve o resultado com o log do teste.",
        input: z.object({ id: integrationId }),
        execute: async ({ id }, context) => {
            const logs: string[] = []
            const result = await runIntegrationTest(id, { source: "manual", signal: context.signal, emit: (level, message) => void logs.push(`[${level}] ${message}`) })
            return { ...result, logs: logs.slice(-40) }
        },
    }),
    defineTool({
        name: "list_routines",
        group: "routines",
        minRole: "admin",
        permission: "integrations.crons.view",
        label: "Listar rotinas",
        risk: "read",
        description: "Rotinas (crons) do agendador interno: configuração (id, agenda, ativa) e estado (última e próxima execução). Para alterar, use update_integration na integração `crons` (campo `jobs`, a lista inteira).",
        input: z.object({}),
        execute: async () => {
            const [config, detail] = await Promise.all([getIntegrationConfig("crons"), getIntegrationDetail("crons")])
            // O `cronSecret` (segredo) nunca sai daqui: só a agenda e o estado das rotinas.
            return { schedulerEnabled: config.schedulerEnabled, jobs: config.jobs, states: detail.cronStates ?? [] }
        },
    }),
    defineTool({
        name: "run_routine",
        group: "routines",
        minRole: "admin",
        permission: "integrations.crons.edit",
        label: "Rodar rotina",
        risk: "write",
        description: "Executa agora uma rotina salva (não muda a próxima execução agendada).",
        input: z.object({ jobId: z.string() }),
        summarize: (input) => `Executar agora a rotina ${input.jobId}`,
        execute: async ({ jobId }, context) => {
            let result: Awaited<ReturnType<typeof runJobNow>>
            try {
                result = await runJobNow(jobId)
            } catch (error) {
                throw new OpexToolError(error instanceof Error ? error.message : String(error))
            }
            await recordAudit({
                userId: context.actorId,
                entidade: "Integracao",
                entidadeId: "crons",
                acao: AcaoAuditoria.ATUALIZAR,
                depois: { execucaoManual: jobId, resultado: result.ok ? "ok" : "erro", mensagem: result.message, duracaoMs: result.durationMs, via: "opex" },
            })
            return result
        },
    }),
]
