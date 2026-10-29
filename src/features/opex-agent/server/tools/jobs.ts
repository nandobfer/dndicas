import { z } from "zod"
import { OPEX_JOB_FILTERS, OPEX_JOB_ORIGIN_FILTERS, OPEX_JOB_UNITS, OPEX_JOB_WHEN, jobToInput, opexJobInputSchema, type OpexJobDto } from "../../jobs"
import { cancelOpexJob, createOpexJob, getOpexJob, listOpexJobs, updateOpexJob } from "../jobs"
import type { OpexServerScope } from "../scope"
import { defineTool, type OpexToolContext } from "./define"

/**
 * Entradas e conversões compartilhadas pelas ferramentas de jobs do dono e do portal (as funções de
 * serviço recebem o escopo, que decide quais jobs e sessões o ator enxerga).
 */

export const jobIdField = z
    .string()
    .regex(/^[a-f0-9]{24}$/i, "Id inválido")
    .describe("Id do job (de list_jobs)")

export const jobScheduleFields = {
    when: z.enum(OPEX_JOB_WHEN).describe("now = agora; in = daqui a `amount` `unit`; at = em `date` + `time` (Brasília)"),
    amount: z.number().int().min(1).max(9999).optional().describe("Com when=in"),
    unit: z.enum(OPEX_JOB_UNITS).optional().describe("Com when=in"),
    date: z.string().optional().describe("Com when=at: aaaa-mm-dd (Brasília)"),
    time: z.string().optional().describe("Com when=at: hh:mm (Brasília)"),
}

export const jobSessionField = z
    .string()
    .optional()
    .describe('Onde o prompt roda: "current" (padrão, esta sessão — continua o contexto), "new" (sessão nova) ou o id de outra sessão')

export const jobScheduleInput = z.object({ title: z.string().describe("Título curto do job"), prompt: z.string().describe("O que fazer no horário"), session: jobSessionField, ...jobScheduleFields })

export const jobUpdateInput = z.object({
    jobId: jobIdField,
    title: z.string().optional(),
    prompt: z.string().optional(),
    session: jobSessionField,
    when: jobScheduleFields.when.optional(),
    amount: jobScheduleFields.amount,
    unit: jobScheduleFields.unit,
    date: jobScheduleFields.date,
    time: jobScheduleFields.time,
})

const short = (value: string) => (value.length > 80 ? `${value.slice(0, 79)}…` : value)

export const summarizeSchedule = (input: z.infer<typeof jobScheduleInput>) => `Agendar o job "${short(input.title)}"`

export function jobView(job: OpexJobDto) {
    return {
        id: job.id,
        title: job.title,
        prompt: job.prompt,
        status: job.status,
        runAt: job.runAt,
        sessionId: job.sessionId,
        resultSessionId: job.resultSessionId,
        createdBy: job.createdBy,
        delayMs: job.delayMs,
        error: job.error,
        finishedAt: job.finishedAt,
    }
}

function sessionIdFor(session: string | undefined, currentSessionId: string): string | null {
    if (!session || session === "current") return currentSessionId
    if (session === "new") return null
    return session
}

/** Agenda no escopo do turno (usuário logado; visitantes recebem 403). */
export async function scheduleJobTool(input: z.infer<typeof jobScheduleInput>, context: OpexToolContext, scope: OpexServerScope, actorId: string) {
    const parsed = opexJobInputSchema.parse({
        title: input.title,
        prompt: input.prompt,
        sessionId: sessionIdFor(input.session, context.sessionId),
        when: input.when,
        amount: input.amount ?? null,
        unit: input.unit ?? null,
        date: input.date ?? null,
        time: input.time ?? null,
    })
    return createOpexJob(parsed, { actorId, createdBy: "agent", originSessionId: context.sessionId }, scope)
}

/** Edita pelo escopo: campos omitidos ficam como estão. */
export async function updateJobTool(input: z.infer<typeof jobUpdateInput>, context: OpexToolContext, scope: OpexServerScope, actorId: string) {
    const current = jobToInput(await getOpexJob(input.jobId, scope), "edit")
    const schedule = input.when ? { when: input.when, amount: input.amount ?? null, unit: input.unit ?? null, date: input.date ?? null, time: input.time ?? null } : {}
    const parsed = opexJobInputSchema.parse({
        ...current,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        ...(input.session !== undefined ? { sessionId: sessionIdFor(input.session, context.sessionId) } : {}),
        ...schedule,
    })
    return updateOpexJob(input.jobId, parsed, actorId, scope)
}

/** Prompts agendados para o próprio agente (usuários logados; administradores veem todos). */
export const jobTools = [
    defineTool({
        name: "list_jobs",
        group: "jobs",
        minRole: "user",
        label: "Listar jobs",
        risk: "read",
        description:
            "Jobs agendados (prompts que o agente executa sozinho) e o histórico dos últimos 30 dias: status, horário previsto, sessão, atraso e erro. O usuário vê os próprios; o administrador, os de todos (origin).",
        input: z.object({
            filter: z.enum(OPEX_JOB_FILTERS).optional().describe("scheduled = na fila; finished = histórico; all (padrão)"),
            origin: z.enum(OPEX_JOB_ORIGIN_FILTERS).optional().describe("Administradores: mine = os próprios; others = os dos outros usuários; all (padrão)"),
        }),
        async execute(input, context) {
            const items = (await listOpexJobs({ filter: input.filter ?? "all", origin: input.origin ?? "all" }, context.scope)).map((job) => ({ ...jobView(job), origin: job.origin }))
            return { items, total: items.length }
        },
    }),
    defineTool({
        name: "schedule_job",
        group: "jobs",
        minRole: "user",
        label: "Agendar job",
        risk: "write",
        description:
            "Agenda um prompt para você mesmo executar uma vez: agora, daqui a um tempo ou numa data e hora de Brasília (a hora atual está no contexto do turno). No horário, o prompt chega como mensagem na sessão escolhida e você executa sozinho; o usuário recebe um aviso ao terminar. Escreva o prompt completo, com o que fazer e o que relatar.",
        input: jobScheduleInput,
        summarize: summarizeSchedule,
        async execute(input, context) {
            return { ok: true, ...jobView(await scheduleJobTool(input, context, context.scope, context.actorId)) }
        },
    }),
    defineTool({
        name: "update_job",
        group: "jobs",
        minRole: "user",
        label: "Editar job",
        risk: "write",
        description: "Edita um job ainda agendado do próprio usuário (título, prompt, sessão ou horário). Campos omitidos ficam como estão; mudar o horário exige `when` e os campos dele.",
        input: jobUpdateInput,
        summarize: (input) => `Editar o job ${input.jobId}`,
        async execute(input, context) {
            return { ok: true, ...jobView(await updateJobTool(input, context, context.scope, context.actorId)) }
        },
    }),
    defineTool({
        name: "cancel_job",
        group: "jobs",
        minRole: "user",
        label: "Cancelar job",
        risk: "destructive",
        description: "Cancela um job agendado do usuário (administradores cancelam os de qualquer usuário); ele fica no histórico como cancelado.",
        input: z.object({ jobId: jobIdField }),
        summarize: (input) => `Cancelar o job ${input.jobId}`,
        async execute(input, context) {
            return { ok: true, ...jobView(await cancelOpexJob(input.jobId, context.actorId, context.scope)) }
        },
    }),
]
