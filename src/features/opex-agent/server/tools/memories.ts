import { z } from "zod"
import type { Tool } from "ai"
import { FIXED_CHANNELS, MEMORIES_EDIT_PERMISSION, MEMORIES_VIEW_PERMISSION, normalizeCategoryKey } from "@/features/engramind/constants"
import { defineTool, OpexToolError } from "./define"

/**
 * Memórias do Agente Opex no Engramind (DND-21): as ferramentas da lib (`engramindTools` de
 * `@engramind/client/ai`: `search_memories`, `get_memory`, `create_memory`) mais as categorias, todas com
 * o token do agente `dndicas/opex` (o consumo aparece na rede como dele). O agente alcança
 * `dndicas/opex/*` (no contexto) e os outros canais fixos em `manage` (só quando cita o canal). Só
 * administradores recebem estas ferramentas.
 */

const OWN = FIXED_CHANNELS.filter((channel) => channel.owner === "opex").map((channel) => `${channel.slug} (${channel.name})`).join("; ")
const MANAGED = FIXED_CHANNELS.filter((channel) => channel.owner !== "opex").map((channel) => `${channel.slug} (${channel.name})`).join("; ")
const CHANNELS_HELP = `Canais do Agente Opex: ${OWN}. Também alcança, citando o canal pelo slug: ${MANAGED}.`

type LibToolName = "search_memories" | "get_memory" | "create_memory"

async function agentTools(): Promise<Record<LibToolName, Tool>> {
    const [{ engramindAgentClient }, { engramindTools }] = await Promise.all([import("@/features/engramind/server/client"), import("@engramind/client/ai")])
    const client = await engramindAgentClient("opex")
    if (!client) throw new OpexToolError("Engramind indisponível: configure a integração em /integracoes/engramind (configuração automática).")
    return engramindTools({ client, write: true, excludeContext: false }) as Record<LibToolName, Tool>
}

async function runLibTool(name: LibToolName, input: unknown, toolCallId: string): Promise<unknown> {
    const tool = (await agentTools())[name]
    if (!tool?.execute) throw new OpexToolError("Ferramenta de memória indisponível.")
    const result = (await tool.execute(input as never, { toolCallId, messages: [], context: undefined } as never)) as { error?: string } | undefined
    if (result && typeof result === "object" && "error" in result && typeof result.error === "string") throw new OpexToolError(result.error)
    return result
}

const short = (value: string) => (value.length > 80 ? `${value.slice(0, 79)}…` : value)

const searchInput = z.object({
    query: z.string().trim().min(1).max(500).describe("O que procurar"),
    channels: z.array(z.string().trim().min(1).max(160)).max(50).optional().describe("Canais (slugs) para restringir a busca"),
    limit: z.number().int().min(1).max(20).optional(),
})
const getInput = z.object({ id: z.string().trim().min(1).max(60).describe("Id da memória (m_…)") })
const createInput = z.object({
    channel: z.string().trim().min(1).max(160).describe("Canal (slug) em que o agente escreve"),
    text: z.string().trim().min(1).describe("O fato, escrito para quem não tem o contexto da conversa"),
    category: z.string().trim().min(1).max(64).optional().describe("Chave da categoria (list_memory_categories)"),
})
const categoryInput = z.object({
    key: z.string().trim().min(1).max(40).describe("Chave em maiúsculas, dígitos e _ (ex.: GLOSSARIO)"),
    label: z.string().trim().min(1).max(80).describe("Rótulo em pt-BR (ex.: Glossário)"),
    priority: z.number().int().min(-1000).max(1000).optional().describe("Maior entra antes no contexto (padrão 0)"),
})

export const memoryTools = [
    defineTool({
        name: "search_memories",
        group: "memories",
        minRole: "admin",
        permission: MEMORIES_VIEW_PERMISSION,
        label: "Buscar memórias",
        risk: "read",
        description: `Busca memórias do Engramind (rede de memórias do dndicas) por sentido e por texto. Devolve id, título, canal, categoria e um trecho. ${CHANNELS_HELP}`,
        input: searchInput,
        execute: (input, { sessionId }) => runLibTool("search_memories", input, `${sessionId}:search`),
    }),
    defineTool({
        name: "get_memory",
        group: "memories",
        minRole: "admin",
        permission: MEMORIES_VIEW_PERMISSION,
        label: "Ler memória",
        risk: "read",
        description: "Lê uma memória do Engramind pelo id (texto completo, título, canal e categoria).",
        input: getInput,
        execute: (input, { sessionId }) => runLibTool("get_memory", input, `${sessionId}:get`),
    }),
    defineTool({
        name: "create_memory",
        group: "memories",
        minRole: "admin",
        permission: MEMORIES_EDIT_PERMISSION,
        label: "Criar memória",
        risk: "write",
        description: `Grava uma memória durável no Engramind: um fato ou instrução autossuficiente. Escolha a categoria adequada em list_memory_categories; se nenhuma servir, crie uma com create_memory_category. ${CHANNELS_HELP}`,
        input: createInput,
        summarize: (input) => `Criar a memória em ${input.channel}: "${short(input.text)}"`,
        execute: (input, { sessionId }) => runLibTool("create_memory", input, `${sessionId}:create`),
    }),
    defineTool({
        name: "list_memory_categories",
        group: "memories",
        minRole: "admin",
        permission: MEMORIES_VIEW_PERMISSION,
        label: "Listar categorias de memória",
        risk: "read",
        description: "Categorias da rede de memórias (chave, rótulo e prioridade; a primeira é a padrão). Reaproveite uma existente antes de criar outra.",
        input: z.object({}),
        async execute() {
            const { engramindAgentClient } = await import("@/features/engramind/server/client")
            const client = await engramindAgentClient("opex")
            if (!client) throw new OpexToolError("Engramind indisponível: configure a integração em /integracoes/engramind.")
            return client.categories.list()
        },
    }),
    defineTool({
        name: "create_memory_category",
        group: "memories",
        minRole: "admin",
        permission: MEMORIES_EDIT_PERMISSION,
        label: "Criar categoria de memória",
        risk: "write",
        description:
            "Cria uma categoria na rede de memórias quando nenhuma das existentes serve. As categorias são globais na rede (valem para todos os apps) e só um administrador do Opex edita ou remove: prefira reaproveitar. Repetir com os mesmos campos não duplica.",
        input: categoryInput,
        summarize: (input) => `Criar a categoria ${input.key} (${input.label})`,
        async execute(input) {
            const key = normalizeCategoryKey(input.key)
            if (!key) throw new OpexToolError(`Chave inválida (${input.key}): use maiúsculas, dígitos e _, começando por letra.`)
            const [{ engramindAgentClient }, { createCategory }] = await Promise.all([import("@/features/engramind/server/client"), import("@/features/engramind/server/categories")])
            const client = await engramindAgentClient("opex")
            if (!client) throw new OpexToolError("Engramind indisponível: configure a integração em /integracoes/engramind.")
            const outcome = await createCategory(client, { key, label: input.label, priority: input.priority ?? 0 })
            if (outcome.status === "created" || outcome.status === "exists") return { ok: true, key, created: outcome.status === "created" }
            throw new OpexToolError(outcome.message)
        },
    }),
]
