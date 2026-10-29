import { describe, expect, it, vi } from "vitest"
import { chmod, mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
const mocks = vi.hoisted(() => ({ find: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }))
vi.mock("mongoose", () => ({ default: { connect: mocks.connect, disconnect: mocks.disconnect, connection: { db: { databaseName: "test", collection: (name: string) => ({ find: (filter: unknown) => { mocks.find(name, filter); return { sort: () => ({ toArray: async () => [] }), toArray: async () => [] } } }) } } } }))
import { buildFeedbackExport, exportFeedbacks } from "../../scripts/export-pending-feedbacks"

describe("exportação de feedbacks", () => {
    it("mapeia tipos, prioridades e preserva texto e histórico", () => {
        const result = buildFeedbackExport([{ _id: "one", type: "bug", priority: "alta", title: "Bug", description: "<p>Descrição</p>" }, { _id: "two", type: "melhoria", priority: "baixa" }, { _id: "three", priority: null }], [{ feedbackId: "one", text: "Comentário" }], [{ feedbackId: "one" }])
        expect(result.count).toBe(3)
        expect(result.feedbacks[0]).toMatchObject({ suggestedOpexTask: { title: "Bug", description: "<p>Descrição</p>", taskType: "bugfix", priority: "high" }, timeline: [{ text: "Comentário", feedbackId: "one" }] })
        expect(result.feedbacks[1].suggestedOpexTask).toMatchObject({ taskType: "feature", priority: "low" })
        expect(result.feedbacks[2].suggestedOpexTask.priority).toBe("medium")
    })
    it("seleciona pendentes por padrão, grava 0600 e impede sobrescrita", async () => {
        process.env.MONGODB_URI = "mongodb://example/test"
        const path = join(await mkdtemp(join(tmpdir(), "dnd5-export-")), "export.json")
        await exportFeedbacks(["--out", path])
        expect(mocks.find).toHaveBeenCalledWith("feedbacks", { status: "pendente" })
        expect(JSON.parse(await readFile(path, "utf8")).count).toBe(0)
        expect((await stat(path)).mode & 0o777).toBe(0o600)
        await expect(exportFeedbacks(["--out", path])).rejects.toMatchObject({ code: "EEXIST" })
        await expect(exportFeedbacks(["--out", path, "--force"])).resolves.toBeUndefined()
    })
    it("--all e --dry-run não precisam de arquivo", async () => {
        process.env.MONGODB_URI = "mongodb://example/test"
        await exportFeedbacks(["--all", "--dry-run"])
        expect(mocks.find).toHaveBeenCalledWith("feedbacks", {})
    })
    it("--force restringe arquivo 0644 a 0600 antes de exportar", async () => {
        process.env.MONGODB_URI = "mongodb://example/test"
        const path = join(await mkdtemp(join(tmpdir(), "dnd5-export-")), "export.json")
        await writeFile(path, "conteúdo anterior")
        await chmod(path, 0o644)
        expect((await stat(path)).mode & 0o777).toBe(0o644)
        await exportFeedbacks(["--out", path, "--force"])
        expect((await stat(path)).mode & 0o777).toBe(0o600)
        expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ schemaVersion: 1, count: 0 })
    })
})
