import { beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"

const mocks = vi.hoisted(() => ({
    doc: null as Record<string, unknown> | null,
    create: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
    getUploadUrl: vi.fn(),
    headFile: vi.fn(),
    copyFile: vi.fn(),
    deleteFile: vi.fn(),
    getFileObject: vi.fn(),
}))

vi.mock("@/lib/db/models/Opex", () => ({
    OpexFile: { create: mocks.create, updateOne: mocks.updateOne, deleteOne: mocks.deleteOne, findById: () => ({ lean: async () => mocks.doc }) },
}))
vi.mock("@/lib/storage/s3", () => ({
    getUploadUrl: mocks.getUploadUrl,
    headFile: mocks.headFile,
    copyFile: mocks.copyFile,
    deleteFile: mocks.deleteFile,
    getFileObject: mocks.getFileObject,
    storageErrorInfo: () => ({ kind: "other", httpStatus: 500 }),
}))
vi.mock("@/features/opex-agent/server/sessions", () => ({ loadSession: vi.fn(), opexDb: vi.fn(), toFileDto: (ref: unknown) => ref }))

import { completeOpexFile, normalizeOpexMediaType, opexFileContent, reserveOpexFile } from "@/features/opex-agent/server/files"

const scope = { kind: "user" as const, actor: { id: "user-1", name: "Ana", role: "user" as const } }
const limits = { maxPerMessage: 5, maxSizeMb: 10 }
const sessionId = new Types.ObjectId().toString()
const fileDoc = (extra: Record<string, unknown> = {}) => ({ _id: new Types.ObjectId(), sessionId: new Types.ObjectId(sessionId), name: "x.html", mediaType: "application/octet-stream", size: 10, key: "opex/s/f/x.html", uploadKey: "opex/tmp/f/x.html", pending: true, ready: false, ...extra })

describe("arquivos do chat do Agente Opex", () => {
    beforeEach(() => {
        mocks.getUploadUrl.mockResolvedValue("https://s3/upload")
        mocks.headFile.mockResolvedValue({ contentLength: 10, contentType: "application/octet-stream" })
        mocks.copyFile.mockResolvedValue(undefined)
    })

    it("normaliza o tipo declarado: tipos ativos e inválidos viram binário", () => {
        expect(normalizeOpexMediaType("image/png")).toBe("image/png")
        expect(normalizeOpexMediaType("Text/Plain; charset=utf-8")).toBe("text/plain")
        for (const active of ["text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/javascript", "text/javascript"]) {
            expect(normalizeOpexMediaType(active)).toBe("application/octet-stream")
        }
        expect(normalizeOpexMediaType("lixo")).toBe("application/octet-stream")
        expect(normalizeOpexMediaType(undefined)).toBe("application/octet-stream")
    })

    it("a reserva de um HTML assina o envio como binário", async () => {
        const reservation = await reserveOpexFile(sessionId, { name: "x.html", size: 10, mediaType: "text/html" }, limits, scope)
        expect(mocks.create.mock.calls[0]![0].mediaType).toBe("application/octet-stream")
        expect(mocks.getUploadUrl).toHaveBeenCalledWith(expect.stringMatching(/^opex\/tmp\//), "application/octet-stream", expect.any(Number), "browser")
        expect(reservation.headers).toEqual({ "Content-Type": "application/octet-stream" })
    })

    it("a confirmação recusa um objeto com tipo diferente do reservado e descarta a reserva", async () => {
        mocks.doc = fileDoc()
        mocks.headFile.mockResolvedValue({ contentLength: 10, contentType: "text/html" })
        await expect(completeOpexFile(String(mocks.doc._id), limits, scope)).rejects.toMatchObject({ status: 400, code: "OPEX_FILE_TYPE_MISMATCH" })
        expect(mocks.copyFile).not.toHaveBeenCalled()
        expect(mocks.deleteOne).toHaveBeenCalled()
    })

    it("a confirmação promove o arquivo mantendo o tipo reservado", async () => {
        mocks.doc = fileDoc({ mediaType: "image/png", name: "a.png" })
        mocks.headFile.mockResolvedValue({ contentLength: 10, contentType: "image/png" })
        await completeOpexFile(String(mocks.doc._id), limits, scope)
        expect(mocks.copyFile).toHaveBeenCalledWith("opex/tmp/f/x.html", "opex/s/f/x.html")
        expect(mocks.updateOne.mock.calls[0]![1].$set).toMatchObject({ ready: true, mediaType: "image/png" })
    })

    it("acima do limite descarta a reserva (413)", async () => {
        mocks.doc = fileDoc()
        mocks.headFile.mockResolvedValue({ contentLength: 50 * 1024 * 1024, contentType: "application/octet-stream" })
        await expect(completeOpexFile(String(mocks.doc._id), limits, scope)).rejects.toMatchObject({ status: 413 })
    })

    it("o conteúdo sai com nosniff e, fora de imagem/áudio/vídeo, como download", async () => {
        mocks.doc = fileDoc({ ready: true })
        mocks.getFileObject.mockResolvedValue({ body: "x", contentLength: 1 })
        const response = await opexFileContent(String(mocks.doc._id), {}, scope)
        expect(response.headers.get("x-content-type-options")).toBe("nosniff")
        expect(response.headers.get("content-disposition")).toMatch(/^attachment/)
        expect(response.headers.get("cache-control")).toMatch(/^private/)
    })
})
