import { z } from "zod"
import { zonedWallTimeToDate } from "@/lib/integrations/schedule"
import { OPEX_MESSAGE_MAX } from "./constants"

/**
 * Jobs do Agente Opex (módulo puro: tela e servidor): um prompt que o agente executa sozinho uma
 * única vez — agora, daqui a um tempo ou numa data e hora de Brasília. Valem para usuários logados
 * (cada um vê os próprios; administradores veem todos em Integrações › Crons › Jobs). Ver `aicontext/modules/opex-agent.md`.
 */

export const OPEX_JOB_STATUSES = ["scheduled", "running", "done", "error", "awaiting_confirmation", "canceled"] as const
export type OpexJobStatus = (typeof OPEX_JOB_STATUSES)[number]

export const OPEX_JOB_STATUS_LABELS: Record<OpexJobStatus, string> = {
    scheduled: "Agendado",
    running: "Executando",
    done: "Concluído",
    error: "Falhou",
    awaiting_confirmation: "Aguardando confirmação",
    canceled: "Cancelado",
}

/** Jobs que já saíram da fila (entram no histórico e são apagados depois de `OPEX_JOB_RETENTION_MS`). */
export const OPEX_JOB_FINISHED_STATUSES = ["done", "error", "awaiting_confirmation", "canceled"] as const satisfies readonly OpexJobStatus[]

export function isFinishedJobStatus(status: OpexJobStatus): boolean {
    return (OPEX_JOB_FINISHED_STATUSES as readonly OpexJobStatus[]).includes(status)
}

export const OPEX_JOB_FILTERS = ["scheduled", "finished", "all"] as const
export type OpexJobFilter = (typeof OPEX_JOB_FILTERS)[number]

/** Origem do job na lista do administrador: os próprios, os dos outros usuários ou todos. */
export const OPEX_JOB_ORIGIN_FILTERS = ["all", "mine", "others"] as const
export type OpexJobOriginFilter = (typeof OPEX_JOB_ORIGIN_FILTERS)[number]

export const OPEX_JOB_WHEN = ["now", "in", "at"] as const
export type OpexJobWhen = (typeof OPEX_JOB_WHEN)[number]

export const OPEX_JOB_UNITS = ["minutes", "hours", "days"] as const
export type OpexJobUnit = (typeof OPEX_JOB_UNITS)[number]

export const OPEX_JOB_UNIT_LABELS: Record<OpexJobUnit, string> = { minutes: "Minutos", hours: "Horas", days: "Dias" }

const UNIT_MS: Record<OpexJobUnit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }

export const OPEX_JOB_TITLE_MAX = 120
/** Horizonte máximo de um agendamento. */
export const OPEX_JOB_MAX_AHEAD_MS = 366 * UNIT_MS.days
/** Tolerância para "em data e hora" no minuto atual (o tick roda a cada minuto). */
export const OPEX_JOB_PAST_TOLERANCE_MS = 60_000
/** Histórico: o job terminado é apagado depois disto (índice TTL em `purgeAt`). */
export const OPEX_JOB_RETENTION_MS = 30 * UNIT_MS.days
/** Lista da tela e da ferramenta. */
export const OPEX_JOB_LIST_LIMIT = 200

/** Eventos em `private-app` (e, no job do portal, também no canal do usuário). */
export const OPEX_JOB_UPDATED_EVENT = "opex-job-updated"
/** Job terminou (concluído, falhou ou aguardando confirmação): toast com "Abrir sessão". */
export const OPEX_JOB_FINISHED_EVENT = "opex-job-finished"
export const OPEX_JOB_AUDIT_ENTITY = "JobAgenteOpex"

/** Aba de `/integracoes/crons` com os jobs. */
export const OPEX_JOBS_TAB = "jobs" as const

const OBJECT_ID = /^[a-f0-9]{24}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Entrada de um job (API, formulário e ferramenta). Plano de propósito: `when` diz quais campos
 * valem — `in` usa `amount` + `unit`; `at` usa `date` (aaaa-mm-dd) + `time` (hh:mm), em Brasília.
 */
export const opexJobInputSchema = z
    .object({
        title: z.string().trim().min(1, "Dê um título ao job").max(OPEX_JOB_TITLE_MAX, `Até ${OPEX_JOB_TITLE_MAX} caracteres`),
        prompt: z.string().trim().min(1, "Escreva o que o agente deve fazer").max(OPEX_MESSAGE_MAX, `Até ${OPEX_MESSAGE_MAX.toLocaleString("pt-BR")} caracteres`),
        /** `null` = cria uma sessão nova na execução. */
        sessionId: z.string().regex(OBJECT_ID, "Sessão inválida").nullable(),
        when: z.enum(OPEX_JOB_WHEN),
        amount: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Mínimo 1").max(9999, "Máximo 9999").nullable().optional(),
        unit: z.enum(OPEX_JOB_UNITS).nullable().optional(),
        date: z.string().regex(DATE, "Escolha a data").nullable().optional(),
        time: z.string().regex(TIME, "Escolha o horário").nullable().optional(),
        /** Reexecução: job de origem (só para referência). */
        sourceJobId: z.string().regex(OBJECT_ID, "Job inválido").nullable().optional(),
    })
    .superRefine((value, ctx) => {
        if (value.when === "in") {
            if (value.amount == null) ctx.addIssue({ code: "custom", path: ["amount"], message: "Informe em quanto tempo" })
            if (!value.unit) ctx.addIssue({ code: "custom", path: ["unit"], message: "Escolha a unidade" })
        }
        if (value.when === "at") {
            if (!value.date) ctx.addIssue({ code: "custom", path: ["date"], message: "Escolha a data" })
            if (!value.time) ctx.addIssue({ code: "custom", path: ["time"], message: "Escolha o horário" })
        }
    })
