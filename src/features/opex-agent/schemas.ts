import { z } from "zod"
import {
    DEFAULT_OPEX_INSTRUCTIONS,
    DEFAULT_OPEX_TITLE_INSTRUCTIONS,
    OPEX_FILE_SIZE_MB_DEFAULT,
    OPEX_FILE_SIZE_MB_MAX,
    OPEX_FILES_PER_MESSAGE_DEFAULT,
    OPEX_FILES_PER_MESSAGE_MAX,
    OPEX_ANONYMOUS_SESSION_TTL_DAYS_DEFAULT,
    OPEX_ANONYMOUS_SESSION_TTL_DAYS_MAX,
    OPEX_ANONYMOUS_TURNS_PER_HOUR_DEFAULT,
    OPEX_ANONYMOUS_TURNS_PER_HOUR_MAX,
    OPEX_MESSAGE_MAX,
    OPEX_PROVIDER_IDS,
    OPEX_TITLE_MAX,
} from "./constants"

const providerFields = {
    provider: z.enum(OPEX_PROVIDER_IDS).nullable(),
    model: z.string().trim().max(200).nullable(),
    variant: z.string().trim().max(50).nullable(),
}

/** Provedor do agente principal (com amostragem). */
export const opexMainModelSchema = z.object({
    ...providerFields,
    temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
    maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
})

/** Provedor do subagente de título e resumo (sem provedor = usa o do agente principal). */
export const opexTitleModelSchema = z.object(providerFields)

/** Limites dos arquivos enviados no chat. */
export const opexFilesSettingsSchema = z.object({
    maxPerMessage: z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(1, "Mínimo 1")
        .max(OPEX_FILES_PER_MESSAGE_MAX, `Máximo ${OPEX_FILES_PER_MESSAGE_MAX}`),
    maxSizeMb: z
        .number({ error: "Informe um número" })
        .min(0.1, "Mínimo 0,1 MB")
        .max(OPEX_FILE_SIZE_MB_MAX, `Máximo ${OPEX_FILE_SIZE_MB_MAX} MB`),
})
export type OpexFilesSettings = z.infer<typeof opexFilesSettingsSchema>

/**
 * Visitantes anônimos: liga/desliga o agente para quem não está logado, limita os turnos por hora (por
 * visitante e por IP) e define em quantos dias as sessões deles expiram.
 */
const turnsPerHour = z
    .number({ error: "Informe um número" })
    .int("Use um número inteiro")
    .min(1, "Mínimo 1")
    .max(OPEX_ANONYMOUS_TURNS_PER_HOUR_MAX, `Máximo ${OPEX_ANONYMOUS_TURNS_PER_HOUR_MAX}`)

export const opexAnonymousSettingsSchema = z.object({
    enabled: z.boolean(),
    turnsPerHourPerVisitor: turnsPerHour,
    turnsPerHourPerIp: turnsPerHour,
    sessionTtlDays: z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(1, "Mínimo 1 dia")
        .max(OPEX_ANONYMOUS_SESSION_TTL_DAYS_MAX, `Máximo ${OPEX_ANONYMOUS_SESSION_TTL_DAYS_MAX} dias`),
})
export type OpexAnonymousSettings = z.infer<typeof opexAnonymousSettingsSchema>

export const DEFAULT_OPEX_ANONYMOUS_SETTINGS: OpexAnonymousSettings = {
    enabled: true,
    turnsPerHourPerVisitor: OPEX_ANONYMOUS_TURNS_PER_HOUR_DEFAULT,
    turnsPerHourPerIp: OPEX_ANONYMOUS_TURNS_PER_HOUR_DEFAULT * 3,
    sessionTtlDays: OPEX_ANONYMOUS_SESSION_TTL_DAYS_DEFAULT,
}

