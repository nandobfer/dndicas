import { describe, expect, it } from "vitest"
import { nextRunAt, scheduleSignature, validateSchedule, zonedWallTimeToDate } from "@/lib/integrations/schedule"
import { jobsToReschedule } from "@/features/integrations/services/integration-service"
import type { CronJobConfig } from "@/lib/integrations/catalog"

// Brasília é UTC-3 (sem horário de verão desde 2019).
const brt = (iso: string) => new Date(`${iso}-03:00`)

describe("agendamento das rotinas (fuso de Brasília)", () => {
    it("valida intervalos, horários, dias da semana e dia do mês", () => {
        expect(validateSchedule({ type: "interval", minutes: 5 })).toBeNull()
        expect(validateSchedule({ type: "interval", minutes: 0 })).toMatch(/intervalo/)
        expect(validateSchedule({ type: "interval", minutes: 10081 })).toMatch(/intervalo/)
        expect(validateSchedule({ type: "daily", time: "24:00" })).toMatch(/horário/)
        expect(validateSchedule({ type: "weekly", days: [], time: "08:00" })).toMatch(/dia da semana/)
        expect(validateSchedule({ type: "weekly", days: [7], time: "08:00" })).toMatch(/inválido/)
        expect(validateSchedule({ type: "monthly", day: 32, time: "08:00" })).toMatch(/entre 1 e 31/)
    })

    it("intervalos seguem uma grade fixa e a próxima é estritamente depois", () => {
        const from = new Date("2026-10-29T12:05:00.000Z")
        expect(nextRunAt({ type: "interval", minutes: 5 }, from).toISOString()).toBe("2026-10-29T12:10:00.000Z")
        expect(nextRunAt({ type: "interval", minutes: 60 }, new Date("2026-10-29T12:05:30.000Z")).toISOString()).toBe("2026-10-29T13:00:00.000Z")
    })

    it("diário usa o horário de Brasília e pula para amanhã quando já passou", () => {
        expect(nextRunAt({ type: "daily", time: "08:30" }, brt("2026-10-29T07:00:00"))).toEqual(brt("2026-10-29T08:30:00"))
        expect(nextRunAt({ type: "daily", time: "08:30" }, brt("2026-10-29T08:30:00"))).toEqual(brt("2026-10-30T08:30:00"))
        // 23:30 em Brasília já é o dia seguinte em UTC.
        expect(nextRunAt({ type: "daily", time: "23:30" }, brt("2026-10-29T22:00:00")).toISOString()).toBe("2026-10-30T02:30:00.000Z")
    })

    it("semanal escolhe o próximo dia permitido", () => {
        // 29/10/2026 é quinta (4). Segunda (1) seguinte: 02/11.
        expect(nextRunAt({ type: "weekly", days: [1], time: "09:00" }, brt("2026-10-29T10:00:00"))).toEqual(brt("2026-11-02T09:00:00"))
        expect(nextRunAt({ type: "weekly", days: [4, 5], time: "09:00" }, brt("2026-10-29T10:00:00"))).toEqual(brt("2026-10-30T09:00:00"))
    })

    it("mensal no dia 31 cai no último dia dos meses curtos, sem pular o mês", () => {
        expect(nextRunAt({ type: "monthly", day: 31, time: "06:00" }, brt("2026-10-31T07:00:00"))).toEqual(brt("2026-11-30T06:00:00"))
        expect(nextRunAt({ type: "monthly", day: 31, time: "06:00" }, brt("2027-01-31T07:00:00"))).toEqual(brt("2027-02-28T06:00:00"))
        expect(nextRunAt({ type: "monthly", day: 31, time: "06:00" }, brt("2028-01-31T07:00:00"))).toEqual(brt("2028-02-29T06:00:00"))
    })

    it("converte a hora de parede de Brasília para UTC", () => {
        expect(zonedWallTimeToDate(2026, 1, 1, 0, 0).toISOString()).toBe("2026-01-01T03:00:00.000Z")
    })
})

describe("rotinas a reagendar ao salvar os Crons", () => {
    const job = (id: string, extra: Partial<CronJobConfig> = {}): CronJobConfig =>
        ({ id, label: id, enabled: true, kind: "internal", schedule: { type: "interval", minutes: 5 }, ...extra }) as CronJobConfig

    it("reagenda novas, religadas e com agendamento alterado; ignora desligadas e inalteradas", () => {
        const previous = [job("igual"), job("mudou"), job("religada", { enabled: false })]
        const next = [job("igual"), job("mudou", { schedule: { type: "daily", time: "08:00" } }), job("religada"), job("nova"), job("desligada", { enabled: false })]
        expect(jobsToReschedule(previous, next).map((item) => item.id)).toEqual(["mudou", "religada", "nova"])
    })

    it("a assinatura muda só quando o agendamento muda", () => {
        expect(scheduleSignature({ type: "interval", minutes: 5 })).toBe(scheduleSignature({ type: "interval", minutes: 5 }))
        expect(scheduleSignature({ type: "interval", minutes: 5 })).not.toBe(scheduleSignature({ type: "interval", minutes: 6 }))
    })
})
