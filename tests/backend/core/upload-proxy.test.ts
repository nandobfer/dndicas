import { describe, expect, it, vi } from "vitest"
import { makeRequest } from "./../helpers/http"
import { importFresh } from "../helpers/module"
import { isPrivateUploadKey, publicProxyContentType } from "@/lib/storage/public-proxy"

async function getWith(contentType: string, key: string) {
    const getFile = vi.fn().mockResolvedValue({ Body: "conteudo", ContentType: contentType })
    vi.doMock("@/core/storage/s3", () => ({ getFile, uploadFile: vi.fn(), getFileUrl: vi.fn() }))
    vi.doMock("@/core/auth/server", () => ({ auth: vi.fn() }))
    const mod = await importFresh<typeof import("@/app/api/upload/route")>("@/app/api/upload/route")
    return { response: await mod.GET(makeRequest(`http://localhost/api/upload?key=${encodeURIComponent(key)}`)), getFile }
}

describe("GET /api/upload (proxy público de arquivos)", () => {
    it("recusa chaves privadas do Agente Opex com 404, sem ler o storage", async () => {
        for (const key of ["opex/abc/def/x.html", "/opex/tmp/1/x.pdf", "rules/../opex/a/b/c"]) {
            const { response, getFile } = await getWith("text/html", key)
            expect(response.status).toBe(404)
            expect(getFile).not.toHaveBeenCalled()
        }
    })

    it("serve imagens raster inline com nosniff", async () => {
        const { response } = await getWith("image/png", "rules/u/1-a.png")
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("image/png")
        expect(response.headers.get("content-disposition")).toBe("inline")
        expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    })

    it("HTML, SVG e outros tipos saem como download binário (sem executar na origem do app)", async () => {
        for (const type of ["text/html", "image/svg+xml", "application/javascript"]) {
            const { response } = await getWith(type, "u/1-x")
            expect(response.headers.get("content-type")).toBe("application/octet-stream")
            expect(response.headers.get("content-disposition")).toBe("attachment")
            expect(response.headers.get("x-content-type-options")).toBe("nosniff")
        }
    })

    it("regras puras dos prefixos e tipos", () => {
        expect(isPrivateUploadKey("ai/generated/u/1.png")).toBe(false)
        expect(isPrivateUploadKey("opex/x")).toBe(true)
        expect(publicProxyContentType("image/webp; q=1")).toEqual({ contentType: "image/webp", inline: true })
    })
})
