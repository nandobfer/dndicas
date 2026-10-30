import { z } from "zod"
const number = z.number().finite().nonnegative()
export const dashboardRangeSchema = z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    timeZone: z.string().max(100).refine((value) => { try { new Intl.DateTimeFormat("pt-BR", { timeZone: value }); return true } catch { return false } }, "Fuso horário inválido"),
}).refine((range) => Date.parse(range.from) <= Date.parse(range.to), "Período inválido")
export const dashboardSchema = z.object({
    range: z.object({ from: z.string(), to: z.string() }),
    tasksActive: number, tasksCreated: number, tasksCompleted: number,
    byColumn: z.array(z.object({ label: z.string(), count: number, color: z.enum(["violet", "sky", "emerald", "amber", "rose", "cyan", "orange", "pink", "lime", "zinc"]) })),
    byTag: z.array(z.object({ label: z.string(), count: number })),
    byProject: z.array(z.object({ name: z.string(), sigla: z.string().nullable().optional(), count: number })),
    timeline: z.array(z.object({ bucket: z.string(), created: number, completed: number })),
    finance: z.object({
        totals: z.object({ totalCostBrl: number, totalClientHours: number, serviceCount: number }),
        byProject: z.array(z.object({ repo: z.string(), costBrl: number, clientHours: number })),
        timeline: z.array(z.object({ bucket: z.string(), costBrl: number })),
    }).nullable(),
})
