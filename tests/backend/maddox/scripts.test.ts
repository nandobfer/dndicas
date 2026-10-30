import { beforeEach, describe, expect, it, vi } from "vitest"

type Doc = { kind: string; version: number; guide: string; topics: { id: string; text: string; active: boolean }[]; notes: string; createdBy: string; createdAt: Date }
const docs: Doc[] = []
const recordAudit = vi.fn(async () => undefined)

const sorted = (filter: { kind: string; version?: number }) => docs.filter((doc) => doc.kind === filter.kind && (filter.version === undefined || doc.version === filter.version)).sort((a, b) => b.version - a.version)

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined), recordAudit, AcaoAuditoria: { CRIAR: "CRIAR" } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: vi.fn(async () => undefined) }))
vi.mock("@/features/users/models/user", () => ({ User: { find: () => ({ select: () => ({ lean: async () => [{ _id: "65f000000000000000000001", name: "Ana Admin", username: "ana" }] }) }) } }))
vi.mock("@/features/maddox/models/maddox-interview-script", () => ({
    MaddoxInterviewScriptModel: {
        findOne: (filter: { kind: string; version?: number }) => {
            const first = () => sorted(filter)[0] ?? null
            return { sort: () => ({ lean: async () => first() }), lean: async () => first() }
        },
        find: (filter: { kind: string }) => ({ sort: () => ({ limit: () => ({ lean: async () => sorted(filter) }) }) }),
        create: async (doc: Omit<Doc, "createdAt">) => {
            if (docs.some((item) => item.kind === doc.kind && item.version === doc.version)) throw Object.assign(new Error("dup"), { code: 11000 })
            docs.push({ ...doc, createdAt: new Date("2026-10-29T12:00:00Z") })
        },
    },
}))

const { currentMaddoxScript, getMaddoxScriptState, getMaddoxScriptVersion, saveMaddoxScript } = await import("@/features/maddox/server/scripts")
const { DEFAULT_MADDOX_SCENARIO_GUIDE, DEFAULT_MADDOX_CHARACTER_TOPICS } = await import("@/features/maddox/constants")
const { saveMaddoxScriptSchema } = await import("@/features/maddox/schemas")

const ADMIN = "65f000000000000000000001"
const input = (version: number, guide = "Guia novo") => ({ guide, topics: [{ id: "t1", text: "Universo", active: true }, { id: "t2", text: "Tom", active: false }], notes: "ajuste", version })

describe("roteiros das entrevistas do Maddox", () => {
    beforeEach(() => {
        docs.length = 0
        recordAudit.mockClear()
    })

    it("sem gravação, a vigente é a v0 com o roteiro padrão", async () => {
        const scenario = await currentMaddoxScript("scenario")
        expect(scenario.version).toBe(0)
        expect(scenario.guide).toBe(DEFAULT_MADDOX_SCENARIO_GUIDE)
        const character = await getMaddoxScriptState("character")
        expect(character.current.topics).toEqual(DEFAULT_MADDOX_CHARACTER_TOPICS)
        expect(character.history.map((item) => item.version)).toEqual([0])
    })

    it("cada gravação cria uma versão nova, com histórico e auditoria", async () => {
        const first = await saveMaddoxScript("scenario", input(0), ADMIN)
        expect(first.current).toMatchObject({ version: 1, guide: "Guia novo", notes: "ajuste", createdByName: "Ana Admin" })
        const second = await saveMaddoxScript("scenario", input(1, "Guia v2"), ADMIN)
        expect(second.current.version).toBe(2)
        expect(second.history.map((item) => item.version)).toEqual([2, 1, 0])
        expect(second.history[0]).not.toHaveProperty("guide")
        expect((await getMaddoxScriptVersion("scenario", 1))?.guide).toBe("Guia novo")
        expect(recordAudit).toHaveBeenCalledTimes(2)
    })

    it("versão desatualizada é recusada (409) e não grava", async () => {
        await saveMaddoxScript("scenario", input(0), ADMIN)
        await expect(saveMaddoxScript("scenario", input(0, "atrasado"), ADMIN)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" })
        expect(docs).toHaveLength(1)
    })

    it("cenário e personagem têm versões independentes", async () => {
        await saveMaddoxScript("scenario", input(0), ADMIN)
        const character = await saveMaddoxScript("character", input(0, "Personagem"), ADMIN)
        expect(character.current.version).toBe(1)
        expect((await currentMaddoxScript("scenario")).version).toBe(1)
        expect(await getMaddoxScriptVersion("character", 7)).toBeNull()
    })

    it("valida guia, tópicos repetidos e vazios", () => {
        expect(saveMaddoxScriptSchema.safeParse({ ...input(0), guide: "  " }).success).toBe(false)
        expect(saveMaddoxScriptSchema.safeParse({ ...input(0), topics: [{ id: "a", text: "x", active: true }, { id: "a", text: "y", active: true }] }).success).toBe(false)
        expect(saveMaddoxScriptSchema.safeParse({ ...input(0), topics: [{ id: "a", text: " ", active: true }] }).success).toBe(false)
        expect(saveMaddoxScriptSchema.safeParse({ ...input(0), topics: [] }).success).toBe(true)
    })
})
