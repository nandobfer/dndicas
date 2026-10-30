import { describe, expect, it } from "vitest"
import { enabledOpexTools, opexToolMetas, toolAllowedFor, toolPermittedFor, toolMinRole, findOpexTool, OPEX_TOOLS } from "@/features/opex-agent/server/tools/registry"
import type { OpexServerScope } from "@/features/opex-agent/server/scope"

const names = (role: "admin" | "user" | "anonymous") => enabledOpexTools([], role).map((tool) => tool.name)

describe("ferramentas do Agente Opex por papel", () => {
    it("visitantes recebem só o catálogo, a documentação e o contexto", () => {
        const tools = names("anonymous")
        expect(tools).toEqual(expect.arrayContaining(["get_app_overview", "search_catalog", "get_entity", "list_app_docs", "search_app_docs", "read_app_doc"]))
        for (const blocked of ["list_my_sheets", "read_chat_file", "schedule_job", "create_feedback", "list_integrations", "create_agent_memory", "set_catalog_entity_status", "update_ai_feature_settings"]) {
            expect(tools).not.toContain(blocked)
        }
    })

    it("usuários logados ganham as próprias fichas e NPCs, arquivos e jobs, sem administração", () => {
        const tools = names("user")
        expect(tools).toEqual(expect.arrayContaining(["list_my_sheets", "update_sheet", "list_my_npcs", "read_chat_file", "schedule_job"]))
        for (const blocked of ["list_integrations", "update_integration", "run_routine", "create_agent_memory", "set_catalog_entity_status", "update_ai_feature_settings"]) {
            expect(tools).not.toContain(blocked)
        }
    })

    it("administradores recebem tudo", () => {
        expect(names("admin")).toHaveLength(opexToolMetas().length)
        expect(names("admin")).not.toContain("create_feedback")
        expect(names("admin")).not.toContain("list_feedbacks")
    })

    it("ferramentas desligadas saem do turno, menos as do grupo Contexto", () => {
        const tools = enabledOpexTools(["search_catalog", "get_app_overview"], "admin").map((tool) => tool.name)
        expect(tools).not.toContain("search_catalog")
        expect(tools).toContain("get_app_overview")
    })

    it("a revalidação por ferramenta usa o mesmo papel mínimo", () => {
        expect(toolAllowedFor(findOpexTool("update_integration")!, "user")).toBe(false)
        expect(toolAllowedFor(findOpexTool("get_my_sheet")!, "anonymous")).toBe(false)
        expect(toolAllowedFor(findOpexTool("get_entity")!, "anonymous")).toBe(true)
    })

    it("cada metadado informa quem pode usar e os nomes são únicos", () => {
        const metas = opexToolMetas()
        expect(new Set(metas.map((meta) => meta.name)).size).toBe(metas.length)
        expect(metas.find((meta) => meta.name === "list_integrations")?.minRole).toBe("admin")
        expect(metas.find((meta) => meta.name === "list_my_sheets")?.minRole).toBe("user")
        expect(metas.find((meta) => meta.name === "search_catalog")?.minRole).toBeUndefined()
    })

    describe("permissões Perfix granulares", () => {
        const scopeWith = (permissions: string[]): OpexServerScope => ({ kind: "user", actor: { id: "u1", name: "Moderador", role: "admin", permissions } })

        it("toda ferramenta administrativa exige uma permissão Perfix", () => {
            const unguarded = OPEX_TOOLS.filter((tool) => toolMinRole(tool) === "admin" && !tool.permission && !tool.permissionFor).map((tool) => tool.name)
            expect(unguarded).toEqual([])
        })

        it("perfil com só admin.access não usa ferramentas de integração, catálogo, memórias nem IA", () => {
            const moderador = scopeWith(["admin.access", "users.view"])
            const names = enabledOpexTools([], "admin", moderador).map((tool) => tool.name)
            for (const name of ["list_integrations", "list_routines", "run_routine", "list_agent_memories", "create_agent_memory", "update_ai_feature_settings", "set_catalog_entity_status"]) expect(names).not.toContain(name)
            expect(toolPermittedFor(findOpexTool("update_integration")!, moderador, { id: "pusher" })).toBe(false)
            expect(toolPermittedFor(findOpexTool("test_integration")!, moderador, { id: "pusher" })).toBe(false)
            expect(toolPermittedFor(findOpexTool("set_catalog_entity_status")!, moderador, { type: "spell", id: "x", status: "inactive" })).toBe(false)
        })

        it("a permissão da integração vale só para ela", () => {
            const pusherEditor = scopeWith(["admin.access", "integrations.access", "integrations.pusher.edit"])
            expect(toolPermittedFor(findOpexTool("update_integration")!, pusherEditor, { id: "pusher" })).toBe(true)
            expect(toolPermittedFor(findOpexTool("update_integration")!, pusherEditor, { id: "google_auth" })).toBe(false)
            expect(toolPermittedFor(findOpexTool("get_integration")!, pusherEditor, { id: "pusher" })).toBe(false)
        })

        it("o coringa libera tudo; visitantes não recebem nada administrativo", () => {
            const root = scopeWith(["*"])
            expect(enabledOpexTools([], "admin", root).map((tool) => tool.name)).toEqual(enabledOpexTools([], "admin").map((tool) => tool.name))
            expect(toolPermittedFor(findOpexTool("update_integration")!, root, { id: "pusher" })).toBe(true)
            expect(toolPermittedFor(findOpexTool("list_integrations")!, { kind: "anonymous", anonymousId: "a1" })).toBe(false)
        })
    })
})
