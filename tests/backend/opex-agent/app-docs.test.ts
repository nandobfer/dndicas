import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { appDocAudience, appDocsInstructions, canReadAppDoc, isAppDocPath, searchAppDocs } from "@/features/opex-agent/app-docs"
import { listAppDocPaths, readAllowedAppDocs, readAppDoc } from "@/features/opex-agent/server/app-docs"

async function docsRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), "dndicas-docs-"))
    await mkdir(path.join(root, "modules"))
    await writeFile(path.join(root, "README.md"), "# DnDicas\n\n## Visão geral\nCompêndio de D&D.")
    await writeFile(path.join(root, "modules", "spells.md"), "# Magias\n\n## Filtros\nFiltre magias por círculo e escola.")
    await writeFile(path.join(root, "modules", "core.md"), "# Core\n\n## Banco\nConexão com o MongoDB.")
    await writeFile(path.join(root, "use-quando-desenvolver-api.md"), "# Guia de API\n\nRotas em src/app/api.")
    return root
}

describe("documentação viva do DnDicas para o Agente Opex", () => {
    it("aceita só README, guias use-*.md e modules/*.md, sem caminhos relativos", () => {
        expect(isAppDocPath("README.md")).toBe(true)
        expect(isAppDocPath("modules/spells.md")).toBe(true)
        expect(isAppDocPath("use-quando-desenvolver-api.md")).toBe(true)
        expect(isAppDocPath("../.env")).toBe(false)
        expect(isAppDocPath("modules/../../x.md")).toBe(false)
    })

    it("visitantes e usuários leem os documentos públicos; administradores, também os técnicos e os guias", () => {
        expect(canReadAppDoc("modules/spells.md", "anonymous")).toBe(true)
        expect(canReadAppDoc("modules/core.md", "user")).toBe(false)
        expect(canReadAppDoc("modules/core.md", "admin")).toBe(true)
        expect(appDocAudience("use-quando-desenvolver-api.md")).toBe("admin")
        expect(appDocAudience("modules/novo-modulo.md")).toBe("admin")
    })

    it("lista e lê do disco conforme o papel, com o mesmo erro para restrito e inexistente", async () => {
        const root = await docsRoot()
        expect(await listAppDocPaths(root)).toEqual(["README.md", "modules/core.md", "modules/spells.md", "use-quando-desenvolver-api.md"])
        expect((await readAllowedAppDocs("anonymous", root)).map((doc) => doc.path)).toEqual(["README.md", "modules/spells.md"])
        await expect(readAppDoc("modules/core.md", "user", root)).rejects.toThrow(/não encontrado ou não disponível/)
        await expect(readAppDoc("modules/inexistente.md", "admin", root)).rejects.toThrow(/não encontrado ou não disponível/)
        expect((await readAppDoc("aicontext/modules/core.md", "admin", root)).text).toContain("MongoDB")
    })

    it("busca por seção e devolve o trecho com a ocorrência", async () => {
        const docs = await readAllowedAppDocs("admin", await docsRoot())
        const [hit] = searchAppDocs(docs, "círculo escola")
        expect(hit).toMatchObject({ path: "modules/spells.md", section: "Filtros" })
        expect(hit!.snippet).toContain("círculo")
    })

    it("pede linguagem de tela para quem não administra o app", () => {
        expect(appDocsInstructions("user")).toContain("linguagem da tela")
        expect(appDocsInstructions("admin")).toContain("administra o app")
    })
})
