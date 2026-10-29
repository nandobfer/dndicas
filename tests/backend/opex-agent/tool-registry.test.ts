import { describe, expect, it } from "vitest"
import { enabledOpexTools, opexToolMetas, toolAllowedFor, findOpexTool } from "@/features/opex-agent/server/tools/registry"

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
})