export type OpexJobInput = z.infer<typeof opexJobInputSchema>

/** Consulta da lista: situação e, para administradores, origem e usuário. */
export const opexJobListQuerySchema = z.object({
    filter: z.enum(OPEX_JOB_FILTERS).default("all"),
    origin: z.enum(OPEX_JOB_ORIGIN_FILTERS).default("all"),
    userId: z.string().regex(OBJECT_ID, "Usuário inválido").optional(),
})
export type OpexJobListQuery = z.infer<typeof opexJobListQuerySchema>

/** Agendamento guardado no job (para reabrir o formulário como foi preenchido). */
export interface OpexJobScheduleDto {
    when: OpexJobWhen
    amount: number | null
    unit: OpexJobUnit | null
    date: string | null
    time: string | null
}

export function scheduleOf(input: OpexJobInput): OpexJobScheduleDto {
    return {
        when: input.when,
        amount: input.when === "in" ? (input.amount ?? null) : null,
        unit: input.when === "in" ? (input.unit ?? null) : null,
        date: input.when === "at" ? (input.date ?? null) : null,
        time: input.when === "at" ? (input.time ?? null) : null,
    }
}

/**
 * Instante da execução. Erro (mensagem pt-BR) quando o horário já passou ou fica longe demais.
 * "Daqui a" conta a partir de `now` (o momento em que o job é salvo).
 */
export function resolveRunAt(schedule: OpexJobScheduleDto, now: Date): { runAt: Date } | { error: string } {
    let runAt: Date
    if (schedule.when === "now") runAt = now
    else if (schedule.when === "in") {
        if (schedule.amount == null || !schedule.unit) return { error: "Informe em quanto tempo o job deve rodar" }
        runAt = new Date(now.getTime() + schedule.amount * UNIT_MS[schedule.unit])
    } else {
        if (!schedule.date || !schedule.time || !DATE.test(schedule.date) || !TIME.test(schedule.time)) return { error: "Escolha a data e o horário do job" }
        const [year, month, day] = schedule.date.split("-").map(Number)
        const [hour, minute] = schedule.time.split(":").map(Number)
        runAt = zonedWallTimeToDate(year, month, day, hour, minute)
        if (Number.isNaN(runAt.getTime())) return { error: "Data inválida" }
        if (runAt.getTime() < now.getTime() - OPEX_JOB_PAST_TOLERANCE_MS) return { error: "O horário escolhido já passou" }
    }
    if (runAt.getTime() - now.getTime() > OPEX_JOB_MAX_AHEAD_MS) return { error: "Agende para no máximo um ano à frente" }
    return { runAt }
}

/** De quem é o job (usuário dono). */
export type OpexJobOriginDto = { userId: string; userName: string }

export interface OpexJobDto {
    id: string
    title: string
    prompt: string
    /** Sessão escolhida (`null` = nova sessão na execução). */
    sessionId: string | null
    /** Sessão em que o turno rodou (a escolhida ou a criada). */
    resultSessionId: string | null
    schedule: OpexJobScheduleDto
    runAt: string
    status: OpexJobStatus
    startedAt: string | null
    finishedAt: string | null
    /** Atraso entre o horário previsto e o início (app desligado ou agendador parado). */
    delayMs: number | null
    error: string | null
    createdBy: "user" | "agent"
    originSessionId: string | null
    sourceJobId: string | null
    origin: OpexJobOriginDto
    createdAt: string
}

/** Evento do job terminado (toast em qualquer tela). */
export interface OpexJobFinishedPayload {
    id: string
    title: string
    status: OpexJobStatus
    sessionId: string | null
    error: string | null
    /** Usuário dono: o toast só aparece para ele (o administrador recebe os de todos no canal admin). */
    userId: string
}

/** Atraso relevante (acima de um tick) em texto curto: "12 min", "3 h 5 min", "2 dias". */
export function formatJobDelay(ms: number | null): string | null {
    if (ms == null || ms < 2 * UNIT_MS.minutes) return null
    const minutes = Math.round(ms / UNIT_MS.minutes)
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`
    return `${Math.floor(hours / 24)} dias`
}

/** Valores do formulário a partir de um job (editar ou reexecutar). */
export function jobToInput(job: OpexJobDto, mode: "edit" | "rerun"): OpexJobInput {
    if (mode === "rerun") return { title: job.title, prompt: job.prompt, sessionId: job.sessionId, when: "now", amount: null, unit: null, date: null, time: null, sourceJobId: job.id }
    return { title: job.title, prompt: job.prompt, sessionId: job.sessionId, ...job.schedule, sourceJobId: job.sourceJobId }
}

/** Texto enviado ao modelo: o prompt com o contexto do agendamento. */
export function jobModelText(job: { title: string; prompt: string; createdAt: Date; runAt: Date; delayMs: number | null; createdBy: "user" | "agent" }, format: (date: Date) => string): string {
    const delay = formatJobDelay(job.delayMs)
    const origin = job.createdBy === "agent" ? "agendado por você (Agente Opex)" : "agendado pelo usuário"
    const header = `[Job "${job.title}", ${origin} em ${format(job.createdAt)} para ${format(job.runAt)}${delay ? `; executado com ${delay} de atraso` : ""}. O usuário pode não estar olhando: execute e relate o resultado.]`
    return `${header}\n\n${job.prompt}`
}