/** Configuração do Agente Opex — mesmo schema na tela e na API. */
export const opexAgentSettingsSchema = z
    .object({
        enabled: z.boolean(),
        main: opexMainModelSchema,
        title: opexTitleModelSchema,
        instructions: z.string().trim().min(1, "Informe as instruções").max(12_000, "Até 12.000 caracteres"),
        titleInstructions: z.string().trim().min(1, "Informe as instruções").max(4000, "Até 4.000 caracteres"),
        /** Ferramentas **desligadas** (a nova nasce ligada); nomes conferidos no catálogo no servidor. */
        disabledTools: z.array(z.string().trim().min(1).max(64)).max(300),
        /** Ajuste por ferramenta (pede ou não confirmação); ausente = padrão pelo risco (só destrutivas). */
        confirmationOverrides: z.record(z.string().trim().min(1).max(64), z.boolean()),
        files: opexFilesSettingsSchema,
        anonymous: opexAnonymousSettingsSchema,
    })
    .superRefine((value, ctx) => {
        if (value.title.provider && !value.title.model) ctx.addIssue({ code: "custom", path: ["title", "model"], message: "Selecione o modelo" })
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })

export type OpexAgentSettings = z.infer<typeof opexAgentSettingsSchema>
export type OpexMainModel = z.infer<typeof opexMainModelSchema>
export type OpexTitleModel = z.infer<typeof opexTitleModelSchema>

export const DEFAULT_OPEX_AGENT_SETTINGS: OpexAgentSettings = {
    enabled: false,
    main: { provider: null, model: null, variant: null, temperature: null, maxOutputTokens: null },
    title: { provider: null, model: null, variant: null },
    instructions: DEFAULT_OPEX_INSTRUCTIONS,
    titleInstructions: DEFAULT_OPEX_TITLE_INSTRUCTIONS,
    disabledTools: [],
    confirmationOverrides: {},
    files: { maxPerMessage: OPEX_FILES_PER_MESSAGE_DEFAULT, maxSizeMb: OPEX_FILE_SIZE_MB_DEFAULT },
    anonymous: DEFAULT_OPEX_ANONYMOUS_SETTINGS,
}

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Id inválido")
const messageText = z.string().trim().max(OPEX_MESSAGE_MAX, `Até ${OPEX_MESSAGE_MAX.toLocaleString("pt-BR")} caracteres`)

/** Mensagem: texto, arquivos enviados antes (reserva + PUT + confirmação) ou os dois. */
export const sendOpexMessageSchema = z
    .object({
        text: messageText.default(""),
        fileIds: z.array(objectId).max(OPEX_FILES_PER_MESSAGE_MAX, `Até ${OPEX_FILES_PER_MESSAGE_MAX} arquivos`).default([]),
    })
    .refine((value) => value.text.length > 0 || value.fileIds.length > 0, { message: "Escreva uma mensagem ou anexe um arquivo", path: ["text"] })
export type SendOpexMessageInput = z.infer<typeof sendOpexMessageSchema>

export const createOpexSessionSchema = z.object({
    text: messageText.min(1, "Escreva uma mensagem").optional(),
})

export const updateOpexSessionSchema = z
    .object({
        title: z.string().trim().min(1, "Informe o título").max(OPEX_TITLE_MAX, `Até ${OPEX_TITLE_MAX} caracteres`).optional(),
        archived: z.boolean().optional(),
    })
    .refine((value) => value.title !== undefined || value.archived !== undefined, { message: "Nada para alterar" })

export const decideOpexActionSchema = z.object({
    decision: z.enum(["confirm", "cancel"]),
})

/**
 * Reserva de um arquivo do chat: o navegador declara nome, tamanho e tipo; o servidor confere os
 * limites e devolve a URL assinada do PUT direto no storage. O tamanho é conferido de novo na
 * confirmação (a URL assinada não impõe limite).
 */
export const reserveOpexFileSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome do arquivo").max(300, "Nome muito longo"),
    size: z.number({ error: "Informe o tamanho do arquivo" }).int().min(1, "O arquivo está vazio"),
    mediaType: z.string().trim().max(200).optional(),
})
export type ReserveOpexFileInput = z.infer<typeof reserveOpexFileSchema>

/** Título e resumo devolvidos pelo subagente (cortados ao limite depois de validar). */
export const opexTitleOutputSchema = z.object({
    title: z.string().trim().min(1),
    summary: z.string().trim(),
})
