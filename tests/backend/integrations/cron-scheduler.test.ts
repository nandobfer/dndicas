import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CronJobConfig } from "@/lib/integrations/catalog"

const mocks = vi.hoisted(() => ({
    config: { schedulerEnabled: true, cronSecret: "segredo", jobs: [] as unknown[] },
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    runDueOpexJobs: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/lib/db/models/CronJobState", () => ({ CronJobState: { updateOne: mocks.updateOne, findOneAndUpdate: mocks.findOneAndUpdate } }))
vi.mock("@/lib/integrations/config", () => ({ getIntegrationConfig: vi.fn(async () => mocks.config), getInternalBaseUrl: vi.fn(async () => "http://localhost:4005") }))
vi.mock("@/lib/integrations/debug", () => ({ integrationDebug: () => ({ step: vi.fn(), success: vi.fn(), error: vi.fn(), request: vi.fn(), response: vi.fn() }) }))
vi.mock("@/features/opex-agent/server/jobs", () => ({ runDueOpexJobs: mocks.runDueOpexJobs }))

import { JOB_LEASE_MS, registerInternalJob, runSchedulerTick, syncJobState, tickReference } from "@/features/integrations/scheduler/cron-scheduler"

const job = (id: string, extra: Partial<CronJobConfig> = {}): CronJobConfig =>
    ({ id, label: id, enabled: true, kind: "internal", schedule: { type: "interval", minutes: 5 }, ...extra }) as CronJobConfig

const now = new Date("2026-10-29T12:05:01.000Z")

describe("agendador interno (tick)", () => {
    beforeEach(() => {
        mocks.config.schedulerEnabled = true
        mocks.config.jobs = []
        mocks.updateOne.mockResolvedValue({ modifiedCount: 0 })
        mocks.findOneAndUpdate.mockResolvedValue(null)
        mocks.runDueOpexJobs.mockResolvedValue([])
    })

    it("o instante de referência é 1 ms antes do minuto (não pula a rotina do próprio minuto)", () => {
        expect(tickReference(now).toISOString()).toBe("2026-10-29T12:04:59.999Z")
    })

    it("syncJobState cria o estado só uma vez e recalcula quando o agendamento muda", async () => {
        await syncJobState(job("a"), now)
        const [insertFilter, insert, options] = mocks.updateOne.mock.calls[0]!
        expect(insertFilter).toEqual({ jobId: "a" })
        expect(insert.$setOnInsert.nextRunAt.toISOString()).toBe("2026-10-29T12:05:00.000Z")
        expect(options).toEqual({ upsert: true })
        const [changeFilter, change] = mocks.updateOne.mock.calls[1]!
        expect(changeFilter).toMatchObject({ jobId: "a", scheduleSignature: { $ne: expect.any(String) } })
        expect(change.$set.nextRunAt).toBeInstanceOf(Date)
    })

    it("syncJobState ignora a corrida de criação entre instâncias (E11000)", async () => {
        mocks.updateOne.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 })).mockResolvedValue({ modifiedCount: 0 })
        await expect(syncJobState(job("a"), now)).resolves.toBeUndefined()
    })

    it("executa a rotina só quando reivindica o lease e avança a próxima execução", async () => {
        const runner = vi.fn().mockResolvedValue("feito")
        registerInternalJob("rotina-ok", runner)
        mocks.config.jobs = [job("rotina-ok"), job("ocupada")]
        mocks.findOneAndUpdate.mockImplementation(async (filter: { jobId: string }) => (filter.jobId === "rotina-ok" ? { jobId: "rotina-ok" } : null))

        const result = await runSchedulerTick(now)

        expect(result.executed).toEqual(["rotina-ok"])
        expect(runner).toHaveBeenCalledTimes(1)
        const [filter, update] = mocks.findOneAndUpdate.mock.calls[0]!
        expect(filter).toMatchObject({ jobId: "rotina-ok", nextRunAt: { $lte: now } })
        expect(update.$set.lockedUntil.getTime()).toBe(now.getTime() + JOB_LEASE_MS)
        expect(update.$set.nextRunAt.toISOString()).toBe("2026-10-29T12:10:00.000Z")
        const finish = mocks.updateOne.mock.calls.find(([, value]) => value.$set?.lastStatus)
        expect(finish?.[1].$set).toMatchObject({ lastStatus: "ok", lockedUntil: null })
    })

    it("falha da rotina fica gravada e não interrompe o tick", async () => {
        registerInternalJob("rotina-falha", vi.fn().mockRejectedValue(new Error("quebrou")))
        mocks.config.jobs = [job("rotina-falha")]
        mocks.findOneAndUpdate.mockResolvedValue({ jobId: "rotina-falha" })
        await expect(runSchedulerTick(now)).resolves.toMatchObject({ executed: ["rotina-falha"] })
        const finish = mocks.updateOne.mock.calls.find(([, value]) => value.$set?.lastStatus)
        expect(finish?.[1].$set).toMatchObject({ lastStatus: "error", lastError: "quebrou" })
        expect(mocks.runDueOpexJobs).toHaveBeenCalledWith(now)
    })

    it("ignora rotinas desligadas ou com agendamento inválido", async () => {
        mocks.config.jobs = [job("off", { enabled: false }), job("invalida", { schedule: { type: "interval", minutes: 0 } })]
        await runSchedulerTick(now)
        expect(mocks.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it("com o agendador desligado, pausa as rotinas mas mantém os jobs do Agente Opex", async () => {
        mocks.config.schedulerEnabled = false
        mocks.config.jobs = [job("rotina-ok")]
        const result = await runSchedulerTick(now)
        expect(result).toEqual({ skipped: "disabled", executed: [] })
        expect(mocks.findOneAndUpdate).not.toHaveBeenCalled()
        expect(mocks.runDueOpexJobs).toHaveBeenCalledWith(now)
    })
})
