import { z } from "zod"
import { isCardManagedField, type IntegrationDef, type PublicFieldDef } from "@/lib/integrations/catalog"
import { validateSchedule, type Schedule } from "@/lib/integrations/schedule"
import { isValidPusherClientUrls, isValidPusherUrl } from "@/lib/pusher/url"

/**
 * Validação do PATCH de uma integração, montada a partir do catálogo: cada
 * integração só aceita os próprios campos. Mensagens em pt-BR.
 */

const TIME = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Horário inválido (HH:mm)")

export const scheduleSchema: z.ZodType<Schedule> = z
    .discriminatedUnion("type", [
        z.object({ type: z.literal("interval"), minutes: z.number().int() }),
        z.object({ type: z.literal("daily"), time: TIME }),
        z.object({ type: z.literal("weekly"), days: z.array(z.number().int()), time: TIME }),
        z.object({ type: z.literal("monthly"), day: z.number().int(), time: TIME }),
    ])
    .superRefine((schedule, ctx) => {
        const error = validateSchedule(schedule)
        if (error) ctx.addIssue({ code: "custom", message: error })
    })

const JOB_ID = z
    .string()
    .trim()
    .min(1, "Informe o identificador da rotina")
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use apenas letras minúsculas, números e hífen no identificador")

export const cronJobSchema = z
    .object({
        id: JOB_ID,
        label: z.string().trim().min(1, "Informe o nome da rotina").max(120),
        kind: z.enum(["http", "internal"]),
        path: z.string().trim().optional(),
        schedule: scheduleSchema,
        enabled: z.boolean(),
        scope: z.enum(["pending", "all"]).optional(),
    })
    .superRefine((job, ctx) => {
        if (job.kind === "http" && (!job.path || !job.path.startsWith("/api/"))) {
            ctx.addIssue({ code: "custom", path: ["path"], message: "O caminho deve começar com /api/" })
        }
    })

export const cronJobsSchema = z.array(cronJobSchema).superRefine((jobs, ctx) => {
    const seen = new Set<string>()
    for (const [index, job] of jobs.entries()) {
        if (seen.has(job.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: `Rotina "${job.id}" duplicada` })
        seen.add(job.id)
    }
})

function publicFieldSchema(field: PublicFieldDef): z.ZodTypeAny {
    switch (field.kind) {
        case "number": {
            let schema = z.number({ message: `${field.label}: informe um número` })
            if (field.min !== undefined) schema = schema.min(field.min, `${field.label}: mínimo ${field.min}`)
            if (field.max !== undefined) schema = schema.max(field.max, `${field.label}: máximo ${field.max}`)
            return schema
        }
        case "boolean":
            return z.boolean()
        case "cron-jobs":
            return cronJobsSchema
        case "url":
            if (field.pusherClientUrls) {
                return z
                    .string()
                    .trim()
                    .max(500)
                    .refine(
                        (value) => value === "" || isValidPusherClientUrls(value),
                        `${field.label}: informe um ou mais endereços ws(s)/http(s) separados por vírgula (ex.: ws://host:6001, wss://dominio/soketi)`,
                    )
            }
            return z
                .string()
                .trim()
                .max(500)
                .refine((value) => value === "" || /^(https?|wss?):\/\/[^\s]+$/i.test(value), `${field.label}: URL inválida`)
                .refine(
                    (value) => value === "" || !field.urlOriginOnly || isValidPusherUrl(value),
                    `${field.label}: informe só esquema, host e porta (ex.: wss://host:443), sem caminho`,
                )
        case "textarea":
            return z.string().trim().max(2000, `${field.label}: máximo de 2000 caracteres`)
        case "select":
        case "segmented": {
            const values = (field.options ?? []).map((option) => option.value)
            return z.string().refine((value) => values.includes(value), `${field.label}: opção inválida`)
        }
        case "token":
            return z
                .string()
                .trim()
                .max(500, `${field.label}: máximo de 500 caracteres`)
        default:
            return z.string().trim().max(500, `${field.label}: máximo de 500 caracteres`)
    }
}

/**
 * "Documentação Swagger (OpenAPI)": opcional, http(s). Vazio limpa. O conteúdo (OpenAPI 3.x) só
 * é verificado ao explorar — salvar não depende da documentação estar no ar.
 */
export const swaggerUrlSchema = z
    .string()
    .trim()
    .max(2000, "Documentação Swagger: máximo de 2000 caracteres")
    .refine((value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value), "Documentação Swagger: informe uma URL http(s) válida")

export const secretActionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("set"), value: z.string().min(1, "Informe o novo valor").max(4000) }),
    z.object({ action: z.literal("clear") }),
])

export type SecretAction = z.infer<typeof secretActionSchema>

export function buildIntegrationUpdateSchema(def: IntegrationDef) {
    const publicShape: Record<string, z.ZodTypeAny> = {}
    // Campos de card próprio (ex.: leitura e digitando) têm rota e permissão próprias.
    for (const field of def.publicFields) if (!isCardManagedField(field)) publicShape[field.key] = publicFieldSchema(field).optional()

    const secretShape: Record<string, z.ZodTypeAny> = {}
    for (const field of def.secretFields) if (!isCardManagedField(field)) secretShape[field.key] = secretActionSchema.optional()

    return z
        .object({
            environment: z.enum(["interno", "externo"]).optional(),
            debugMode: z.boolean().optional(),
            swaggerUrl: swaggerUrlSchema.optional(),
            publicValues: z.object(publicShape).strict().optional(),
            secrets: z.object(secretShape).strict().optional(),
        })
        .strict()
}

export interface IntegrationUpdateInput {
    environment?: "interno" | "externo"
    debugMode?: boolean
    /** `""` limpa. */
    swaggerUrl?: string
    publicValues?: Record<string, unknown>
    secrets?: Record<string, SecretAction | undefined>
}
